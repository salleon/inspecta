// Stair pressurisation (canvas StairTestSimple, SiteTests): a Stair
// pressurisation site from + New site, the system set up once, a test
// picked, a velocity typed at a level with the keypad (Done saves and
// closes: the app never moves you on), the report; and on an AFSS site the
// Other tests tab, + Add a test and the export chooser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await go(page, app, "/", 1500);
  await seed(page, {
    sites: [{ id: "a1", name: "155 Kent St", kind: "afss" }],
    flowTests: [{ id: "f1", siteId: "a1", kind: "sprinkler", name: "Sprinkler" }],
  });
  await go(page, app, "/", 1500);
});

after(async () => {
  await app?.close();
});

test("a Stair pressurisation site from + New site", async () => {
  await page.getByRole("button", { name: /new site/i }).first().click();
  await page.getByRole("button", { name: "Stair pressurisation" }).click();
  assert.match(await page.locator("form").innerText(), /Just stair pressurisation tests/);
  await page.getByPlaceholder("Site name").fill("Harbour Tower");
  await page.getByRole("button", { name: "Start stair testing" }).click();
  await page.getByText("No stair tests on this site yet.").waitFor();
  assert.equal(await page.getByText("SPF", { exact: true }).count(), 1);
});

test("the system is set once: edition, type, stairs; the rules follow the edition", async () => {
  await page.getByRole("button", { name: "+ New stair test" }).click();
  await page.getByRole("button", { name: "Set up the system first ›" }).click();
  await page.getByRole("radiogroup", { name: "AS 1668.1 edition" }).waitFor();
  assert.match(await page.getByTestId("spf-rules").innerText(), /AS 1668.1-1998 · PURGE[\s\S]*Compartment above[\s\S]*≤ 65 dB\(A\)/i);
  await page.getByRole("radio", { name: "1979" }).click();
  assert.match(await page.getByTestId("spf-rules").innerText(), /≤ 50 Pa/);
  await page.getByRole("radio", { name: "1998" }).click();
  await page.getByLabel("Stair name").fill("Front");
  await page.getByLabel("Bottom level").fill("G");
  await page.getByLabel("Top level").fill("3");
  await page.getByLabel("Fan").fill("SPF-1");
  assert.match(await page.locator("body").innerText(), /4 doors/);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Purge · built to AS 1668.1-1998 · 1 stair").waitFor();
});

test("pick Annual Testing: only its sections", async () => {
  assert.equal(await page.getByRole("radio", { name: /Annual Testing/ }).getAttribute("aria-checked"), "true");
  await page.getByRole("button", { name: "Start ›" }).click();
  await page.getByRole("button", { name: /^≋ Velocity/ }).waitFor();
  const text = await page.locator("body").innerText();
  for (const s of ["Door force", "Door closes & latches", "Noise", "Pressure restoration", "Fan checks"]) assert.ok(text.includes(s), s);
  assert.ok(!text.includes("Three-monthly check"));
});

test("a velocity at one level: Done saves it and closes the keypad", async () => {
  await page.getByRole("button", { name: /^≋ Velocity/ }).click();
  await page.locator('[data-i="1"]').click();
  for (const k of ["0", ".", "8"]) await page.getByRole("button", { name: k, exact: true }).dispatchEvent("pointerdown");
  assert.equal((await page.getByTestId("spf-value").innerText()).replace(/\s+/g, ""), "0.8m/s");
  await page.getByRole("button", { name: "Done" }).dispatchEvent("pointerdown");
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId("spf-value").count(), 0, "the keypad closes; it doesn't move on to the next level");
  const row = await page.locator('[data-i="1"]').innerText();
  assert.match(row, /2[\s\S]*3[\s\S]*0\.8[\s\S]*Fail/, "level 2, the level above open, 0.8 m/s fails");
  assert.match(await page.locator("body").innerText(), /1 of 4 done · 1 fail · 3 to go/);
});

test("the report: every column, blanks where not tested", async () => {
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByText("1 fail").first().waitFor();
  await page.getByRole("button", { name: "Preview the report" }).click();
  const sheet = await page.getByTestId("spf-page").innerText();
  assert.match(sheet, /Stair pressurisation · Annual Testing/);
  assert.match(sheet, /Stair 1 \(Front\)/);
  assert.match(sheet, /Door opening force N \(max 110\)/);
  assert.match(sheet, /2\s+3\s+0\.8/);
});

test("an AFSS site: Other tests, + Add a test, and the export chooser", async () => {
  await go(page, app, "/site/a1/findings", 1200);
  await page.getByRole("button", { name: /Other tests · 1/ }).click();
  await page.getByRole("button", { name: "+ Add a test" }).click();
  const sheet = await page.locator(".sheet-panel").innerText();
  assert.match(sheet, /Flow test/);
  assert.match(sheet, /Stair pressurisation \(SPF\)[\s\S]*Set to Annual Testing for the AFSS/);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Export Other Tests Only" }).click();
  assert.match(await page.locator(".sheet-panel").innerText(), /Export tests[\s\S]*All tests[\s\S]*Sprinkler/);
  await page.getByRole("checkbox", { name: /Sprinkler/ }).click();
  assert.equal(await page.getByRole("button", { name: "Pick a test to export" }).count(), 1);
  assert.deepEqual(errors, []);
});
