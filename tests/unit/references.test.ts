import { test } from "node:test";
import assert from "node:assert/strict";
import { noteReference } from "../../src/lib/esrCategories";

test("reads old report numbers level by level", () => {
  assert.deepEqual(noteReference("1.8.1 still present"), { code: "1.8", ref: "1.8.1" });
  assert.deepEqual(noteReference("6.3.4.2 rectified"), { code: "6.3.4", ref: "6.3.4.2" });
  assert.deepEqual(noteReference("1.10.3"), { code: "1.10", ref: "1.10.3" }); // not 1.1
  assert.deepEqual(noteReference("13.2 rectified"), { code: "13", ref: "13.2" });
  assert.deepEqual(noteReference("4.1.2 not fixed"), { code: "4", ref: "4.1.2" }); // 4.1 was removed
  assert.deepEqual(noteReference("1.8"), { code: "1.8" });
  assert.deepEqual(noteReference("Refer 1.6.3 last year"), { code: "1.6", ref: "1.6.3" });
});

test("ignores measurements and other numbers", () => {
  for (const note of ["Door gap 2.5mm", "2.5mm gap at base", "2.4 m high balustrade", "1.5 metres wide", "Balustrade 1.2 m high", "25.09.26 inspection"]) {
    assert.equal(noteReference(note), undefined, note);
  }
});
