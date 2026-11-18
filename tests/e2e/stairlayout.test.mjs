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
    tx.objectStore("stairTests").put({ id: "t1", siteId: "p1", kind: "general", sections: ["vel", "force", "fan"], testedAt: now, doors: {}, once: {}, notes: [], order: 0, createdAt: now, updatedAt: now });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  }, [stair("s1", "SPF-01", "B2", "12"), { ...stair("s2", "SPF-02", "G", "3"), more: { 2: 1 } }]);
  // as the app opening on it: the stairs and test move into the site's stair job "p1-spf"
  await page.reload();
  await page.waitForTimeout(600);
  await go(page, app, "/site/p1-spf/spf/t1/vel?stair=s1&run=0", 1500);
  await page.addStyleTag({ content: ":root { --safe-area-inset-bottom: 48px }" });
});

after(async () => {
  await app?.close();
});

const chinTop = () => page.getByRole("button", { name: /^Next stair: / }).evaluate((b) => b.parentElement.getBoundingClientRect().top);
const list = () => page.locator("[data-heads]").first().locator("xpath=..");

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

test("door force: a level with two doors shows a line a door, as velocity does", async () => {
  for (const sec of ["vel", "force"]) {
    await go(page, app, `/site/p1-spf/spf/t1/${sec}?stair=s2&run=0`, 1500);
    const rows = await page.locator('[data-i="1"] .door-row').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    assert.equal(rows.length, 2, sec);
    assert.ok(rows[1] > rows[0] + 20, `${sec}: door B under door A`);
  }
});

test("the Open box: wide across the row while typing, then the whole text on two lines", async () => {
  await go(page, app, "/site/p1-spf/spf/t1/vel?stair=s1&run=0", 1500);
  const open = page.getByLabel("Other door open with 5", { exact: true });
  await open.click();
  const box = await open.boundingBox();
  assert.ok(box.width > 200, `typing box ${box.width} wide`);
  await open.fill("6 + Plant room");
  await open.press("Enter");
  const shown = page.locator('[data-i="7"] [aria-hidden]').first();
  assert.equal(await shown.innerText(), "6 + Plant room");
  const s = await shown.evaluate((e) => ({ sh: e.firstElementChild.scrollHeight, ch: e.firstElementChild.clientHeight }));
  assert.ok(s.sh <= s.ch + 1, "not cut off");
  assert.ok((await open.boundingBox()).width < 80, "narrow again");
});

test("swiping the stair bar: the next stair's own page slides in, not a blank outline", async () => {
  await go(page, app, "/site/p1-spf/spf/t1/vel?stair=s1&run=0", 1500);
  await page.getByText("Site inspection tool").waitFor({ state: "detached" });
  const chin = page.getByTestId("stair-chin");
  const box = await chin.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width / 2 - i * 15, y);
  // mid-swipe: the next stair (G to 3) beside this one (B2 to 12), its levels drawn
  const peek = page.locator("[data-heads]").nth(1).locator("xpath=..");
  assert.deepEqual(await peek.locator("[data-i] > span:first-child").allInnerTexts(), ["3", "2", "1", "G"]);
  await page.screenshot({ path: process.env.SHOT ?? "/dev/null" }).catch(() => {});
  await page.mouse.move(box.x + 10, y);
  await page.mouse.up();
  await page.waitForURL(/stair=s2/);
  await page.waitForTimeout(500);
  assert.equal(await peek.count(), 0, "gone once the stair has changed");
  assert.deepEqual(await page.locator("[data-i] > span:first-child").allInnerTexts(), ["3", "2", "1", "G"]);
});

test("Fan checks: the stair bar sits between the list and Done, overlapping neither", async () => {
  await go(page, app, "/site/p1-spf/spf/t1/fan?stair=s1&run=0", 1500);
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
