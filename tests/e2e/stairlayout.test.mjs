// The stair readings screen on a phone with a gesture bar (Capacitor's
// --safe-area-inset-bottom): the lowest level clears the stair bar, and the
// level being typed shows above the keypad, the top block scrolling away.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go } from "./helpers.mjs";

let app;
let page;
let errors;

const stair = (id, fan, from, to) => ({ id, name: "", from, to, extra: [], fan, reviewed: true });

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await page.setViewportSize({ width: 390, height: 800 });
  await go(page, app, "/", 1500);
  await page.evaluate(async (s) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const now = Date.now();
    const tx = idb.transaction(["sites", "stairTests"], "readwrite");
    tx.objectStore("sites").put({ id: "p1", name: "Harbour Point", address: "", kind: "afss", createdAt: now, updatedAt: now, spf: { edition: "2015", type: "One test", notes: "", stairs: s } });
    tx.objectStore("stairTests").put({ id: "t1", siteId: "p1", kind: "general", sections: ["vel", "fan"], testedAt: now, doors: {}, once: {}, notes: [], order: 0, createdAt: now, updatedAt: now });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  }, [stair("s1", "SPF-01", "B2", "12"), stair("s2", "SPF-02", "G", "3")]);
  await go(page, app, "/site/p1/spf/t1/vel?stair=s1&run=0", 1500);
  await page.addStyleTag({ content: ":root { --safe-area-inset-bottom: 48px }" });
});

after(async () => {
  await app?.close();
});

const chinTop = () => page.getByRole("button", { name: /^Next stair: / }).evaluate((b) => b.parentElement.getBoundingClientRect().top);
const list = () => page.locator("[data-heads]").locator("xpath=..");

test("the stair bar sits above the gesture bar, and the lowest level clears it", async () => {
  const bar = await page.getByRole("button", { name: /^Next stair: / }).evaluate((b) => b.parentElement.getBoundingClientRect().bottom);
  assert.ok(bar <= 800 - 48, `bar bottom ${bar}`);
  await list().evaluate((l) => (l.scrollTop = 1e5));
  await page.waitForTimeout(200);
  const lowest = await page.locator("[data-i]").last().evaluate((r) => r.getBoundingClientRect().bottom);
  assert.ok(lowest <= (await chinTop()), `lowest ${lowest}`);
});

test("typing the lowest level: its row shows above the keypad and bar, under the headings", async () => {
  await page.locator("[data-i]").last().locator("button").first().click();
  await page.getByTestId("spf-value").waitFor();
  await page.waitForTimeout(400);
  const r = await page.locator("[data-i]").last().boundingBox();
  const heads = await page.locator("[data-heads]").boundingBox();
  assert.ok(r.y >= heads.y + heads.height - 1 && r.y + r.height <= (await chinTop()), `row ${r.y}–${r.y + r.height}`);
});

test("Fan checks: the stair bar sits between the list and Done, overlapping neither", async () => {
  await go(page, app, "/site/p1/spf/t1/fan?stair=s1&run=0", 1500);
  await page.addStyleTag({ content: ":root { --safe-area-inset-bottom: 48px }" });
  const done = await page.getByRole("button", { name: "Done ›" }).boundingBox();
  const bar = await page.getByRole("button", { name: /^Next stair: / }).evaluate((b) => b.parentElement.getBoundingClientRect().toJSON());
  assert.ok(bar.bottom <= done.y, `bar ${bar.bottom} / Done ${done.y}`);
  assert.ok(done.y + done.height <= 800 - 48, "Done clears the gesture bar");
  const lastCheck = await page.getByRole("radiogroup").last().evaluate((g) => { g.scrollIntoView({ block: "end" }); return g.getBoundingClientRect().bottom; });
  assert.ok(lastCheck <= bar.top, "the last check clears the bar");
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
