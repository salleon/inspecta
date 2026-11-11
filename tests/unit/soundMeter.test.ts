import { test } from "node:test";
import assert from "node:assert/strict";
import { aWeightingDb } from "../../src/lib/soundMeter";

// IEC 61672-1 A-weighting, dB
const STANDARD: [number, number][] = [
  [31.5, -39.4],
  [63, -26.2],
  [125, -16.1],
  [250, -8.6],
  [500, -3.2],
  [1000, 0],
  [2000, 1.2],
  [4000, 1.0],
  [8000, -1.1],
];

for (const fs of [44100, 48000]) {
  test(`the A-weighting filter matches the standard at ${fs} Hz`, () => {
    for (const [f, want] of STANDARD) {
      const got = aWeightingDb(f, fs);
      assert.ok(Math.abs(got - want) <= 0.5, `${f} Hz: ${got.toFixed(2)} dB, want ${want}`);
    }
  });
}
