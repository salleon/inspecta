// Renders the in-app animations to transparent WebM videos in
// src/assets/animations, so the app plays a video (smooth even while an
// export keeps the phone busy) instead of drawing every frame. The pictures
// themselves are drawn by src/components/loaderArt.ts (export / backup
// loaders) and src/components/updateGears.ts (updating screen): change
// those, then re-run this.
//
//   FFMPEG=/path/to/ffmpeg node scripts/render-animations.mjs [name,...]
//
// Needs an ffmpeg that can read PNG and write VP8 with alpha (libvpx).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/assets/animations");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FPS = 30;

// pad: room round the picture for the bits drawn outside it [top, right,
// bottom, left]; components/animations.ts lays the video out to match
const CLIPS = [
  // loaders: one run from 0 to 100% per loop, fading out and in at the seam
  ...["conveyor", "sheet", "zip", "box"].map((art) => ({ name: art, w: 240, h: 220, seconds: 6, kind: "loader", art, pad: [100, 30, 20, 30] })),
  // updating screen: the gear riding the track (loops), then the install (plays once)
  { name: "update-download", w: 260, h: 260, seconds: 5, kind: "download", pad: [10, 10, 10, 10] },
  { name: "update-install", w: 260, h: 260, seconds: 1.6, kind: "install", pad: [10, 10, 10, 10] },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "animations-"));
fs.writeFileSync(
  path.join(tmp, "entry.ts"),
  `import { mountArt } from ${JSON.stringify(path.join(ROOT, "src/components/loaderArt"))};
import { mountGears } from ${JSON.stringify(path.join(ROOT, "src/components/updateGears"))};
Object.assign(window, { mountArt, mountGears });`,
);
await build({ entryPoints: [path.join(tmp, "entry.ts")], bundle: true, format: "iife", outfile: path.join(tmp, "art.js"), logLevel: "warning" });
fs.writeFileSync(
  path.join(tmp, "page.html"),
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;margin:40px}</style><svg id="s" xmlns="http://www.w3.org/2000/svg"></svg><script src="art.js"></script>`,
);

const only = process.argv[2]?.split(",");
const browser = await chromium.launch();
for (const clip of CLIPS) {
  if (only && !only.includes(clip.name)) continue;
  const page = await browser.newPage({ viewport: { width: clip.w * 2 + 400, height: clip.h * 2 + 400 } });
  await page.goto(`file://${path.join(tmp, "page.html")}`);
  await page.evaluate((c) => {
    const svg = document.getElementById("s");
    const [T, R, B, L] = c.pad;
    svg.setAttribute("width", String((c.w + L + R) * 2));
    svg.setAttribute("height", String((c.h + T + B) * 2));
    svg.setAttribute("viewBox", `${-L} ${-T} ${c.w + L + R} ${c.h + T + B}`);
    const clamp = (x) => Math.max(0, Math.min(1, x));
    if (c.kind === "loader") {
      const update = window.mountArt(svg, c.art);
      window.frame = (t) => {
        update(t, 100 * clamp((t - 0.4) / (c.seconds - 1.2)), undefined);
        svg.style.opacity = String(Math.min(1, t / 0.3, (c.seconds - t) / 0.35));
      };
    } else {
      const update = window.mountGears(svg);
      window.frame = (t) => (c.kind === "download" ? update(t, "downloading", 0, 100 * clamp(t / (c.seconds - 0.4))) : update(t, "installing", t, 100));
    }
  }, clip);
  const frames = [];
  for (let f = 0; f < Math.round(clip.seconds * FPS); f++) {
    await page.evaluate((t) => window.frame(t), f / FPS);
    frames.push(await page.locator("#s").screenshot({ omitBackground: true, type: "png" }));
  }
  await page.close();
  const out = path.join(OUT, `${clip.name}.webm`);
  const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "png", "-framerate", String(FPS), "-i", "-"];
  args.push("-c:v", "libvpx", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "700k", "-crf", "16", "-an", out);
  const run = spawnSync(FFMPEG, args, { input: Buffer.concat(frames), maxBuffer: 1 << 30 });
  if (run.status !== 0) throw new Error(`ffmpeg failed for ${clip.name}: ${run.stderr}`);
  console.log(`${clip.name}.webm`, `${Math.round(fs.statSync(out).size / 1024)} KB`);
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
