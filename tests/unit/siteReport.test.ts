import { test } from "node:test";
import assert from "node:assert/strict";
import { cardRows } from "../../src/lib/siteReportPdf";
import type { Finding } from "../../src/db/types";

const f = (id: string, o: Partial<Finding> = {}): Finding => ({ id, siteId: "s", note: id, location: "", order: 0, createdAt: 0, updatedAt: 0, ...o });
const e = (finding: Finding) => ({ finding, photos: [] });

test("site report cards: AFSS under ESR headings with the Excel's refs; a Project report numbered 1, 2, 3", () => {
  const afss = cardRows([e(f("a", { esrCategory: "1.8" })), e(f("b", { esrCategory: "1.8" })), e(f("c", { esrCategory: "3.1", defectType: "rectified" })), e(f("d"))], "afss");
  assert.deepEqual(
    afss.map((r) => (r.kind === "heading" ? r.heading!.kind : `${r.entry!.finding.id}:${r.ref ?? ""}`)),
    ["section", "item", "a:1.8.1", "b:1.8.2", "section", "item", "c:3.1.1", "uncategorised", "d:"],
    "re-inspected defects stay under their headings; uncategorised has no ref",
  );
  const project = cardRows([e(f("x", { esrCategory: "1.8" })), e(f("y"))], "project");
  assert.deepEqual(project.map((r) => r.ref), ["1", "2"]);
  assert.ok(project.every((r) => r.kind === "card"), "no ESR headings");
});
