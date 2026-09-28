// The pen part of "Save & next" / "New finding": a finding without a photo,
// no camera, keyboard up on the note. An empty one isn't kept when left.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed, categories, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const findingIds = async () => Object.keys(await categories(page)).sort();
const newFindingId = async (before) => (await findingIds()).find((id) => !before.includes(id));
const focusedId = () => page.evaluate(() => document.activeElement?.id);

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower" }],
    findings: [{ id: "f0", siteId: "s1", note: "Exit sign not illuminated", level: "Level 3" }],
    photos: [{ id: "p0", findingId: "f0", siteId: "s1" }],
  });
});

after(async () => {
  await app?.close();
});

test("finding screen: the pen saves and opens a blank finding, level carried, keyboard on the note", async () => {
  await go(page, app, "/site/s1/finding/f0/note", 1500);
  const before = await findingIds();
  await page.click('button[aria-label="Save and next finding without a photo"]');
  await page.waitForURL((u) => !u.hash.includes("/finding/f0/"));
  await page.waitForTimeout(400);
  const id = await newFindingId(before);
  assert.ok(id, "a new finding was made");
  assert.match(page.url(), new RegExp(`/finding/${id}/note$`));
  assert.equal(await focusedId(), "noteInput");
  assert.equal(await page.inputValue("#levelInput"), "3", "Level 3 carried over");
  assert.equal(await page.locator("text=Tap to add picture").count(), 0, "photo box collapsed while typing");

  await page.keyboard.type("Emergency lighting test overdue");
  await page.click('button:has-text("Save & close")');
  await page.waitForURL(/#\/site\/s1\/findings$/);
  await page.locator("text=Emergency lighting test overdue").waitFor();
  assert.equal((await findingIds()).length, 2);
});

test("findings list: the pen opens a blank finding; left empty, it isn't kept", async () => {
  await go(page, app, "/site/s1/findings");
  const before = await findingIds();
  await page.click('button[aria-label="New finding without a photo"]');
  await page.waitForURL(/\/finding\/[^/]+\/note$/);
  await page.waitForTimeout(400);
  assert.equal(before.length + 1, (await findingIds()).length);
  assert.equal(await focusedId(), "noteInput");

  await pressBack(page);
  await page.waitForURL(/#\/site\/s1\/findings$/);
  assert.deepEqual(await findingIds(), before, "the empty finding was removed");
});

test("the main part still opens the camera", async () => {
  await go(page, app, "/site/s1/findings");
  assert.equal(await page.locator('button:has-text("New finding")').count(), 1);
  await go(page, app, "/site/s1/finding/f0/note", 1500);
  assert.equal(await page.getByRole("button", { name: "Save & next", exact: true }).count(), 1);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
