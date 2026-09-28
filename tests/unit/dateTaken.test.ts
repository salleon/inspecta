// The date stamp for a photo picked from the gallery: EXIF "date taken"
// first, then the file's creation date, never something implausible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateTaken } from "../../src/lib/capture";

test("EXIF DateTimeOriginal (local time) wins, as an object or a JSON string", () => {
  const want = new Date(2025, 2, 14, 9, 30, 5).getTime();
  assert.equal(dateTaken({ DateTimeOriginal: "2025:03:14 09:30:05", DateTime: "2025:06:01 10:00:00" }, "2026-01-01T00:00:00Z"), want);
  assert.equal(dateTaken(JSON.stringify({ DateTimeOriginal: "2025:03:14 09:30:05" })), want);
});

test("falls back to DateTime, then the creation date", () => {
  assert.equal(dateTaken({ DateTimeOriginal: null, DateTime: "2025:06:01 10:00:00" }), new Date(2025, 5, 1, 10).getTime());
  assert.equal(dateTaken({}, "2025-07-02T03:04:05Z"), Date.parse("2025-07-02T03:04:05Z"));
  assert.equal(dateTaken("not json", "2025-07-02T03:04:05Z"), Date.parse("2025-07-02T03:04:05Z"));
});

test("nothing usable, or implausible dates, give undefined (the app then uses now)", () => {
  assert.equal(dateTaken(undefined), undefined);
  assert.equal(dateTaken({ DateTimeOriginal: "0000:00:00 00:00:00" }), undefined);
  assert.equal(dateTaken({ DateTimeOriginal: "2099:01:01 00:00:00" }), undefined);
  assert.equal(dateTaken({}, "1970-01-01T00:00:00Z"), undefined);
});
