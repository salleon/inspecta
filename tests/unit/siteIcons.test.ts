// The website (site/, served by Cloudflare Pages straight from the folder,
// with no build step) keeps its own copies of the app's icons. They must
// match the app's: after changing an icon in public/, copy it into site/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const name of ["icon-192.png", "favicon.svg", "apple-touch-icon.png"]) {
  test(`site/${name} is the same as public/${name}`, () => {
    assert.ok(readFileSync(`site/${name}`).equals(readFileSync(`public/${name}`)), `copy public/${name} into site/`);
  });
}
