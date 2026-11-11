// A phone updating from before per-site backups: the database upgrade
// works out each site's changedAt, and counts the sites that existed at the
// last "Back up all data" as backed up then. Sites added since, or changed
// since, show under New since last backup.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, go } from "./helpers.mjs";

let app;
let page;

const DAY = 24 * 60 * 60 * 1000;

before(async () => {
  app = await startApp(import.meta.url);
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  // the database as the previous version left it (Dexie version 8 is
  // IndexedDB version 80), made on a page of the same site that isn't the app
  await page.goto(app.url + "/favicon.svg");
  await page.evaluate(async (DAY) => {
    localStorage.setItem("inspecta.inspectorName", "Test Inspector");
    localStorage.setItem("inspecta.tourOffered", "1");
    const now = Date.now();
    localStorage.setItem("inspecta.lastBackup", String(now - 10 * DAY));
    const req = indexedDB.open("inspecta", 80);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = (name, key, indexes) => {
        const s = db.createObjectStore(name, { keyPath: key });
        for (const i of indexes) s.createIndex(i, i);
      };
      store("sites", "id", ["updatedAt", "kind"]);
      store("findings", "id", ["siteId", "createdAt", "order"]);
      store("photos", "id", ["findingId", "siteId", "order"]);
      store("thumbnails", "photoId", ["siteId"]);
      store("exportCopies", "photoId", ["siteId"]);
      store("flowTests", "id", ["siteId"]);
      store("stairTests", "id", ["siteId"]);
    };
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = idb.transaction(["sites", "findings"], "readwrite");
    const site = (id, name, createdAt, updatedAt) => tx.objectStore("sites").put({ id, name, address: "", kind: "afss", createdAt, updatedAt });
    // backed up, not touched since
    site("a", "Alpha Site", now - 40 * DAY, now - 30 * DAY);
    // backed up, then a finding edited (which didn't move updatedAt)
    site("b", "Bravo Site", now - 40 * DAY, now - 30 * DAY);
    tx.objectStore("findings").put({ id: "fb", siteId: "b", note: "edited", location: "", order: 0, createdAt: now - 40 * DAY, updatedAt: now - 2 * DAY });
    // added after the last backup
    site("c", "Charlie Site", now - 5 * DAY, now - 5 * DAY);
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  }, DAY);
  await page.goto(app.url + "/");
  await page.waitForTimeout(2300);
});

after(async () => {
  await app?.close();
});

test("after the upgrade, New since last backup lists the sites added or changed since the last backup", async () => {
  await go(page, app, "/settings/backup");
  await page.getByRole("radio", { name: /^New since last backup/ }).click();
  assert.equal(await page.getByText("Alpha Site", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Bravo Site", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Charlie Site", { exact: true }).count(), 1);
  assert.equal(await page.getByText("CHANGED", { exact: true }).count(), 1);
  assert.equal(await page.getByText("NEW", { exact: true }).count(), 1);
  // the last backup was 10 days ago: no reminder yet
  await go(page, app, "/");
  assert.equal(await page.getByTestId("backup-due").count(), 0);
});
