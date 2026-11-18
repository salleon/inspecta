// The duct probe in a stair test (design canvas Duct probes test, version
// 2): an extra test, per stair, on that stair's fan. The name comes from the
// fan, the stopwatch runs from START TIMER (when the detector is cleared) to STOP TIMER (when the equipment restarts) (60 to 90 s
// passes, 5 s either side marginal), Failed to restart fails it, Retest duct
// probe adds another go, and each go prints under the fan on the report.
// Stair pressurisation's screens are in its purple.
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
  await go(page, app, "/", 1500);
  await page.evaluate(async (s) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const now = Date.now();
    const tx = idb.transaction(["sites", "stairTests"], "readwrite");
    tx.objectStore("sites").put({ id: "p1", name: "Harbour Point", address: "", kind: "afss", createdAt: now, updatedAt: now, spf: { edition: "2015", type: "One test", notes: "", stairs: s } });
    tx.objectStore("stairTests").put({ id: "t1", siteId: "p1", kind: "annual", sections: ["vel", "force", "latch", "noise", "rest", "fan"], testedAt: now, doors: {}, once: {}, notes: [], order: 0, createdAt: now, updatedAt: now });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  }, [stair("s1", "SPF-1", "G", "3"), stair("s2", "SPF-2", "G", "3")]);
  await page.reload();
  await page.waitForTimeout(600);
});

after(async () => {
  await app?.close();
});

test("added from Additional tests, in the stair's purple", async () => {
  await go(page, app, "/site/p1-spf/spf/t1?stair=s1", 1500);
  const accent = await page.evaluate(() => getComputedStyle(document.querySelector(".spf-theme")).getPropertyValue("--accent").trim());
  assert.equal(accent, "#b18cff");
  const row = page.locator("div", { hasText: /^\+Duct probe\+ Add$/ });
  await row.getByRole("button", { name: "+ Add" }).click();
  await page.getByText("Duct probe", { exact: true }).click();
  await page.getByText("Tap to start").waitFor();
  assert.equal(await page.getByLabel("Test name").inputValue(), "SPF-1 duct probe");
  assert.equal(await page.getByTestId("probe-result").innerText(), "Not tested");
});

test("the stopwatch: green in the window, a pass when stopped there", async () => {
  // from here the test moves the clock on, for the stopwatch
  await page.clock.install();
  await page.getByRole("button", { name: "START TIMER when the detector is cleared" }).click();
  // the fan cutting out is a given: only a fail is ticked
  assert.equal(await page.getByRole("checkbox", { name: "Failed to stop equipment" }).isChecked(), false);
  await page.clock.runFor(30_000);
  assert.match(await page.getByTestId("duct-probe").innerText(), /0:30\.\d[\s\S]*Window opens in 30 s/);
  await page.clock.runFor(45_000);
  assert.match(await page.getByTestId("duct-probe").innerText(), /1:15\.\d[\s\S]*In the window · 15 s left/);
  assert.equal(await page.getByTestId("probe-clock").evaluate((e) => getComputedStyle(e).color), "rgb(43, 212, 122)");
  await page.getByRole("button", { name: "STOP TIMER when the equipment restarts" }).click();
  assert.equal(await page.getByTestId("probe-result").innerText(), "Pass");
  assert.match(await page.getByTestId("duct-probe").innerText(), /Restarted after 75 s/);
});

test("a retest: named after the fan, Failed to restart fails it; the fan shows its latest", async () => {
  await page.getByRole("button", { name: "Retest duct probe" }).click();
  assert.equal(await page.getByLabel("Retest 1 name").inputValue(), "SPF-1 duct probe · retest 1");
  const second = page.getByTestId("duct-probe").nth(1);
  await second.getByRole("button", { name: "START TIMER when the detector is cleared" }).click();
  await page.clock.runFor(100_000);
  // it asks first, so a slip doesn't throw the go away: Cancel leaves the timer running
  await second.getByRole("button", { name: "Failed to restart" }).click();
  await page.getByText("This stops the timer and fails this go").waitFor();
  await page.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await second.getByTestId("probe-result").innerText(), "Timing");
  await second.getByRole("button", { name: "Failed to restart" }).click();
  await page.getByRole("button", { name: "Failed to restart" }).last().click();
  assert.equal(await second.getByTestId("probe-result").innerText(), "Fail");
  assert.match(await second.innerText(), /Clock stopped at 100 s/);
  await second.getByLabel("Retest 1 notes").fill("Fan stayed off, reset at the FIP");
  await page.clock.runFor(600);
  await page.getByRole("button", { name: "Done ›" }).click();
  await page.getByText("Duct probe", { exact: true }).waitFor();
  // the stair's card shows the latest go: the retest that failed
  await page.getByText("No restart ✗").waitFor();
});

test("each stair's fan has its own probe; Failed to stop equipment fails it with no time", async () => {
  await go(page, app, "/site/p1-spf/spf/t1/probe?stair=s2", 1500);
  assert.equal(await page.getByLabel("Test name").inputValue(), "SPF-2 duct probe");
  assert.equal(await page.getByTestId("duct-probe").count(), 1);
  await page.getByRole("checkbox", { name: "Failed to stop equipment" }).check();
  assert.equal(await page.getByTestId("probe-result").innerText(), "Fail");
  await page.clock.runFor(600);
});

test("the report: a line per go under the fan", async () => {
  await go(page, app, "/site/p1-spf/spf/t1/report", 1500);
  const body = await page.locator("body").innerText();
  assert.match(body, /Duct probe · fan SPF-1\s*SPF-1 duct probe · restarted after 75 s · Pass\s*SPF-1 duct probe · retest 1 · failed to restart · Fail · Fan stayed off, reset at the FIP/);
  assert.match(body, /Duct probe · fan SPF-2\s*SPF-2 duct probe · failed to stop equipment · Fail/);
  assert.deepEqual(errors, []);
});
