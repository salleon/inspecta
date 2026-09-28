// A site's Notepad: pinned above the findings, a blank page that saves as
// you type and on the way out (back arrow or Android back), and never part
// of the findings themselves.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const storedNotes = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const site = await new Promise((r) => {
      const q = idb.transaction("sites").objectStore("sites").get("s1");
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return site.notes;
  });

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower" }, { id: "s2", name: "Empty Site" }],
    findings: [{ id: "f0", siteId: "s1", note: "Exit sign not illuminated" }],
    photos: [{ id: "p0", findingId: "f0", siteId: "s1" }],
  });
});

after(async () => {
  await app?.close();
});

test("the Notepad row sits above the findings, with a hint while empty", async () => {
  await go(page, app, "/site/s1/findings");
  const row = page.locator('button[aria-label="Open notepad"]');
  assert.equal(await row.count(), 1);
  assert.match(await row.innerText(), /General notes for this site\. Not included in reports/);
  const [notepadTop, findingTop] = await Promise.all([row.evaluate((e) => e.getBoundingClientRect().top), page.locator("text=Exit sign not illuminated").evaluate((e) => e.getBoundingClientRect().top)]);
  assert.ok(notepadTop < findingTop, "above the findings");
  await go(page, app, "/site/s2/findings");
  assert.equal(await page.locator('button[aria-label="Open notepad"]').count(), 1, "shown even with no findings");
});

test("type, back arrow: saved, and the row shows the start of it", async () => {
  await go(page, app, "/site/s1/findings");
  await page.click('button[aria-label="Open notepad"]');
  await page.waitForURL(/#\/site\/s1\/notes$/);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Notepad", "keyboard up on the page");
  await page.keyboard.type("Check FER for stair 2 pressurisation");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ask BM for sprinkler log");
  await page.click('button[aria-label="Save and back to findings"]'); // straight away, before the autosave
  await page.waitForURL(/#\/site\/s1\/findings$/);
  assert.equal(await storedNotes(), "Check FER for stair 2 pressurisation\nAsk BM for sprinkler log");
  assert.match(await page.locator('button[aria-label="Open notepad"]').innerText(), /Check FER for stair 2/);
});

test("saves as you type, and Android back saves and goes to the findings", async () => {
  await go(page, app, "/site/s1/notes");
  assert.equal(await page.inputValue('textarea[aria-label="Notepad"]'), "Check FER for stair 2 pressurisation\nAsk BM for sprinkler log");
  await page.keyboard.type("\nDoor 3.04 closer");
  await page.waitForTimeout(900);
  assert.equal(await page.locator("text=Saved ✓").count(), 1);
  assert.match(await storedNotes(), /Door 3\.04 closer$/);

  await page.keyboard.type(" - recheck");
  await pressBack(page);
  await page.waitForURL(/#\/site\/s1\/findings$/);
  assert.match(await storedNotes(), /Door 3\.04 closer - recheck$/);
});

test("the Notepad isn't a finding", async () => {
  const findings = await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("findings").objectStore("findings").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.filter((f) => f.siteId === "s1").length;
  });
  assert.equal(findings, 1);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
