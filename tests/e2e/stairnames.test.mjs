// Placeholder stair names (lib/stairTest fanName / wellName) and the check
// before a stair report (components/StairNameCheck): stairs still on
// suggested names are listed with the suggestions to type over. Save keeps
// what's in the boxes as real names (not asked again); Not now goes on with
// the placeholders and asks next time. From Preview the report, and from an
// AFSS site's export when it has stair tests.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, download } from "./helpers.mjs";

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
    const spf = () => ({
      edition: "1998",
      type: "Purge",
      notes: "",
      stairs: [
        { id: "a", name: "North", from: "G", to: "3", extra: [], fan: "SPF-1" },
        { id: "b", name: "", from: "G", to: "3", extra: [], fan: "" },
      ],
    });
    const reading = { doors: { a: { G: { vel: "1.4" } } }, once: {}, notes: [], order: 0, createdAt: now, updatedAt: now, testedAt: now };
    const tx = idb.transaction(["sites", "stairTests", "findings"], "readwrite");
    tx.objectStore("sites").put({ id: "s1", name: "Harbour Tower", address: "", kind: "spf", createdAt: now, updatedAt: now, spf: spf() });
    tx.objectStore("stairTests").put({ id: "t1", siteId: "s1", kind: "annual", sections: ["vel"], ...reading });
    tx.objectStore("sites").put({ id: "s2", name: "Kent St", address: "", kind: "afss", createdAt: now, updatedAt: now, spf: spf() });
    tx.objectStore("stairTests").put({ id: "t2", siteId: "s2", kind: "annual", sections: ["vel"], ...reading });
    tx.objectStore("findings").put({ id: "f1", siteId: "s2", note: "Exit sign not lit", esrCategory: "3.1", location: "", order: 0, createdAt: now, updatedAt: now });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  });
});

after(async () => {
  await app?.close();
});

const stairsOf = (siteId) =>
  page.evaluate(async (id) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const site = await new Promise((r) => {
      const q = idb.transaction("sites").objectStore("sites").get(id);
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return site.spf.stairs.map((s) => [s.fan, s.name]);
  }, siteId);

const sheet = () => page.getByRole("dialog", { name: "Check the stair names" });

test("an unnamed stair shows its placeholders, SPF-2 and Stair 2", async () => {
  await go(page, app, "/site/s1/spf/t1?stair=b", 1200);
  const tab = page.locator(".default-name", { hasText: "SPF-2" }).first();
  assert.equal(await tab.count(), 1);
  assert.equal(await tab.evaluate((e) => getComputedStyle(e).fontStyle), "italic");
  assert.equal(await page.locator(".default-name", { hasText: "Stair 2" }).count() > 0, true);
});

test("Preview the report asks first; Not now goes on with the placeholders", async () => {
  await page.getByRole("button", { name: "Preview the report" }).click();
  await sheet().waitFor();
  // only the unnamed stair is listed, filled with its suggestions
  assert.equal(await page.locator("[data-stair-check]").count(), 1);
  assert.equal(await page.getByLabel("Stair 2 fan name").inputValue(), "SPF-2");
  assert.equal(await page.getByLabel("Stair 2 stairwell name").inputValue(), "Stair 2");
  await page.getByRole("button", { name: /Not now/ }).click();
  await page.getByTestId("spf-page").first().waitFor();
  assert.match(await page.locator("body").innerText(), /SPF-2 · Stair 2/);
  assert.deepEqual(await stairsOf("s1"), [["SPF-1", "North"], ["", ""]], "nothing saved");
});

test("Save names keeps what's in the boxes, typed or suggested, and doesn't ask again", async () => {
  await go(page, app, "/site/s1/spf/t1", 1200);
  await page.getByRole("button", { name: "Preview the report" }).click();
  await sheet().waitFor();
  await page.getByLabel("Stair 2 fan name").fill("SPF-9");
  await page.getByRole("button", { name: "Save names and preview ›" }).click();
  await page.getByTestId("spf-page").first().waitFor();
  assert.match(await page.locator("body").innerText(), /SPF-9 · Stair 2/);
  assert.deepEqual(await stairsOf("s1"), [["SPF-1", "North"], ["SPF-9", "Stair 2"]]);
  await go(page, app, "/site/s1/spf/t1", 1200);
  assert.equal(await page.locator(".default-name").count(), 0, "confirmed: no placeholders left");
  await page.getByRole("button", { name: "Preview the report" }).click();
  await page.getByTestId("spf-page").first().waitFor();
  assert.equal(await sheet().count(), 0);
});

test("an AFSS export with stair tests asks too, then exports", async () => {
  await go(page, app, "/site/s2/export", 1500);
  await page.getByRole("button", { name: "Share PDF" }).click();
  await sheet().waitFor();
  assert.equal(await page.getByRole("button", { name: "Save names and export ›" }).count(), 1);
  const file = await download(page, () => page.getByRole("button", { name: "Save names and export ›" }).click());
  assert.match(file.name, /\.pdf$/);
  assert.deepEqual(await stairsOf("s2"), [["SPF-1", "North"], ["SPF-2", "Stair 2"]]);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
