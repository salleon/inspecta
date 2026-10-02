// Home page: the last site sits clear of the + button, and the list bumps
// at its ends. Flow test page order: test details, demand points, graph,
// readings, comments.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, name: `Site ${i + 1}`, address: `${i + 1} George St` })),
    flowTests: [{ id: "t1", siteId: "s0", kind: "sprinkler", name: "Sprinkler", k: 534.15, testedAt: 0, order: 0, createdAt: 0, updatedAt: 0, sections: [{ name: "", rows: [] }], demand: [] }],
  });
});

after(async () => {
  await app?.close();
});

test("scrolled to the bottom, the last site is above the + button; the list bumps at its ends", async () => {
  await go(page, app, "/", 600);
  await page.reload();
  await page.waitForTimeout(800);
  const list = page.locator("text=Site 14").locator("xpath=ancestor::div[contains(@style,'overflow-y: auto')][1]");
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(300);
  const last = await page.locator("text=Site 1").first().evaluate(() => {
    const rows = [...document.querySelectorAll("*")].filter((e) => /^Site \d+$/.test(e.textContent?.trim() ?? "") && e.children.length === 0);
    return Math.max(...rows.map((r) => r.getBoundingClientRect().bottom));
  });
  const fab = await page.locator('[aria-label="Start new site inspection"]').boundingBox();
  assert.ok(last < fab.y, `last row ends ${last}, + starts ${fab.y}`);
  // a wheel past the bottom bumps
  await list.hover();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(60);
  assert.equal(await list.evaluate((el) => el.classList.contains("bump-bottom")), true);
});

test("flow test page: test details, demand points, graph, readings, comments", async () => {
  await go(page, app, "/site/s0/flow/t1", 900);
  const y = (sel) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top + document.querySelector("[style*='overflow-y: auto']").scrollTop);
  const order = [await y("text=Test details"), await y("text=Demand points"), await y('div[style*="height: 230px"]'), await y("text=Readings ·"), await y('[aria-label="Comments"]')];
  assert.deepEqual([...order].sort((a, b) => a - b), order, JSON.stringify(order));
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
