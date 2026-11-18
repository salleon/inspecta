// Moving a stair along the stair test's tabs (components/StairTabs): hold a
// tab and drag it; the tabs it passes slide aside while dragging, and on
// letting go the new order is saved on the site. A tap still opens a stair,
// a quick drag still scrolls, and the open stair stays open after a move.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await go(page, app, "/", 1500);
  await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const now = Date.now();
    const st = (id, fan, name) => ({ id, name, from: "G", to: "3", extra: [], fan });
    const tx = idb.transaction(["sites", "stairTests"], "readwrite");
    tx.objectStore("sites").put({
      id: "s1",
      name: "Harbour Tower",
      address: "",
      kind: "spf",
      createdAt: now,
      updatedAt: now,
      spf: { edition: "1998", type: "Purge", notes: "", stairs: [st("a", "SPF 1", "East"), st("b", "SPF 2", "West"), st("c", "SPF 3", "Core A"), st("d", "SPF 4", "Core B")] },
    });
    tx.objectStore("stairTests").put({ id: "t1", siteId: "s1", kind: "annual", sections: ["vel"], doors: {}, once: {}, notes: [], order: 0, createdAt: now, updatedAt: now, testedAt: now });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  });
});

after(async () => {
  await app?.close();
});

const saved = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const site = await new Promise((r) => {
      const q = idb.transaction("sites").objectStore("sites").get("s1");
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return site.spf.stairs.map((s) => s.id).join("");
  });

const tab = (k) => page.locator("[data-testid=stair-tabs] [data-tab]").nth(k);
const shown = () => page.locator("[data-testid=stair-tabs] [data-tab]").evaluateAll((els) => els.map((e) => e.textContent.slice(0, 5)).join(","));
const centre = async (k) => {
  const b = await tab(k).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test("a tap opens a stair; a drag without holding moves nothing", async () => {
  await go(page, app, "/site/s1/spf/t1?stair=a", 1200);
  await tab(2).click();
  assert.match(page.url(), /stair=c/);
  const a = await centre(0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 150, a.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  assert.equal(await saved(), "abcd");
});

test("hold and drag: the stairs passed slide aside, and the order is saved on letting go", async () => {
  const a = await centre(0);
  const c = await centre(2);
  const bx0 = (await tab(1).boundingBox()).x;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.waitForTimeout(550);
  // just past SPF 3's middle: SPF 2 and SPF 3 make room on the left
  await page.mouse.move(c.x + 6, a.y, { steps: 10 });
  await page.waitForTimeout(300);
  const bx1 = (await tab(1).boundingBox()).x;
  assert.ok(bx1 < bx0 - 30, `SPF 2 slid left (${bx0} → ${bx1})`);
  // nothing saved mid-drag
  assert.equal(await saved(), "abcd");
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.equal(await saved(), "bcad");
  assert.equal(await shown(), "SPF 2,SPF 3,SPF 1,SPF 4");
  // the stair that was open is still open, and the hold didn't open the one moved
  assert.match(page.url(), /stair=c/);
});

test("dragging back to where it started changes nothing", async () => {
  const k = await centre(3);
  await page.mouse.move(k.x, k.y);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.move(k.x - 120, k.y, { steps: 6 });
  await page.mouse.move(k.x, k.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.equal(await saved(), "bcad");
  assert.deepEqual(errors, []);
});
