// The home page (pages/Dashboard): every job in one list, most recently
// edited first whatever its type, each row tagged with its type. The chips
// under the search show only the types picked (none picked: all), and
// reset to the whole list when the app opens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

const DAY = 86400000;
const NOW = Date.now();
const ago = (days) => NOW - days * DAY;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [
      { id: "old-afss", name: "Bondi Junction Plaza", kind: "afss", createdAt: ago(40), updatedAt: ago(12) },
      { id: "new-stair", name: "Harbour Tower", kind: "spf", createdAt: ago(30), updatedAt: ago(0.1) },
      { id: "flow", name: "Riverside Apartments", kind: "flow", createdAt: ago(3), updatedAt: ago(1) },
      { id: "proj", name: "Barangaroo Fit-out", kind: "project", createdAt: ago(2), updatedAt: ago(2) },
      { id: "afss", name: "Westfield Parramatta", kind: "afss", createdAt: ago(5), updatedAt: ago(0.5) },
    ],
  });
});

after(async () => {
  await app?.close();
});

const order = () => page.locator("[data-site-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-site-id")));
const chip = (label) => page.locator(`[role="group"][aria-label="Show job types"] button:has-text("${label}")`);

test("one list, most recently edited first, whatever the type", async () => {
  await go(page, app, "/");
  await page.reload();
  await page.locator("[data-site-id]").first().waitFor();
  assert.deepEqual(await order(), ["new-stair", "afss", "flow", "proj", "old-afss"]);
  // no group headings any more
  assert.equal(await page.getByText("Stair pressurisation", { exact: true }).count(), 0);
  // the date on a row is still when the job was made
  const created = new Date(ago(30)).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  assert.equal(await page.locator('[data-site-id="new-stair"]').getByText(created).count(), 1);
});

test("chips show only the types picked; tapping again drops one", async () => {
  await chip("Stair").click();
  assert.deepEqual(await order(), ["new-stair"]);
  assert.equal(await chip("Stair").getAttribute("aria-pressed"), "true");
  await chip("AFSS").click();
  assert.deepEqual(await order(), ["new-stair", "afss", "old-afss"]);
  await chip("Stair").click();
  assert.deepEqual(await order(), ["afss", "old-afss"]);
  await chip("AFSS").click();
  assert.equal((await order()).length, 5, "none picked: every job");
});

test("chips work with the search, with a way back when nothing's left", async () => {
  await page.fill('input[placeholder="Search sites"]', "harbour");
  await chip("Flow").click();
  assert.deepEqual(await order(), []);
  assert.equal(await page.getByText("No jobs of that type match your search.").count(), 1);
  await page.click('button:has-text("Show all")');
  assert.deepEqual(await order(), ["new-stair"]);
  await page.fill('input[placeholder="Search sites"]', "");
});

test("the chips reset to the whole list when the app opens", async () => {
  await chip("Projects").click();
  assert.deepEqual(await order(), ["proj"]);
  await page.reload();
  await page.locator("[data-site-id]").first().waitFor();
  assert.equal((await order()).length, 5);
  assert.equal(await chip("Projects").getAttribute("aria-pressed"), "false");
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
