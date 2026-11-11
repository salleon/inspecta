// Finding screen saving: nothing is deleted or overwritten before the
// finding has loaded (backing out fast right after a photo), typing is
// saved after a short pause without leaving, and opening a finding then
// leaving it unchanged writes nothing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

const finding = (id) =>
  page.evaluate(async (id) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = idb.transaction(["findings", "photos", "sites"]);
    const get = (store, key) => new Promise((r) => (tx.objectStore(store).get(key).onsuccess = (e) => r(e.target.result)));
    const f = await get("findings", id);
    const photos = await new Promise((r) => (tx.objectStore("photos").index("findingId").count(id).onsuccess = (e) => r(e.target.result)));
    const site = f ? await get("sites", f.siteId) : undefined;
    idb.close();
    return f ? { note: f.note, location: f.location, updatedAt: f.updatedAt, photos, siteChangedAt: site?.changedAt } : null;
  }, id);

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower" }],
    findings: [
      { id: "f0", siteId: "s1", note: "", location: "" },
      { id: "f1", siteId: "s1", note: "", location: "" },
      { id: "f2", siteId: "s1", note: "Exit sign out", location: "Level 2" },
      { id: "f3", siteId: "s1", note: "", location: "" },
    ],
    photos: [{ id: "p0", findingId: "f0", siteId: "s1" }],
  });
});

after(async () => {
  await app?.close();
});

test("backing out before the finding has loaded keeps it and its photo", async () => {
  await go(page, app, "/site/s1/findings");
  // hold the database busy (as background photo work on a slow phone
  // does), open the finding, and press back while it can't load yet
  await page.evaluate(() => {
    const req = indexedDB.open("inspecta");
    req.onsuccess = () => {
      const idb = req.result;
      const tx = idb.transaction(["findings", "photos"], "readwrite");
      const until = Date.now() + 1500;
      const spin = () => {
        if (Date.now() < until) tx.objectStore("findings").get("f0").onsuccess = spin;
      };
      spin();
      tx.oncomplete = () => idb.close();
      location.hash = "#/site/s1/finding/f0/note";
      setTimeout(() => window.__pressBack(), 400);
    };
  });
  await page.waitForTimeout(2500);
  const f = await finding("f0");
  assert.ok(f, "the finding is still there");
  assert.equal(f.photos, 1);
});

test("a finding left empty is still removed once it has loaded", async () => {
  await go(page, app, "/site/s1/finding/f3/note", 1500);
  await page.evaluate(() => window.__pressBack());
  await page.waitForTimeout(800);
  assert.equal(await finding("f3"), null);
});

test("typed text is saved after a short pause, without leaving", async () => {
  await go(page, app, "/site/s1/finding/f1/note", 1500);
  await page.locator("#noteInput").pressSequentially("Hose reel tag missing", { delay: 20 });
  await page.locator("#locationInput").fill("Basement");
  await page.waitForTimeout(1500);
  const f = await finding("f1");
  assert.equal(f.note, "Hose reel tag missing");
  assert.equal(f.location, "Basement");
  // and survives a reload (as after a crash or an update's restart)
  await page.reload();
  await page.waitForTimeout(2500);
  assert.equal(await page.locator("#noteInput").inputValue(), "Hose reel tag missing");
});

test("opening a finding and leaving it unchanged writes nothing", async () => {
  const before = await finding("f2");
  await go(page, app, "/site/s1/finding/f2/note", 1500);
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__pressBack());
  await page.waitForTimeout(800);
  const after = await finding("f2");
  assert.equal(after.updatedAt, before.updatedAt);
  assert.equal(after.siteChangedAt, before.siteChangedAt);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
