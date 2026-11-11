// Names inside a backup: a folder per site, photos named after findings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { photoFiles, safeName, siteBackupState, siteFolders } from "../../src/lib/backupNames";

test("site folders: name and address, safe on Windows, repeats numbered", () => {
  const folders = siteFolders([
    { id: "a", name: "Harbour Tower", address: "1 Harbour St" },
    { id: "b", name: "Harbour Tower", address: "1 Harbour St" },
    { id: "c", name: "harbour tower", address: "1 HARBOUR ST" },
    { id: "d", name: "Riverside Plaza", address: "" },
    { id: "e", name: 'Unit 4/12 "Main" St: Level 2?', address: "" },
    { id: "f", name: "   ", address: "" },
    { id: "g", name: "Photos", address: "" },
    { id: "h", name: "Coles.", address: "" },
  ]);
  assert.deepEqual([...folders.values()], [
    "Harbour Tower - 1 Harbour St",
    "Harbour Tower - 1 Harbour St (2)",
    "harbour tower - 1 HARBOUR ST (3)",
    "Riverside Plaza",
    "Unit 4 12 Main St Level 2",
    "Untitled site",
    "Photos",
    "Coles",
  ]);
  assert.equal(safeName("x".repeat(200)).length, 80);
});

test("photo files: finding number in order, level and note, place in the finding", () => {
  const files = photoFiles(
    [
      { id: "f2", order: 2, level: "", note: "Hose reel tag missing", location: "" },
      { id: "f1", order: 1, level: "Level 2", note: "Exit sign out\nsecond line", location: "" },
      { id: "f3", order: 3, level: "", note: "", location: "" },
      { id: "f4", order: 4, level: "Roof", note: "Same", location: "" },
      { id: "f5", order: 5, level: "Roof", note: "Same", location: "" },
    ],
    [
      { id: "p2", findingId: "f1", order: 1 },
      { id: "p1", findingId: "f1", order: 0 },
      { id: "p3", findingId: "f2", order: 0 },
      { id: "p4", findingId: "f3", order: 0 },
      { id: "p5", findingId: "f4", order: 0 },
      { id: "p6", findingId: "f5", order: 0 },
    ],
  );
  assert.deepEqual(Object.fromEntries(files), {
    p1: "photos/F01 Level 2 - Exit sign out (1)",
    p2: "photos/F01 Level 2 - Exit sign out (2)",
    p3: "photos/F02 Hose reel tag missing",
    p4: "photos/F03",
    p5: "photos/F04 Roof - Same",
    p6: "photos/F05 Roof - Same",
  });
});

test("backup state: new, changed since its backup, or saved", () => {
  assert.equal(siteBackupState({ updatedAt: 5 }), "new");
  assert.equal(siteBackupState({ updatedAt: 5, changedAt: 9, backedUpAt: 7 }), "changed");
  assert.equal(siteBackupState({ updatedAt: 5, changedAt: 6, backedUpAt: 7 }), "saved");
  assert.equal(siteBackupState({ updatedAt: 9, backedUpAt: 7 }), "changed");
});
