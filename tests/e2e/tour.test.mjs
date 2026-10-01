// The first-time tour: offered once per phone (new users after their name,
// existing users on the first opening after the update); runs through every
// screen on a temporary Example site that's removed at the end (Done, Skip
// tour, Android back, or on the next opening if the app was closed
// mid-tour); taps only reach the tour; Settings → Replay tour.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const sites = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("sites").objectStore("sites").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.map((s) => s.name).sort();
  });

const tipTitle = async () => {
  await page.waitForTimeout(700); // screen change + the tip settling
  return page.locator('[aria-live="polite"] [role="dialog"]').getAttribute("aria-label");
};
const next = () => page.getByRole("button", { name: "Next", exact: true }).click();
const reopen = async () => {
  await page.reload();
  await page.waitForTimeout(2600);
};

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, { sites: [{ id: "real", name: "Harbour Tower", kind: "afss" }], findings: [], photos: [] });
});

after(async () => {
  await app?.close();
});

test("a new user gets the welcome once, right after entering their name", async () => {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  const fresh = await context.newPage();
  await fresh.goto(app.url + "/");
  await fresh.waitForTimeout(2600);
  await fresh.locator("input").first().fill("Leon Salvaggio");
  await fresh.keyboard.press("Enter");
  await fresh.waitForTimeout(800);
  assert.match(await fresh.locator('[role="dialog"][aria-label="Welcome"]').innerText(), /Welcome to Inspecta, Leon/);
  await fresh.getByRole("button", { name: "Skip, I'll explore" }).click();
  await fresh.reload();
  await fresh.waitForTimeout(2600);
  assert.equal(await fresh.locator('[role="dialog"][aria-label="Welcome"]').count(), 0, "only once");
  await context.close();
});

test("someone already using the app gets it once, on the next opening", async () => {
  await page.evaluate(() => localStorage.removeItem("inspecta.tourOffered")); // as before this update
  await reopen();
  assert.match(await page.locator('[role="dialog"][aria-label="Welcome"]').innerText(), /Welcome to Inspecta, Test/);
  await page.getByRole("button", { name: "Skip, I'll explore" }).click();
  await reopen();
  assert.equal(await page.locator('[role="dialog"][aria-label="Welcome"]').count(), 0, "only once");
  assert.deepEqual(await sites(), ["Harbour Tower"], "their site is untouched");
});

test("Show me around walks through every screen on an Example site, then removes it", async () => {
  await page.evaluate(() => localStorage.removeItem("inspecta.tourOffered"));
  await reopen();
  await page.getByRole("button", { name: "Show me around" }).click();
  assert.deepEqual(await sites(), ["Example site", "Harbour Tower"]);

  assert.equal(await tipTitle(), "Start an inspection");
  assert.match(new URL(page.url()).hash, /^(#\/)?$/, "on the sites screen");
  await page.mouse.click(341, 787); // the lit-up + : does nothing during the tour
  await page.waitForTimeout(300);
  assert.equal(await page.locator("text=New site").count(), 0, "taps don't reach the app");

  await next();
  assert.equal(await tipTitle(), "Log a finding");
  assert.match(page.url(), /#\/site\/[^/]+\/findings$/);
  await next();
  assert.equal(await tipTitle(), "Save & next");
  assert.match(page.url(), /\/finding\/[^/]+\/note$/);
  await next();
  assert.equal(await tipTitle(), "ESR category");
  await next();
  assert.equal(await tipTitle(), "No rush");
  await next();
  assert.equal(await tipTitle(), "Send the report");
  assert.match(page.url(), /\/findings$/);
  await next();
  assert.equal(await tipTitle(), "Settings");
  assert.match(new URL(page.url()).hash, /^(#\/)?$/, "on the sites screen");
  assert.equal(await page.getByRole("button", { name: "Skip tour" }).count(), 0, "last step: just Done");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(500);

  assert.deepEqual(await sites(), ["Harbour Tower"], "Example site gone, real site untouched");
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  assert.equal(await page.locator("text=Example site").count(), 0, "gone from the list too");
  await reopen();
  assert.equal(await page.locator('[role="dialog"][aria-label="Welcome"]').count(), 0, "not offered again");
});

test("an old Advanced controls switch-off is ignored: the ESR steps are always in", async () => {
  await page.evaluate(() => localStorage.setItem("inspecta.advancedControls", "0"));
  await reopen();
  await page.click('button[aria-label="Settings"]');
  await page.click('button:has-text("Replay tour")');
  const titles = [await tipTitle()];
  for (let i = 0; i < 3; i++) {
    await next();
    titles.push(await tipTitle());
  }
  assert.deepEqual(titles, ["Start an inspection", "Log a finding", "Save & next", "ESR category"]);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.removeItem("inspecta.advancedControls"));
});

test("Android back ends the tour, even on the finding screen", async () => {
  await reopen();
  await page.click('button[aria-label="Settings"]');
  await page.click('button:has-text("Replay tour")');
  await tipTitle();
  await next();
  await tipTitle();
  await next();
  assert.equal(await tipTitle(), "Save & next");
  await pressBack(page);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  assert.deepEqual(await sites(), ["Harbour Tower"]);
});

test("closed mid-tour: the Example site is cleared away on the next opening", async () => {
  await page.click('button[aria-label="Settings"]');
  await page.click('button:has-text("Replay tour")');
  await tipTitle();
  assert.deepEqual(await sites(), ["Example site", "Harbour Tower"]);
  await reopen(); // as if the app had been closed
  assert.deepEqual(await sites(), ["Harbour Tower"]);
  assert.equal(await page.locator("text=Example site").count(), 0);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
