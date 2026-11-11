// Restore → Merge: a backup's copy of a site brought together with the
// phone's, never deleting anything on the phone; and Keep both.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Finding, FlowTest, Site, StairTest } from "../../src/db/types";
import { copiedId, copyRecords, keptCopyId, mergeChangesAnything, planMerge, type PhotoMeta, type SiteRecords } from "../../src/lib/siteMerge";

// the two copies parted when this phone backed the site up, at 100
const BASE = 100;
const NOW = 1000;

const site = (over: Partial<Site> = {}): Site => ({ id: "s", name: "Harbour Tower", address: "1 Harbour St", kind: "afss", createdAt: 1, updatedAt: 50, changedAt: 50, backedUpAt: BASE, ...over });
const finding = (id: string, updatedAt: number, note = id): Finding => ({ id, siteId: "s", note, location: "", order: 0, createdAt: 1, updatedAt });
const photo = (id: string, findingId: string, order = 0, marks?: PhotoMeta["marks"]): PhotoMeta => ({ id, findingId, siteId: "s", takenAt: 1, order, ...(marks ? { marks } : {}) });
const flow = (id: string, updatedAt: number, name = id): FlowTest => ({ id, siteId: "s", kind: "sprinkler", name, testedAt: 1, k: 0, sections: [], demand: [], order: 0, createdAt: 1, updatedAt });
const stair = (id: string, updatedAt: number, vel = "1"): StairTest => ({
  id,
  siteId: "s",
  kind: "annual",
  sections: ["vel"],
  testedAt: 1,
  doors: { st1: { G: { vel } } },
  once: {},
  notes: [],
  order: 0,
  createdAt: 1,
  updatedAt,
});
const records = (over: Partial<SiteRecords> = {}): SiteRecords => ({ site: site(), findings: [], flowTests: [], stairTests: [], photos: [], ...over });

test("the same site on both: nothing to do", () => {
  const both = records({ findings: [finding("f1", 50)], photos: [photo("p1", "f1")], flowTests: [flow("t1", 50)] });
  const m = planMerge(both, structuredClone(both), NOW);
  assert.equal(mergeChangesAnything(m), false);
  assert.equal(m.site.changedAt, 50, "an unchanged site doesn't count as changed");
});

test("nothing on the phone is deleted: phone-only findings, photos and tests stay", () => {
  const phone = records({
    findings: [finding("f1", 50), finding("mine", 150)],
    photos: [photo("p1", "f1"), photo("pm", "mine")],
    stairTests: [stair("tm", 150)],
  });
  const backup = records({ findings: [finding("f1", 50), finding("theirs", 160)], photos: [photo("p1", "f1"), photo("pt", "theirs")] });
  const m = planMerge(phone, backup, NOW);
  assert.deepEqual(m.findings.map((f) => f.id), ["theirs"]);
  assert.deepEqual(m.addPhotos.map((p) => p.id), ["pt"]);
  assert.equal(m.counts.findingsAdded, 1);
  assert.equal(m.counts.photosAdded, 1);
  assert.equal(m.counts.phoneOnlyFindings, 1);
  assert.equal(m.counts.phoneOnlyPhotos, 1);
  assert.equal(m.counts.phoneOnlyTests, 1);
  // the merge only ever writes; it has nothing that deletes
  assert.equal(Object.keys(m).some((k) => /delete|remove/i.test(k)), false);
});

test("a finding changed on one side only: that side's copy is kept, whichever is later", () => {
  // changed on the other phone after the hand-over: the backup's is taken
  let m = planMerge(records({ findings: [finding("f1", 50, "old")] }), records({ findings: [finding("f1", 150, "theirs")] }), NOW);
  assert.equal(m.findings[0]?.note, "theirs");
  assert.equal(m.counts.findingsUpdated, 1);
  // changed here after the hand-over: the phone's stays
  m = planMerge(records({ findings: [finding("f1", 150, "mine")] }), records({ findings: [finding("f1", 50, "old")] }), NOW);
  assert.deepEqual(m.findings, []);
  assert.equal(mergeChangesAnything(m), false);
});

test("a finding changed on both: the later edit is kept", () => {
  let m = planMerge(records({ findings: [finding("f1", 150, "mine")] }), records({ findings: [finding("f1", 170, "theirs")] }), NOW);
  assert.equal(m.findings[0]?.note, "theirs");
  m = planMerge(records({ findings: [finding("f1", 190, "mine")] }), records({ findings: [finding("f1", 170, "theirs")] }), NOW);
  assert.deepEqual(m.findings, []);
});

