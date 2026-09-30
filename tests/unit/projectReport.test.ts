// Projects reports: ordered by when the photos were taken, no ESR categories.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forProjectReport } from "../../src/lib/projectReport";
import type { Finding } from "../../src/db/types";

const f = (id: string, createdAt: number, esrCategory?: string) => ({ id, createdAt, esrCategory }) as unknown as Finding;

test("sorted by earliest photo, note-only findings by when written, ties keep list order", () => {
  const out = forProjectReport([
    { finding: f("a", 1, "1.6"), photos: [{ takenAt: 500 }, { takenAt: 300 }] },
    { finding: f("b", 100), photos: [{ takenAt: 200 }] },
    { finding: f("c", 250), photos: [] },
    { finding: f("d", 5), photos: [{ takenAt: 200 }] },
  ]);
  assert.deepEqual(out.map((e) => e.finding.id), ["b", "d", "c", "a"]);
  assert.equal(out[3].finding.esrCategory, undefined, "categories dropped");
});
