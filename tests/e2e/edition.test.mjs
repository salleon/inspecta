// Which app it is (lib/edition) is fixed when it's built: EnFact's build is
// always EnFact and the Contractor build always Contractor, whatever an
// older version left on the phone, and nothing on the phone switches it
// (no Mode in Admin, no taps on the splash).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go } from "./helpers.mjs";

let enfact;
let contractor;

before(async () => {
  [enfact, contractor] = await Promise.all([startApp(import.meta.url), startApp(import.meta.url, { edition: "contractor" })]);
});

after(async () => {
  await Promise.all([enfact?.close(), contractor?.close()]);
});

// a brand new phone, with an old version's mode left on it
async function newPhone(app, oldMode) {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((m) => {
    localStorage.setItem("inspecta.tourOffered", "1");
    localStorage.setItem("inspecta.flowMode", m);
  }, oldMode);
  const page = await context.newPage();
  await page.goto(app.url + "/");
  return page;
}

const tapCorner = async (page) => {
  for (let i = 0; i < 5; i++) await page.mouse.click(30, 30);
};

test("EnFact: EnFact's splash and no company setup, even on a phone an older version left in Contractor", async () => {
  const page = await newPhone(enfact, "contractor");
  await page.getByRole("img", { name: /EnFact Inspecta/ }).waitFor();
  await tapCorner(page);
  await page.waitForTimeout(2300);
  assert.equal(await page.getByRole("button", { name: "Set up your company" }).count(), 0);
  assert.equal(await page.getByRole("img", { name: "EnFact" }).count(), 1, "EnFact's wordmark on the name screen");
  await page.context().close();
});

test("Contractor: the company setup on a new phone, even one an older version left in EnFact", async () => {
  const page = await newPhone(contractor, "enfact");
  await tapCorner(page);
  await page.getByRole("button", { name: "Set up your company" }).waitFor({ timeout: 5000 });
  assert.equal(await page.getByRole("img", { name: /EnFact Inspecta/ }).count(), 0);
  await page.context().close();
});

test("no Mode switch in Admin in either app", async () => {
  const { page } = await openPage(enfact);
  await go(page, enfact, "/admin", 600);
  for (const d of "2021") await page.click(`button[aria-label="${d}"]`);
  await page.getByRole("button", { name: /Keywords/ }).waitFor();
  assert.equal(await page.locator('[role="radiogroup"][aria-label="Mode"]').count(), 0);
  await page.context().close();

  const c = await openPage(contractor);
  await c.page.evaluate(() => localStorage.setItem("inspecta.company", JSON.stringify({ name: "Coastline Fire", logo: null, plate: false, logoColours: [], schemeId: "default", custom: { primary: "#071b2c", secondary: "#2ec4b6", light: "#f4f7f9" }, setUp: true })));
  await go(c.page, contractor, "/admin", 600);
  for (const d of "48264826") await c.page.click(`button[aria-label="${d}"]`);
  await c.page.getByRole("button", { name: /Keywords/ }).waitFor();
  assert.equal(await c.page.locator('[role="radiogroup"][aria-label="Mode"]').count(), 0);
  assert.equal(await c.page.getByText("Company", { exact: true }).count() > 0, true, "the Company group");
  await c.page.context().close();
});
