// Exporting the same file again: the first keeps its name, then (1), (2)…
// so uploading a newer copy to the same folder doesn't fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { numberedExport, withCopyNumber } from "../../src/lib/exportName";

test("a number goes before the extension", () => {
  assert.equal(withCopyNumber("Coles Turramurra - Flow tests.xlsx", 0), "Coles Turramurra - Flow tests.xlsx");
  assert.equal(withCopyNumber("Coles Turramurra - Flow tests.xlsx", 1), "Coles Turramurra - Flow tests (1).xlsx");
  assert.equal(withCopyNumber("report", 2), "report (2)");
});

test("each shared copy of the same file gets the next number; a cancelled one doesn't count", () => {
  const first = numberedExport("Site A.pdf");
  assert.equal(first.name, "Site A.pdf");
  first.shared();
  assert.equal(numberedExport("Site A.pdf").name, "Site A (1).pdf"); // not shared (cancelled)
  const second = numberedExport("Site A.pdf");
  assert.equal(second.name, "Site A (1).pdf");
  second.shared();
  assert.equal(numberedExport("Site A.pdf").name, "Site A (2).pdf");
  // other files and other types count on their own
  assert.equal(numberedExport("Site A.xlsx").name, "Site A.xlsx");
  assert.equal(numberedExport("Site B.pdf").name, "Site B.pdf");
});