test("a test changed on both: the backup's copy is kept beside the phone's, once", () => {
  const phone = records({ stairTests: [stair("t1", 150, "1.1")], flowTests: [flow("ft", 190, "mine")] });
  const backup = records({ stairTests: [stair("t1", 170, "0.9")], flowTests: [flow("ft", 170, "theirs")] });
  const m = planMerge(phone, backup, NOW);
  // both kept, whichever is later: the phone's untouched, the backup's as a marked copy
  assert.deepEqual(m.stairTests.map((t) => [t.id, t.fromBackup]), [[keptCopyId("t1", 170), NOW]]);
  assert.deepEqual(m.flowTests.map((t) => [t.id, t.name, t.fromBackup]), [[keptCopyId("ft", 170), "theirs", NOW]]);
  assert.equal(m.counts.testsKeptBoth, 2);

  // merging the same backup again doesn't add another copy
  const after = records({ stairTests: [...phone.stairTests, ...m.stairTests], flowTests: [...phone.flowTests, ...m.flowTests] });
  const again = planMerge(after, backup, NOW);
  assert.equal(mergeChangesAnything(again), false);
  assert.equal(again.counts.phoneOnlyTests, 0, "the kept copies aren't counted as the phone's own");
});

test("a test changed on one side only: no copy, that side's is kept", () => {
  let m = planMerge(records({ stairTests: [stair("t1", 50, "1.1")] }), records({ stairTests: [stair("t1", 170, "0.9")] }), NOW);
  assert.deepEqual(m.stairTests.map((t) => [t.id, t.doors.st1.G.vel]), [["t1", "0.9"]]);
  assert.equal(m.counts.testsUpdated, 1);
  m = planMerge(records({ stairTests: [stair("t1", 150, "1.1")] }), records({ stairTests: [stair("t1", 50, "0.9")] }), NOW);
  assert.deepEqual(m.stairTests, []);
});

test("added photos go after the finding's own when their place is taken", () => {
  const phone = records({ findings: [finding("f1", 50)], photos: [photo("p1", "f1", 0), photo("mine", "f1", 1)] });
  const backup = records({ findings: [finding("f1", 50)], photos: [photo("p1", "f1", 0), photo("t1", "f1", 1), photo("t2", "f1", 2)] });
  const m = planMerge(phone, backup, NOW);
  assert.deepEqual(m.addPhotos.map((p) => [p.id, p.order]), [["t1", 2], ["t2", 3]]);
});

test("a photo's mark-up follows its finding", () => {
  const ring = [{ t: "circle" as const, cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 }];
  const phone = records({ findings: [finding("f1", 50), finding("f2", 150)], photos: [photo("p1", "f1"), photo("p2", "f2")] });
  const backup = records({ findings: [finding("f1", 170, "marked"), finding("f2", 50)], photos: [photo("p1", "f1", 0, ring), photo("p2", "f2", 0, ring)] });
  const m = planMerge(phone, backup, NOW);
  // f1's backup copy is taken, so p1's mark-up comes with it; f2's isn't
  assert.deepEqual(m.replacePhotos.map((p) => p.id), ["p1"]);
});

test("site details from whichever changed later; reports merged one by one", () => {
  const report = (id: string, updatedAt: number, name = id) => ({ id, name, findingIds: [], order: "time" as const, createdAt: 1, updatedAt });
  const phone = records({ site: site({ name: "Old name", changedAt: 150, reports: [report("r1", 150, "mine"), report("r2", 50)] }) });
  const backup = records({ site: site({ name: "New name", changedAt: 170, reports: [report("r2", 160, "theirs"), report("r3", 10)] }) });
  const m = planMerge(phone, backup, NOW);
  assert.equal(m.site.name, "New name");
  assert.deepEqual(m.site.reports?.map((r) => [r.id, r.name]), [["r1", "mine"], ["r2", "theirs"], ["r3", "r3"]]);
  assert.equal(m.site.changedAt, NOW, "a merged site counts as changed, so it's backed up again");
  assert.equal(m.site.backedUpAt, BASE, "and keeps the phone's last backup");
});

test("Keep both: the backup's copy with its own ids, the same each time", () => {
  const backup = records({
    site: site({ reports: [{ id: "r1", name: "R", findingIds: ["f1"], order: "time", createdAt: 1, updatedAt: 1 }] }),
    findings: [finding("f1", 50)],
    photos: [photo("p1", "f1")],
    stairTests: [stair("t1", 50)],
  });
  const c = copyRecords(backup, "copy", NOW);
  assert.equal(c.site.id, "copy");
  assert.equal(c.site.name, "Harbour Tower (from backup)");
  assert.equal(c.site.copyOf, "s");
  assert.equal(c.site.backedUpAt, undefined);
  assert.deepEqual(c.findings.map((f) => [f.id, f.siteId]), [[copiedId("copy", "f1"), "copy"]]);
  assert.deepEqual(c.photos.map((p) => [p.id, p.findingId, p.siteId]), [[copiedId("copy", "p1"), copiedId("copy", "f1"), "copy"]]);
  assert.deepEqual(c.stairTests.map((t) => t.id), [copiedId("copy", "t1")]);
  assert.deepEqual(c.site.reports?.[0].findingIds, [copiedId("copy", "f1")]);
  assert.deepEqual(copyRecords(backup, "copy", NOW), c);
  // the backup's own records are untouched
  assert.equal(backup.findings[0].id, "f1");
});
