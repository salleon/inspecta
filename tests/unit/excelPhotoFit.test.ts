import { test } from "node:test";
import assert from "node:assert/strict";
import { fitPhotos } from "../../src/lib/excelPhotoFit";

const fit = (h: number[], room: number) => fitPhotos(h, room, 189, 10);

const PORTRAIT = 252; // a 3:4 photo at 5 cm wide, px

test("two photos fit full size, two per line", () => {
  assert.deepEqual(fit([PORTRAIT, PORTRAIT], 500), { perLine: 2, scale: 1 });
});

test("three portrait photos: two per line, a little smaller, all in one row", () => {
  const { perLine, scale } = fit([PORTRAIT, PORTRAIT, PORTRAIT], 480);
  assert.equal(perLine, 2);
  assert.ok(scale < 1 && scale > 0.85);
  assert.ok(2 * PORTRAIT * scale + 10 <= 480);
});

test("many photos go more per line rather than tiny", () => {
  const { perLine, scale } = fit(Array(9).fill(PORTRAIT), 480);
  assert.ok(perLine >= 3);
  assert.ok(scale > 0.3);
});
