// The owner's secret switch (components/Splash): five quick taps in the top
// left corner of the splash switch a Contractor phone to EnFact, or an
// EnFact phone to Contractor, and restart the app. Fewer taps, or slow
// ones, do nothing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers.mjs";

let app;

before(async () => {
  app = await startApp(import.meta.url);
});

after(async () => {
  await app?.close();
});

// a brand new phone (so Contractor), caught while the splash is up
async function newPhone() {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("inspecta.tourOffered", "1"));
  const page = await context.newPage();
  await page.goto(app.url + "/");
  await page.getByTestId("splash-corner").waitFor();
  return page;
}

const mode = (page) => page.evaluate(() => localStorage.getItem("inspecta.flowMode"));
const tap = (page, n) => page.mouse.click(30, 30, { clickCount: 1 }).then(() => (n > 1 ? tap(page, n - 1) : undefined));

test("five quick taps in the corner of the splash make it an EnFact phone", async () => {
  const page = await newPhone();
  assert.equal(await mode(page), "contractor");
  await Promise.all([page.waitForEvent("load"), tap(page, 5)]);
  assert.equal(await mode(page), "enfact");
  // EnFact's own splash now, then no company setup
  await page.getByRole("img", { name: /EnFact Inspecta/ }).waitFor();
  await page.getByTestId("splash-corner").waitFor();
  await page.waitForTimeout(2300);
  assert.equal(await page.getByRole("button", { name: "Set up your company" }).count(), 0);
  await page.context().close();
});

test("into EnFact, a PIN chosen as a new Contractor phone goes: back to 2021", async () => {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("inspecta.tourOffered", "1");
    localStorage.setItem("inspecta.inspectorName", "New Starter");
  });
  const page = await context.newPage();
  await page.goto(app.url + "/");
  await page.evaluate(() => {
    localStorage.setItem("inspecta.flowMode", "contractor");
    localStorage.setItem("inspecta.adminPin", "4826");
    localStorage.setItem("inspecta.adminPinPrint", JSON.stringify({ salt: "aa", hash: "bb" }));
  });
  await page.reload();
  await page.getByTestId("splash-corner").waitFor();
  await Promise.all([page.waitForEvent("load"), tap(page, 5)]);
  assert.equal(await mode(page), "enfact");
  const left = await page.evaluate(() => [localStorage.getItem("inspecta.adminPin"), localStorage.getItem("inspecta.adminPinPrint")]);
  assert.deepEqual(left, [null, null]);
  await page.waitForTimeout(2300);
  await page.goto(app.url + "/#/admin");
  await page.getByText("Enter admin PIN").waitFor();
  for (const d of "4826") await page.click(`button[aria-label="${d}"]`);
  await page.waitForTimeout(300);
  assert.equal(await page.getByText("Wrong PIN").count(), 1, "the chosen PIN no longer opens it");
  for (const d of "2021") await page.click(`button[aria-label="${d}"]`);
  await page.locator('[role="radiogroup"][aria-label="Mode"]').waitFor();
  await context.close();
});

test("five quick taps on EnFact's splash switch back to Contractor, keeping the PIN", async () => {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("inspecta.tourOffered", "1");
    localStorage.setItem("inspecta.inspectorName", "Office Phone");
  });
  const page = await context.newPage();
  await page.goto(app.url + "/");
  await page.getByRole("img", { name: /EnFact Inspecta/ }).waitFor();
  assert.equal(await mode(page), "enfact");
  await Promise.all([page.waitForEvent("load"), tap(page, 5)]);
  assert.equal(await mode(page), "contractor");
  assert.equal(await page.evaluate(() => localStorage.getItem("inspecta.adminPin")), "2021", "the PIN it had comes along");
  await page.locator(".cs").waitFor();
  await context.close();
});

test("four taps, or five slow ones, change nothing", async () => {
  const page = await newPhone();
  await tap(page, 4);
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(900);
    await page.mouse.click(30, 30);
  }
  await page.waitForTimeout(2000);
  assert.equal(await mode(page), "contractor");
  await page.context().close();
});
