// Finding screen: the ESR "Quick add" box, picking / changing / clearing a
// category, Browse all with search, the 6.3 label, and the back button.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed, categories, pressBack, scrollFindingToBottom } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower" }],
    findings: [
      { id: "f0", siteId: "s1", note: "Fire door closer not self-closing, door held open with wedge", location: "Fire stair lobby", level: "Level 3" },
      { id: "f1", siteId: "s1", note: "AHU not shutting down in fire mode, fire damper access panel missing", location: "Plant room" },
      { id: "f2", siteId: "s1", note: "", location: "" },
    ],
    photos: [{ id: "p0", findingId: "f0", siteId: "s1" }],
  });
});

after(async () => {
  await app?.close();
});

test("Quick add starts closed, opens to suggestions, picks, changes and clears", async () => {
  await go(page, app, "/site/s1/finding/f0/note", 1500);
  await scrollFindingToBottom(page);
  assert.equal(await page.locator('button:has-text("Quick add")').count(), 1);
  assert.equal(await page.locator('button:has-text("Fire Doors")').count(), 0, "suggestions hidden until opened");

  await page.click('button:has-text("Quick add")');
  await scrollFindingToBottom(page);
  assert.equal(await page.locator('button:has-text("Fire Doors") >> text=BEST').count(), 1);

  await page.click('button:has-text("Fire Doors")');
  await page.waitForTimeout(300);
  assert.equal((await categories(page)).f0, "1.6");
  assert.equal(await page.locator('button[aria-label="Clear ESR category"]').count(), 1);

  await page.click('button:has-text("Change")');
  assert.equal(await page.locator('button:has-text("Change category")').count(), 1);
  await page.click('button:has-text("Change category")'); // folds away, keeps the pick
  assert.equal((await categories(page)).f0, "1.6");

  await page.click('button[aria-label="Clear ESR category"]');
  await page.waitForTimeout(300);
  assert.equal((await categories(page)).f0, "-");
  assert.equal(await page.locator('button:has-text("Quick add")').count(), 1);
});

test("Browse all: search and pick; 6.3 is a label, not a button", async () => {
  await go(page, app, "/site/s1/finding/f1/note", 1500);
  await page.click('button:has-text("Quick add")');
  await scrollFindingToBottom(page);
  assert.equal(await page.locator('button:has-text("Fire control operation")').count(), 0, "6.3 not pickable");
  assert.ok((await page.locator("text=Fire control operation associated").count()) >= 1, "6.3 shown as context");

  await page.click('button:has-text("Browse all")');
  await page.fill("input[type=search]", "damp");
  await page.waitForTimeout(300);
  await page.click('.sheet-panel button:has-text("Fire dampers")');
  await page.waitForTimeout(300);
  assert.equal((await categories(page)).f1, "6.3.4");
});

test("empty note shows the hint; long names wrap without overflowing", async () => {
  await go(page, app, "/site/s1/finding/f2/note", 1500);
  await page.click('button:has-text("Quick add")');
  assert.equal(await page.locator("text=Suggestions appear here as you type the note").count(), 1);
  await page.fill("#noteInput", "Smoke damper actuator not closing in fire mode");
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => [...document.querySelectorAll(".finding-scroll *")].some((e) => e.getBoundingClientRect().right > innerWidth + 1));
  assert.equal(overflow, false);
});

test("back with the category list open saves and goes to the findings list in one press", async () => {
  await go(page, app, "/site/s1/finding/f2/note", 1500);
  await page.fill("#noteInput", "typed then pressed back");
  await page.click('button:has-text("Quick add")');
  await page.click('button:has-text("Browse all")');
  await pressBack(page);
  await page.waitForURL(/#\/site\/s1\/findings$/); // saved first, then the list
  await page.locator("text=typed then pressed back").waitFor();
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
