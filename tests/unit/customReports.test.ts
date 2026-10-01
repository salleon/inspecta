import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkGroups, bulkTicked, newSince, reportEntries } from "../../src/lib/customReports";
import type { Finding, SiteReport } from "../../src/db/types";

const f = (id: string, extra: Partial<Finding>, createdAt = 1): { finding: Finding; photos: { takenAt: number }[] } => ({
  finding: { id, siteId: "s", note: id, location: "", order: 0, createdAt, updatedAt: createdAt, ...extra } as Finding,
  photos: [{ takenAt: createdAt }],
});
const all = [
  f("a", { level: "Level 10", location: "Stair 1", defectType: "critical", esrCategory: "1.6" }, 30),
  f("b", { level: "Level 2", location: "Carpark", defectType: "recommend" }, 10),
  f("c", { level: "Level 2", location: "Stair 1", defectType: "critical", esrCategory: "3.1" }, 20),
];

test("bulk refine groups come from the findings, with counts, in order", () => {
  const g = bulkGroups(all);
  assert.deepEqual(g.map((x) => x.heading), ["", "Level", "Location", "Type", "ESR category"]);
  assert.deepEqual(g[1].options.map((o) => `${o.label} ${o.ids.length}`), ["Level 2 2", "Level 10 1"], "natural order");
  assert.deepEqual(g[3].options.map((o) => o.label), ["Critical", "Recommend"]);
  assert.deepEqual(g[4].options.map((o) => o.label), ["1.6 Fire Doors", "3.1 Illuminated exit signs"]);
  assert.deepEqual([...bulkTicked(g, new Set(["level:Level 10", "loc:Carpark"]))].sort(), ["a", "b"]);
  // nothing to group by: just Every finding
  assert.deepEqual(bulkGroups([f("x", {})]).map((x) => x.heading), [""]);
});

test("a report's findings, by time taken or in list order for ESR; new findings since", () => {
  const r: SiteReport = { id: "r", name: "R", findingIds: ["a", "b", "c"], order: "time", createdAt: 0, updatedAt: 15 };
  assert.deepEqual(reportEntries(all, r).map((e) => e.finding.id), ["b", "c", "a"]);
  assert.deepEqual(reportEntries(all, { ...r, order: "esr" }).map((e) => e.finding.id), ["a", "b", "c"]);
  assert.equal(newSince(all, { ...r, findingIds: ["b"] }), 2);
});
