import { test } from "node:test";
import assert from "node:assert/strict";
import { backupDue } from "../../src/lib/backupDue";

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;

test("backup reminder: due after two weeks without one", () => {
  assert.equal(backupDue(0, 0, now), false); // nothing to back up
  assert.equal(backupDue(0, now - 3 * DAY, now), false); // new site, never backed up
  assert.equal(backupDue(0, now - 15 * DAY, now), true); // old site, never backed up
  assert.equal(backupDue(now - 2 * DAY, now - 50 * DAY, now), false); // backed up lately
  assert.equal(backupDue(now - 15 * DAY, now - 50 * DAY, now), true); // backup is stale
});
