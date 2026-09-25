// Settings: the build label, and Back up all data → wipe → Restore, which
// must bring back every site, finding and photo exactly, and never
// duplicate or overwrite on a second restore.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startApp, openPage, go, seed, download } from "./helpers.mjs";

let app;
let page;
let errors;
let backupPath;

// everything that matters, with a fingerprint of each photo's bytes
const snapshot = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = (s) =>
      new Promise((r) => {
        const q = idb.transaction(s).objectStore(s).getAll();
        q.onsuccess = () => r(q.result);
      });
    const sites = await all("sites");
    const findings = await all("findings");
    const photos = await all("photos");
    const hashes = [];
    for (const ph of photos.sort((a, b) => a.id.localeCompare(b.id))) {
      const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await ph.blob.arrayBuffer()));
      hashes.push([ph.id, ph.findingId, ph.siteId, ph.takenAt, ph.order, ph.blob.type, d.slice(0, 8).join(",")]);
    }
    idb.close();
    const strip = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    return JSON.stringify({ sites: sites.map(strip).sort(), findings: findings.map(strip).sort(), hashes });
  });

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [
      { id: "s1", name: "Harbour Tower", address: "1 Harbour St" },
      { id: "s2", name: "Riverside Plaza", kind: "project" },
    ],
    findings: [
      { id: "f0", siteId: "s1", note: "Exit sign out", esrCategory: "3.1", level: "Level 2", defectType: "critical" },
      { id: "f1", siteId: "s1", note: "1.8.1 still present", esrCategory: "1.8" },
      { id: "f2", siteId: "s2", note: "Hose reel tag missing" },
    ],
    photos: [
      { id: "p0", findingId: "f0", siteId: "s1", color: "#a33" },
      { id: "p1", findingId: "f0", siteId: "s1", color: "#3a3", order: 1 },
      { id: "p2", findingId: "f2", siteId: "s2", color: "#33a" },
    ],
  });
});

after(async () => {
  await app?.close();
});

test("Settings shows the build label from BUILD_LABEL", async () => {
  await go(page, app, "/");
  await page.click('button[aria-label="Settings"]');
  const label = (await readFile(new URL("../../BUILD_LABEL", import.meta.url), "utf8")).trim();
  assert.equal(await page.locator(`text=Inspecta · Build ${label}`).count(), 1);
});

test("back up, wipe, restore: everything comes back identical", async () => {
  const before = await snapshot();
  const file = await download(page, () => page.click('button:has-text("Back up all data")'));
  assert.match(file.name, /^inspecta-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  backupPath = file.path;

  await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = idb.transaction(["sites", "findings", "photos", "thumbnails"], "readwrite");
    for (const s of ["sites", "findings", "photos", "thumbnails"]) tx.objectStore(s).clear();
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  });
  await go(page, app, "/");
  assert.equal(await page.locator("text=Harbour Tower").count(), 0, "wiped");

  await page.click('button[aria-label="Settings"]');
  await page.setInputFiles('input[type=file][accept*=".zip"]', backupPath);
  await page.waitForTimeout(400);
  assert.match(await page.locator("text=This adds").innerText(), /2 sites \(3 findings, 3 photos\)/);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.waitForTimeout(1200);
  assert.match(await page.locator("text=Added").innerText(), /Added 2 sites, 3 findings and 3 photos/);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(await snapshot(), before);
});

test("restoring the same backup again adds nothing and overwrites nothing", async () => {
  const before = await snapshot();
  await page.setInputFiles('input[type=file][accept*=".zip"]', backupPath);
  await page.waitForTimeout(400);
  assert.equal(await page.locator("text=Every site in this backup is already on this phone").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Cancel" }).count(), 0);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(await snapshot(), before);
});

test("a file that isn't a backup is refused", async () => {
  await page.setInputFiles('input[type=file][accept*=".zip"]', { name: "notes.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("text=isn't an Inspecta backup").count(), 1);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
