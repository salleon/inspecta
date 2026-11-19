// Renders each app's icons from its master artwork:
//   branding/icons/enfact/art.svg      ("Site Check + Swoosh")
//   branding/icons/contractor/art.svg  ("Site Check")
// The artwork is drawn on a 100x100 grid without a background; the navy (or
// the test apps' orange) background and each platform's padding and shape
// are added here. Change an art.svg, then run:
//
//   node scripts/render-icons.mjs
//
// and commit what it writes:
// - Android: android/app/src/<app>/res (launcher icons and the adaptive
//   icon's foreground and navy background) and <app>Staging/res (the test
//   app's legacy icons on orange; its adaptive background is orange from
//   src/staging/res, which wins over the flavor's)
// - iPhone (only EnFact is built for iPhone so far, codemagic.yaml):
//   EnFact's goes in ios/App/App/Assets.xcassets/AppIcon.appiconset;
//   Contractor's waits in branding/icons/contractor/ios
// - web: EnFact's in public/ and site/ (the website keeps copies,
//   tests/unit/siteIcons.test.ts); Contractor's in
//   branding/icons/contractor/web, which its build uses in place of
//   public/'s (vite.config.ts)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAVY = "#022A4C"; // the launcher background in every app (and the old icon's)
const ORANGE = "#C2410C"; // the test apps' (android/app/src/staging/res)
const ANDROID = path.join(ROOT, "android/app/src");

const APPS = {
  enfact: {
    ios: path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset"),
    web: [path.join(ROOT, "public"), path.join(ROOT, "site")],
  },
  contractor: {
    ios: path.join(ROOT, "branding/icons/contractor/ios"),
    web: [path.join(ROOT, "branding/icons/contractor/web")],
  },
};

// Android launcher densities: legacy icon is 48dp, adaptive foreground 108dp
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// box: the svg's viewBox size; bg: the background shape (none = transparent);
// at: where the 100x100 artwork goes [offset, scale]
function svg(art, { box = 100, bg = "square", fill = NAVY, at = [0, 1] }) {
  const back =
    bg === "square" ? `<rect width="${box}" height="${box}" fill="${fill}"/>`
    : bg === "rounded" ? `<rect width="${box}" height="${box}" rx="${box * 0.22}" fill="${fill}"/>`
    : bg === "circle" ? `<circle cx="${box / 2}" cy="${box / 2}" r="${box / 2}" fill="${fill}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}">${back}<g transform="translate(${at[0]} ${at[0]}) scale(${at[1]})">${art}</g></svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(file, markup, size, { opaque = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: !opaque });
  // App Store icons must have no alpha channel
  if (opaque) spawnSync("convert", [file, "-alpha", "off", file], { stdio: "inherit" });
}

for (const [app, out] of Object.entries(APPS)) {
  const art = fs
    .readFileSync(path.join(ROOT, `branding/icons/${app}/art.svg`), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();
  const full = svg(art, {});

  // web: full-bleed squares (iOS rounds the home-screen icon itself)
  for (const dir of out.web) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "favicon.svg"), svg(art, { bg: "rounded" }) + "\n");
    await png(path.join(dir, "icon-192.png"), full, 192);
    await png(path.join(dir, "apple-touch-icon.png"), full, 180, { opaque: true });
  }

  // iPhone: one 1024 full-bleed square
  await png(path.join(out.ios, "AppIcon-512@2x.png"), full, 1024, { opaque: true });

  // Android: legacy square and round icons, plus the adaptive foreground
  // (108dp, the art inside the 66dp safe circle so no launcher mask clips it)
  for (const [name, k] of Object.entries(DENSITIES)) {
    const res = path.join(ANDROID, app, `res/mipmap-${name}`);
    const test = path.join(ANDROID, `${app}Staging`, `res/mipmap-${name}`);
    for (const [dir, fill] of [[res, NAVY], [test, ORANGE]]) {
      await png(path.join(dir, "ic_launcher.png"), svg(art, { bg: "rounded", fill, at: [4, 0.92] }), 48 * k);
      await png(path.join(dir, "ic_launcher_round.png"), svg(art, { bg: "circle", fill, at: [7, 0.86] }), 48 * k);
    }
    await png(path.join(res, "ic_launcher_foreground.png"), svg(art, { box: 108, bg: "none", at: [22, 0.64] }), 108 * k);
  }
  fs.writeFileSync(
    path.join(ANDROID, app, "res/values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <!-- behind the adaptive icon's foreground (scripts/render-icons.mjs) -->\n    <color name="ic_launcher_background">${NAVY}</color>\n</resources>\n`,
  );
  console.log(`rendered ${app}`);
}
await browser.close();
