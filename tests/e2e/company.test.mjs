// Contractor mode's company setup (components/CompanySetup): a new phone
// sets up its company (name, logo, colours) before the name prompt, the
// app takes the company's colours, and Settings → Company edits them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startApp, seed, download } from "./helpers.mjs";

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
// the Colours editor's cover preview: its background, and its accent line
const preview = () => page.getByTestId("colours-preview").evaluate((el) => [getComputedStyle(el).backgroundImage, getComputedStyle(el).borderBottomColor]);

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
  assert.deepEqual(await preview(), ["linear-gradient(172deg, rgb(22, 24, 29) 0%, rgb(22, 24, 29) 48%, rgb(0, 0, 0) 160%)", "rgb(224, 49, 58)"], "the preview shows the colours");
  assert.equal(await cssVar("--accent"), "#2ec4b6", "the app keeps its own colours");
  assert.equal(await cssVar("--bg"), "#071b2c");
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForTimeout(300);
  await page.locator("input").first().fill("New Starter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("inspecta.company")).name), "Coastline Fire Services");
});

test("the setup isn't shown again, and the colours stay", async () => {
  await page.reload();
  // the splash is in the company's colours
  await page.locator(".cs").waitFor();
  assert.equal(await page.locator(".cs").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(22, 24, 29)");
  await page.waitForTimeout(2300);
  assert.equal(await page.getByRole("button", { name: "Set up your company" }).count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("inspecta.company")).schemeId), "firetruck");
  assert.equal(await cssVar("--accent"), "#2ec4b6", "only the splash and covers take the company's colours");
});

test("Admin → Company edits the name, logo and colours (not in Settings, behind the PIN)", async () => {
  await page.click('button[aria-label="Settings"]');
  await page.getByRole("button", { name: /Company, keywords, PIN/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Colours/ }).count(), 0, "not in Settings");
  await page.getByRole("button", { name: /Company, keywords, PIN/ }).click();
  // the manager's first visit: choose the PIN
  await page.getByText("Choose a new PIN").waitFor();
  for (const pin of ["1234", "1234"]) {
    for (const d of pin) await page.click(`button[aria-label="${d}"]`);
    await page.waitForTimeout(250);
  }
  await page.getByText("Coastline Fire Services").waitFor();
  await page.getByRole("button", { name: /Company name/ }).click();
  await page.fill('input[aria-label="Company name"]', "Coastline Fire");
  await page.keyboard.press("Enter");
  await page.getByText("Coastline Fire", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("inspecta.company")).name), "Coastline Fire");
  await page.getByRole("button", { name: /Company name/ }).click();
  await page.fill('input[aria-label="Company name"]', "Coastline Fire Services");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Colours/ }).click();
  await page.getByRole("tab", { name: "Custom" }).click();
  await page.getByRole("button", { name: "#3d8bfd" }).first().click(); // picking Primary: Dark first, then Bright
  assert.match((await preview())[0], /rgb\(61, 139, 253\) 0%/);
  await page.getByRole("button", { name: "Secondary" }).click();
  await page.getByRole("button", { name: "#ffc629" }).click();
  assert.equal((await preview())[1], "rgb(255, 198, 41)");
  assert.equal(await cssVar("--accent"), "#2ec4b6");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByText("Custom").waitFor();
  assert.ok(page.url().endsWith("#/admin"), "Done goes back to Admin");
});

test("no EnFact branding: home header and the PDF cover are the company's", async () => {
  await page.goto(app.url + "/#/");
  await page.waitForTimeout(800);
  assert.equal(await page.getByText("BY ENFACT").count(), 0);
  assert.equal(await page.locator('img[alt="Coastline Fire Services"]').count() >= 1, true, "the company logo in the header");
  await seed(page, { sites: [{ id: "c1", name: "Harbour Tower", address: "1 Harbour St" }], findings: [{ id: "cf1", siteId: "c1", note: "Exit sign not lit", location: "Lobby" }] });
  await page.goto(app.url + "/#/site/c1/export");
  await page.waitForTimeout(2500);
  const pdf = await download(page, async () => {
    await page.click("text=Share PDF");
    await page.waitForTimeout(400);
    if (await page.locator("text=Export anyway").count()) await page.click("text=Export anyway");
  });
  const text = (await readFile(pdf.path)).toString("latin1");
  assert.ok(text.includes("Harbour Tower"));
  assert.ok(text.includes("(AFSS)"), "the report kind is drawn as text by the accent bar");
});

test("EnFact mode keeps EnFact's own colours", async () => {
  await page.evaluate(() => localStorage.setItem("inspecta.flowMode", "enfact"));
  await page.reload();
  await page.waitForTimeout(2300);
  assert.equal(await cssVar("--accent"), "#2ec4b6");
  assert.equal(await page.getByText("Company name").count(), 0);
  assert.deepEqual(errors, []);
});
