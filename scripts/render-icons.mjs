// Renders the app icons for both editions from their master artwork:
//   branding/icons/contractor/art.svg  ("Site Check")
//   branding/icons/enfact/art.svg      ("Site Check + Swoosh")
// into branding/icons/<edition>/{android,ios,web}. The artwork is drawn on a
// 100x100 grid without a background; the navy background and each
// platform's padding and shape are added here.
//
//   node scripts/render-icons.mjs [contractor|enfact ...]
//
// The outputs are laid out the way each platform's folder expects, so an
// edition's build copies them over android/app/src/main/res, the iOS
// AppIcon.appiconset and public/.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = path.join(ROOT, "branding/icons");
const BG = "#022A4C"; // the current icon's navy (android ic_launcher_background)
const EDITIONS = process.argv.slice(2).length ? process.argv.slice(2) : ["contractor", "enfact"];

// Android launcher densities: legacy icon is 48dp, adaptive foreground 108dp
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// box: the svg's viewBox size; bg: the background shape (none = transparent);
// art: where the 100x100 artwork goes [offset, scale]
function svg(art, { box = 100, bg = "square", at = [0, 1] }) {
  const back =
    bg === "square" ? `<rect width="${box}" height="${box}" fill="${BG}"/>`
    : bg === "rounded" ? `<rect width="${box}" height="${box}" rx="${box * 0.22}" fill="${BG}"/>`
    : bg === "circle" ? `<circle cx="${box / 2}" cy="${box / 2}" r="${box / 2}" fill="${BG}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}">${back}<g transform="translate(${at[0]} ${at[0]}) scale(${at[1]})">${art}</g></svg>`;
}

const page = await (await chromium.launch()).newPage();
async function png(file, markup, size, { opaque = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: !opaque });
  // App Store icons must have no alpha channel
  if (opaque) spawnSync("convert", [file, "-alpha", "off", file], { stdio: "inherit" });
}

for (const edition of EDITIONS) {
  const dir = path.join(ICONS, edition);
  const art = fs.readFileSync(path.join(dir, "art.svg"), "utf8").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<!--[\s\S]*?-->/g, "").trim();

  // web (public/): full-bleed squares; the maskable one keeps the art in the 80% safe zone
  const full = svg(art, {});
  fs.mkdirSync(path.join(dir, "web"), { recursive: true });
  fs.writeFileSync(path.join(dir, "web/favicon.svg"), svg(art, { bg: "rounded" }) + "\n");
  await png(path.join(dir, "web/icon-192.png"), full, 192);
  await png(path.join(dir, "web/icon-512.png"), full, 512);
  await png(path.join(dir, "web/apple-touch-icon.png"), full, 180, { opaque: true });
  await png(path.join(dir, "web/icon-maskable-512.png"), svg(art, { at: [10, 0.8] }), 512);

  // iOS: one 1024 full-bleed square; iOS rounds the corners itself
  await png(path.join(dir, "ios/AppIcon-512@2x.png"), full, 1024, { opaque: true });

  // Android: legacy square and round icons, plus the adaptive foreground
  // (108dp, art inside the 66dp safe circle so no launcher mask clips it)
  for (const [name, k] of Object.entries(DENSITIES)) {
    const res = path.join(dir, `android/res/mipmap-${name}`);
    await png(path.join(res, "ic_launcher.png"), svg(art, { bg: "rounded", at: [4, 0.92] }), 48 * k);
    await png(path.join(res, "ic_launcher_round.png"), svg(art, { bg: "circle", at: [7, 0.86] }), 48 * k);
    await png(path.join(res, "ic_launcher_foreground.png"), svg(art, { box: 108, bg: "none", at: [22, 0.64] }), 108 * k);
  }
  fs.mkdirSync(path.join(dir, "android/res/values"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "android/res/values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
  );
  console.log(`rendered ${edition}`);
}
await page.context().browser().close();
