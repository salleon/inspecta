// Contractor mode's company setup (components/CompanySetup): a new phone
// sets up its company (name, logo, colours) before the name prompt, the
// app takes the company's colours, and Settings → Company edits them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers.mjs";

let app;
let context;
let page;
const errors = [];

// a 120 x 60 logo: red square and dark text block on a clear background
const LOGO = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect x="0" y="0" width="80" height="80" rx="16" fill="#d7262e"/><rect x="100" y="20" width="130" height="40" fill="#1d2833"/></svg>`,
);

before(async () => {
  app = await startApp(import.meta.url);
  context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
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

test("a new phone sets up its company before the name prompt", async () => {
  await page.getByRole("button", { name: "Set up your company" }).click();
  const next = page.getByRole("button", { name: "Next" });
  assert.equal(await next.isDisabled(), true, "needs a company name");
  await page.fill("#company-name", "Coastline Fire Services");
  await next.click();
  await page.setInputFiles('input[aria-label="Upload logo"]', { name: "logo.svg", mimeType: "image/svg+xml", buffer: LOGO });
  await page.getByText("White background behind logo").waitFor();
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Next" }).click();
  // a logo was given, so From logo opens first, with schemes made from it
  assert.equal(await page.getByRole("tab", { name: "From logo" }).getAttribute("aria-selected"), "true");
  assert.ok((await page.getByText("Found in your logo").count()) === 1);
  await page.getByRole("tab", { name: "Presets" }).click();
  await page.getByRole("button", { name: /Firetruck/ }).click();
  assert.equal(await cssVar("--accent"), "#e0313a", "the app recolours live");
  assert.equal(await cssVar("--bg"), "#16181d");
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForTimeout(300);
  await page.locator("input").first().fill("New Starter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("inspecta.company")).name), "Coastline Fire Services");
});

test("the setup isn't shown again, and the colours stay", async () => {
  await page.reload();
  await page.waitForTimeout(2300);
  assert.equal(await page.getByRole("button", { name: "Set up your company" }).count(), 0);
  assert.equal(await cssVar("--accent"), "#e0313a");
});

test("Settings → Company edits the name, logo and colours", async () => {
  await page.click('button[aria-label="Settings"]');
  await page.getByText("Coastline Fire Services").waitFor();
  await page.getByRole("button", { name: /Colours/ }).click();
  await page.getByRole("tab", { name: "Custom" }).click();
  await page.getByRole("button", { name: "#3d8bfd" }).first().click(); // picking Primary: Dark first, then Bright
  assert.equal(await cssVar("--bg"), "#3d8bfd");
  await page.getByRole("button", { name: "Secondary" }).click();
  await page.getByRole("button", { name: "#ffc629" }).click();
  assert.equal(await cssVar("--accent"), "#ffc629");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByText("Custom").waitFor();
});

test("EnFact mode keeps EnFact's own colours", async () => {
  await page.evaluate(() => localStorage.setItem("inspecta.flowMode", "enfact"));
  await page.reload();
  await page.waitForTimeout(2300);
  assert.equal(await cssVar("--accent"), "#2ec4b6");
  assert.equal(await page.getByText("Company name").count(), 0);
  assert.deepEqual(errors, []);
});
