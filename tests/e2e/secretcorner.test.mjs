// The owner's secret switch (components/Splash): five quick taps in the top
// left corner of the Contractor splash make the phone an EnFact phone and
// restart the app. Fewer taps, or slow ones, do nothing.
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
  // EnFact's own splash now, with no secret corner, then no company setup
  await page.getByRole("img", { name: /EnFact Inspecta/ }).waitFor();
  assert.equal(await page.getByTestId("splash-corner").count(), 0);
  await page.waitForTimeout(2300);
  assert.equal(await page.getByRole("button", { name: "Set up your company" }).count(), 0);
  await page.context().close();
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
