// FFCP testing (pages/FfcpTest, components/FfcpList): a fire fan control
// panel job from New job; a panel test asks for its fans first (a type, then
// one number at a time or a batch), then each fan's checks are ticked or
// crossed, a cross asking why (or later), in normal and fire mode.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, { sites: [{ id: "site", name: "Westfield Tower", kind: "afss", createdAt: Date.now(), updatedAt: Date.now() }] });
});

after(async () => {
  await app?.close();
});

const tile = (name) => page.locator(".ff-tile", { hasText: name });

test("New job has an FFCP tile; home has an FFCP chip", async () => {
  await go(page, app, "/");
  await page.click('button[aria-label="New job"]');
  await page.click('button:has-text("Fire fan control panel")');
  await page.fill('input[placeholder="Site name"]', "Harbour Plaza");
  await page.click('button:has-text("Start FFCP testing")');
  await page.waitForTimeout(800);
  assert.equal(await page.getByText("No panel tests yet.").count(), 1);
  await go(page, app, "/");
  assert.equal(await page.locator('[aria-label="Show job types"] button:has-text("FFCP")').count(), 1);
});

test("a panel test from a site's Other tests: add fans one at a time and as a batch", async () => {
  await go(page, app, "/site/site/findings?tab=flow");
  await page.click('button:has-text("+ Add a test")');
  await page.click('button:has-text("Fire fan control panel (FFCP)")');
  await page.waitForTimeout(800);
  // the fans come first
  await page.locator(".ff-sheet").waitFor();
  await page.click('.ff-sheet button:has-text("SAF")');
  await page.click('button:has-text("+ Add SAF-01")');
  await page.click('button:has-text("+ Add SAF-02")');
  await page.click('.ff-nmode button:has-text("Batch")');
  await page.click('.ff-sheet button:has-text("SEF")');
  await page.click(".ff-nbox:has-text('TO')");
  await page.locator('.np-key[aria-label="3"]').dispatchEvent("pointerdown");
  await page.locator('.np-key[aria-label="Done"]').dispatchEvent("pointerdown");
  await page.waitForTimeout(300);
  await page.click('button:has-text("+ Add SEF-01 – SEF-03")');
  await page.click('button:has-text("Add 5 fans to the test")');
  await page.waitForTimeout(300);
  for (const n of ["SAF-01", "SAF-02", "SEF-01", "SEF-02", "SEF-03"]) assert.equal(await tile(n).count(), 1, n);
  assert.match(await tile("SAF-01").getAttribute("class"), /\bon\b/, "the first new fan is picked");
});

test("a cross asks why; the note shows under it, or waits as 'no note'", async () => {
  await page.click('[aria-label="Run pass"]');
  await page.click('[aria-label="Fault fail"]');
  await page.click('.ff-chips button:has-text("No light fitted")');
  await page.click('button:has-text("Save")');
  assert.equal(await page.locator(".ff-why", { hasText: "No light fitted" }).count(), 1);
  // later: the tile says it still needs one
  await page.click('[aria-label="Off fail"]');
  await page.click('button:has-text("Note later")');
  assert.match(await tile("SAF-01").innerText(), /2 fails · no note/);
  assert.equal(await page.locator(".ff-why.add").count(), 1);
  // a quick note on the fan itself
  await page.fill(".ff-notes textarea", "Label faded");
  // jump to any fan, and fire mode is its own set of checks
  await tile("SEF-02").click();
  await page.click('[aria-label="Stop pass"]');
  await page.click('.ff-seg button:has-text("Fire mode")');
  assert.match(await page.locator(".ff-seg button.on").innerText(), /0 of 25/);
});

test("it's kept: back on the job, the test's summary", async () => {
  await page.reload();
  await page.waitForTimeout(1500);
  assert.match(await tile("SAF-01").innerText(), /2 fails/);
  await page.click('button:has-text("Done")');
  await page.waitForTimeout(800);
  assert.equal(await page.getByText(/5 fans · 2 fails/).count(), 1);
  assert.deepEqual(errors, []);
});
