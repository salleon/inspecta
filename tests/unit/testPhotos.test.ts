import { test } from "node:test";
import assert from "node:assert/strict";
import { findingLevel } from "../../src/lib/testPhotos";
import { photoItems } from "../../src/lib/stairPhotos";
import type { Finding, Photo } from "../../src/db/types";

test("a stair's level code as a finding's level", () => {
  assert.equal(findingLevel("12"), "Level 12");
  assert.equal(findingLevel("L3"), "Level 3");
  assert.equal(findingLevel("G"), "Ground");
  assert.equal(findingLevel("B2"), "Basement 2");
  assert.equal(findingLevel("R"), "Roof");
  assert.equal(findingLevel("M"), "Mezzanine");
  // anything else as it is
  assert.equal(findingLevel("P3"), "P3");
  assert.equal(findingLevel("Plant room"), "Plant room");
  assert.equal(findingLevel(""), undefined);
  assert.equal(findingLevel(undefined), undefined);
});

const f = (id: string, more: Partial<Finding> = {}): Finding => ({ id, siteId: "s", stairTestId: "t", note: "", location: "", order: 0, createdAt: 1, updatedAt: 1, ...more });
const photo = (id: string, findingId: string) => ({ id, findingId, siteId: "s", takenAt: 1, order: 0 }) as Photo;

test("Photos & notes as they print: numbered, place, type, the empty ones left out", () => {
  const items = photoItems([
    { finding: f("a", { level: "Level 12", location: "stair door", note: " Closer loose ", defectType: "non-critical" }), photos: [photo("p", "a")] },
    { finding: f("b", { level: "Level 4" }), photos: [] }, // nothing in it
    { finding: f("c", { location: "Roof · relief air damper", note: "Jammed" }), photos: [] },
    { finding: f("d", { level: "Level 2", location: "Level 2 lobby" }), photos: [photo("q", "d")] },
  ]);
  assert.deepEqual(
    items.map((i) => [i.n, i.place, i.type?.label, i.note, i.photos.length]),
    [
      [1, "Level 12 · stair door", "Non-critical", "Closer loose", 1],
      [2, "Roof · relief air damper", undefined, "Jammed", 0],
      [3, "Level 2 lobby", undefined, "", 1],
    ],
  );
});
