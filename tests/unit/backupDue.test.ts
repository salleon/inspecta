import { test } from "node:test";
import assert from "node:assert/strict";
import { backupDue } from "../../src/lib/backupDue";

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;
const site = (createdAt: number, changedAt: number, backedUpAt?: number) => ({ createdAt, updatedAt: createdAt, changedAt, backedUpAt });

test("backup reminder: once a month, for sites with something not in any backup", () => {
  assert.equal(backupDue([], now), false); // nothing to back up
  assert.equal(backupDue([site(now - 20 * DAY, now - 20 * DAY)], now), false); // never backed up, added 20 days ago
  assert.equal(backupDue([site(now - 31 * DAY, now - 31 * DAY)], now), true); // never backed up, added a month ago
  assert.equal(backupDue([site(now - 90 * DAY, now - 1 * DAY, now - 20 * DAY)], now), false); // changed, backed up 20 days ago
  assert.equal(backupDue([site(now - 90 * DAY, now - 1 * DAY, now - 31 * DAY)], now), true); // changed, last backup a month ago
  assert.equal(backupDue([site(now - 90 * DAY, now - 60 * DAY, now - 50 * DAY)], now), false); // nothing changed since its backup
  // one stale site is enough
  assert.equal(backupDue([site(now - 90 * DAY, now - 60 * DAY, now - 50 * DAY), site(now - 40 * DAY, now - 40 * DAY)], now), true);
});

test("sites from before changedAt existed use updatedAt", () => {
  assert.equal(backupDue([{ createdAt: now - 90 * DAY, updatedAt: now - 2 * DAY, backedUpAt: now - 40 * DAY }], now), true);
  assert.equal(backupDue([{ createdAt: now - 90 * DAY, updatedAt: now - 45 * DAY, backedUpAt: now - 40 * DAY }], now), false);
});
