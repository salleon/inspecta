// The safety nets: a screen that fails shows "Something went wrong" (not a
// blank app) and the app carries on; a flow test with no supply left still
// opens; a save the phone refuses says so; Settings says when the last
// backup was made.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page } = await openPage(app));
  await go(page, app, "/", 1500);
  await seed(page, {
    sites: [
      { id: "ok", name: "Kent St", kind: "flow" },
      // a stair system damaged enough to break its screen
      { id: "bad", name: "Broken", kind: "spf", spf: { edition: "2015", type: "Zone", notes: "", stairs: null } },
    ],
    flowTests: [{ id: "f0", siteId: "ok", kind: "sprinkler", name: "Sprinkler", sections: [] }],
  });
});

after(async () => {
  await app?.close();
});

test("a screen that fails says so, and Back to home carries on", async () => {
  await go(page, app, "/site/bad/spf-system", 1200);
  const alert = page.getByRole("alert");
  assert.match(await alert.innerText(), /Something went wrong[\s\S]*still on the phone/);
  await alert.getByRole("button", { name: "Back to home" }).click();
  await page.getByPlaceholder("Search sites").waitFor();
  // and another screen opens as usual
  await page.getByText("Kent St").click();
  await page.getByText("Sprinkler").first().waitFor();
});

test("a flow test with no supply left still opens, with a blank one", async () => {
  await go(page, app, "/site/ok/flow/f0", 1500);
  assert.equal(await page.getByRole("alert").count(), 0);
  assert.match(await page.locator("body").innerText(), /Demand points/i);
});

test("a save the phone refuses says Couldn't save", async () => {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("refused", "DataError");
    };
    window.__restorePut = () => (IDBObjectStore.prototype.put = put);
  });
  await page.locator("input").first().fill("x");
  await page.getByText("Couldn't save", { exact: true }).waitFor({ timeout: 5000 });
  await page.evaluate(() => window.__restorePut());
  await page.getByRole("button", { name: "OK" }).click();
  await page.locator("input").first().fill(""); // back as it was, saved this time
  await page.waitForTimeout(800);
});

test("Settings says when the last backup was made", async () => {
  await go(page, app, "/settings", 1200);
  assert.equal(await page.getByTestId("last-backup").innerText(), "Not backed up yet");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Back up all data/ }).click();
  await download;
  await page.getByText(/^Last backup made \d+ \w+ \d{4}$/).waitFor();
});
