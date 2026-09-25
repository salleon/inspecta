// Upgrading from an older release: a version-4 database with a finding
// tagged 4.1 (since removed) opens as version 5 with it moved to 4, and a
// keyword change saved against 4.1 moves to 4 too.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers.mjs";

let app;
let page;

before(async () => {
  app = await startApp(import.meta.url);
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  // a page on the app's origin that doesn't run the app
  await page.goto(app.url + "/favicon.svg");
  await page.evaluate(async () => {
    const req = indexedDB.open("inspecta", 40); // Dexie version 4
    req.onupgradeneeded = () => {
      const db = req.result;
      const s = db.createObjectStore("sites", { keyPath: "id" });
      s.createIndex("updatedAt", "updatedAt");
      s.createIndex("kind", "kind");
      const f = db.createObjectStore("findings", { keyPath: "id" });
      f.createIndex("siteId", "siteId");
      f.createIndex("createdAt", "createdAt");
      f.createIndex("order", "order");
      const ph = db.createObjectStore("photos", { keyPath: "id" });
      ph.createIndex("findingId", "findingId");
      ph.createIndex("siteId", "siteId");
      ph.createIndex("order", "order");
      const t = db.createObjectStore("thumbnails", { keyPath: "photoId" });
      t.createIndex("siteId", "siteId");
    };
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const now = Date.now();
    const tx = db.transaction(["sites", "findings"], "readwrite");
    tx.objectStore("sites").put({ id: "s1", name: "Harbour Tower", address: "", kind: "afss", createdAt: now, updatedAt: now });
    tx.objectStore("findings").put({ id: "f0", siteId: "s1", note: "Emergency light not working", location: "", order: 0, createdAt: now, updatedAt: now, esrCategory: "4.1" });
    tx.objectStore("findings").put({ id: "f1", siteId: "s1", note: "Exit sign out", location: "", order: 1, createdAt: now, updatedAt: now, esrCategory: "3.1" });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
    localStorage.setItem("inspecta.inspectorName", "Test Inspector");
    localStorage.setItem("inspecta.esrKeywordEdits", JSON.stringify({ "4.1": { added: [{ text: "spit fire", kind: "" }], removed: [] } }));
  });
});

after(async () => {
  await app?.close();
});

test("opens the old database, moves 4.1 to 4, keeps the rest", async () => {
  await page.goto(app.url + "/#/site/s1/export");
  await page.waitForTimeout(3500);
  const state = await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = db.transaction("findings").objectStore("findings").getAll();
      q.onsuccess = () => r(q.result);
    });
    const version = db.version;
    db.close();
    return { version, cats: Object.fromEntries(all.map((f) => [f.id, f.esrCategory])) };
  });
  assert.equal(state.version, 50);
  assert.deepEqual(state.cats, { f0: "4", f1: "3.1" });
  assert.equal(await page.locator("text=4 · Emergency Lighting").count(), 1, "shown under section 4 in the preview");
});

test("a keyword change saved against 4.1 now belongs to 4", async () => {
  await page.goto(app.url + "/#/admin/keywords");
  await page.waitForTimeout(2500);
  for (const d of "2021") await page.click(`button[aria-label="${d}"]`);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('button:has-text("Emergency Lighting") >> text=EDITED').count(), 1);
});
