// Contractor setup's Use default (components/CompanySetup): no logo and no
// styling. The app keeps its own colours with no EnFact logos, the company
// name shows in a box, and the PDF cover has the AFSS / Projects square.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startApp, seed, download } from "./helpers.mjs";

let app;
let page;
const errors = [];

before(async () => {
  app = await startApp(import.meta.url);
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await context.addInitScript(() => localStorage.setItem("inspecta.tourOffered", "1"));
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(app.url + "/");
  await page.waitForTimeout(2300);
});

after(async () => {
  await app?.close();
});

const cssVar = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test("Use default skips the logo and colours, keeping the app's own colours", async () => {
  await page.getByRole("button", { name: "Set up your company" }).click();
  await page.fill("#company-name", "Coastline Fire Services");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Use default" }).click();
  await page.waitForTimeout(300);
  await page.locator("input").first().fill("New Starter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  assert.equal(await cssVar("--accent"), "#2ec4b6");
  assert.equal(await cssVar("--bg"), "#071b2c");
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--accent")), "", "index.css's own, not a copy");
});

test("the home screen shows the company name in a box, no EnFact logo", async () => {
  assert.equal(await page.getByText("BY ENFACT").count(), 0);
  assert.equal(await page.locator('img[alt="Inspecta by EnFact"]').count(), 0);
  assert.equal(await page.getByText("Coastline Fire Services", { exact: true }).count() >= 1, true);
});

test("the PDF cover has the name box and the square, not the label by the bar", async () => {
  await seed(page, { sites: [{ id: "d1", name: "Harbour Tower", address: "1 Harbour St" }], findings: [{ id: "df1", siteId: "d1", note: "Exit sign not lit", location: "Lobby" }] });
  await page.goto(app.url + "/#/site/d1/export");
  await page.waitForTimeout(2500);
  const pdf = await download(page, async () => {
    await page.click("text=Share PDF");
    await page.waitForTimeout(400);
    if (await page.locator("text=Export anyway").count()) await page.click("text=Export anyway");
  });
  const text = (await readFile(pdf.path)).toString("latin1");
  assert.ok(text.includes("(COASTLINE FIRE SERVICES)"), "the name, in capitals, in its box");
  assert.ok(!text.includes("(AFSS)"), "AFSS is in the square, not by the bar");
  assert.deepEqual(errors, []);
});

test("Default is the first preset in Settings → Company → Colours", async () => {
  await page.goto(app.url + "/#/settings/colours");
  await page.waitForTimeout(800);
  const first = page.getByRole("button", { pressed: true }).first();
  assert.match(await first.innerText(), /Default/);
});
