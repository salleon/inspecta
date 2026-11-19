// Checks the Contractor build carries none of EnFact's artwork (see
// src/edition/art.ts): no file named after it, and none of it inlined as a
// data URL in the code or styles. Usage: node scripts/check-edition.mjs dist-contractor
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: node scripts/check-edition.mjs <contractor build folder>");

const ENFACT_ART = [
  "src/assets/flow-logo.png",
  "src/assets/logo.png",
  "src/assets/enfact-wordmark.png",
  "src/assets/cover-bg-afss.jpg",
  "src/assets/cover-bg-projects.jpg",
  ...readdirSync("src/assets/splash").map((f) => `src/assets/splash/${f}`),
];

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);
const text = files.filter((f) => /\.(js|css|html)$/.test(f)).map((f) => readFileSync(f, "latin1")).join("\n");

const found = [];
for (const src of ENFACT_ART) {
  const name = path.basename(src, path.extname(src));
  if (files.some((f) => path.basename(f).startsWith(`${name}-`) && path.extname(f) === path.extname(src))) found.push(`${src} (as a file)`);
  // a run of its base64 from the middle, as an inlined data URL would hold
  const b64 = readFileSync(src).toString("base64");
  if (text.includes(b64.slice(Math.floor(b64.length / 2), Math.floor(b64.length / 2) + 120))) found.push(`${src} (inlined)`);
}
if (found.length) {
  console.error(`EnFact's artwork is in the Contractor build (${dir}):\n  ${found.join("\n  ")}`);
  process.exit(1);
}
console.log(`${dir}: none of EnFact's artwork (${ENFACT_ART.length} pieces checked)`);
