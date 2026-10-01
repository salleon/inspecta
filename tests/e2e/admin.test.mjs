// Settings → Admin: PIN, keyword editing (kept after a restart), the
// keyword file, learned keywords, changing the PIN and resetting a
// forgotten one with this phone's recovery code.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed, download, pressBack, scrollFindingToBottom } from "./helpers.mjs";

let app;
let page;
let errors;

// waits for an admin screen to appear, entering the PIN if it's asked for
const openAdmin = async (hash, readyText) => {
  await go(page, app, hash, 300);
  await page.waitForFunction((t) => document.body.innerText.includes("Enter admin PIN") || document.body.innerText.includes(t), readyText);
  if (await page.locator("text=Enter admin PIN").count()) await enterPin("2021");
  await page.locator(`text=${readyText}`).first().waitFor();
};

const enterPin = async (digits) => {
  for (const d of digits) await page.click(`button[aria-label="${d}"]`);
  await page.waitForTimeout(250);
};

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, { sites: [{ id: "s1", name: "Harbour Tower" }], findings: [{ id: "f0", siteId: "s1", note: "Sump pump float switch stuck" }] });
});

after(async () => {
  await app?.close();
});

test("Settings → Admin needs the PIN (2021)", async () => {
  await go(page, app, "/");
  await page.click('button[aria-label="Settings"]');
  await page.click('button:has-text("Admin")');
  await page.waitForTimeout(500);
  await enterPin("1234");
  assert.equal(await page.locator("text=Wrong PIN").count(), 1);
  await enterPin("2021");
  assert.equal(await page.locator('button:has-text("Keywords")').count(), 1);
  assert.equal(await page.locator('button[role="switch"]:has-text("Advanced controls")').count(), 1);
});

test("Advanced controls are switched in Admin, not Settings", async () => {
  const on = () => page.getAttribute('button[role="switch"]', "aria-checked");
  assert.equal(await on(), "true");
  await page.click('button[role="switch"]');
  assert.equal(await on(), "false");
  assert.equal(await page.evaluate(() => localStorage.getItem("inspecta.advancedControls")), "0");
  await page.click('button[role="switch"]');
  assert.equal(await on(), "true");
  await go(page, app, "/");
  await page.click('button[aria-label="Settings"]');
  assert.equal(await page.getByText("Advanced controls", { exact: true }).count(), 0);
  await openAdmin("/admin", "Keywords");
});

test("Flow testing mode: EnFact to start, switched to Contractor in Admin", async () => {
  const mode = (name) => page.getAttribute(`[role="radiogroup"][aria-label="Flow testing mode"] [role="radio"]:has-text("${name}")`, "aria-checked");
  assert.equal(await mode("EnFact"), "true");
  assert.equal(await mode("Contractor"), "false");
  await page.click('[role="radio"]:has-text("Contractor")');
  assert.equal(await mode("Contractor"), "true");
  assert.equal(await page.evaluate(() => localStorage.getItem("inspecta.flowMode")), "contractor");
  await page.click('[role="radio"]:has-text("EnFact")');
  assert.equal(await page.evaluate(() => localStorage.getItem("inspecta.flowMode")), "enfact");
});

test("add a keyword; it drives suggestions and survives a restart", async () => {
  await page.click('button:has-text("Keywords")');
  await page.click('button:has-text("ESR keywords")');
  await page.fill("input[type=search]", "fhr");
  assert.equal(await page.locator('button:has-text("Fire hose reel systems")').count(), 1, "search finds keywords");
  await page.fill("input[type=search]", "");
  await page.click('button:has-text("Miscellaneous")');
  assert.match(page.url(), /#\/admin\/keywords\/esr\/13$/);
  await page.fill('input[aria-label="New keyword"]', "Sump pump");
  await page.click('button[aria-pressed]:has-text("Near-certain")');
  await page.click('button:has-text("Add keyword")');
  await page.fill('input[aria-label="Sample note"]', "sump pump float switch stuck");
  await page.waitForTimeout(200);
  assert.match(await page.locator('button:has-text("Matched")').first().innerText(), /Miscellaneous[\s\S]*sump pump/);

  await pressBack(page);
  assert.match(page.url(), /#\/admin\/keywords\/esr$/);
  await page.reload();
  await page.waitForTimeout(2300);
  assert.equal(await page.locator("text=Enter admin PIN").count(), 1, "locked again after a restart");
  await enterPin("2021");
  assert.equal(await page.locator('button:has-text("Miscellaneous") >> text=EDITED').count(), 1, "kept after restart");

  await go(page, app, "/site/s1/finding/f0/note", 1500);
  await page.click('button:has-text("Quick add")');
  await scrollFindingToBottom(page);
  assert.equal(await page.locator('button:has-text("Miscellaneous") >> text=BEST').count(), 1);
});

test("share the keyword file, reset, and load it back", async () => {
  await openAdmin("/admin/keywords", "Share keyword changes");
  const file = await download(page, () => page.click('button:has-text("Share keyword changes")'));
  assert.match(file.name, /^inspecta-keywords-\d{4}-\d{2}-\d{2}\.json$/);
  await page.click('button:has-text("Reset keywords")');
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(await page.locator("text=Built-in list, no changes").count(), 1);
  await page.setInputFiles('input[type=file][accept*=".json"]', file.path);
  await page.getByRole("button", { name: "Load", exact: true }).click();
  assert.equal(await page.locator("text=1 edited on this phone").count(), 1);
});

test("learned keywords: listed after a pick, removable, and a changed pick is taken back", async () => {
  await go(page, app, "/site/s1/finding/f0/note", 1500);
  await page.fill("#noteInput", "Float valve stuck open");
  await page.click('button:has-text("Quick add")');
  await page.click('button:has-text("Browse all")');
  await page.fill("input[type=search]", "hydrant");
  await page.click('.sheet-panel button:has-text("Fire hydrant system")');
  await page.click('button:has-text("Change")');
  await page.click('button:has-text("Browse all")');
  await page.fill("input[type=search]", "booster");
  await page.click('.sheet-panel button:has-text("Fire main")');
  await page.click('button:has-text("Save & close")');
  await page.waitForURL(/#\/site\/s1\/findings$/); // saved and back on the list

  await openAdmin("/admin/keywords/learned", "Make keyword");
  const text = await page.locator("body").innerText();
  assert.ok(text.includes("float") && text.includes("Fire main"), "learned words shown");
  assert.ok(!text.includes("Fire hydrant system"), "the changed pick was taken back");
  const rows = await page.locator('button:has-text("Make keyword")').count();
  await page.click('button[aria-label="Remove valve"]');
  assert.equal(await page.locator('button:has-text("Make keyword")').count(), rows - 1);
});

test("change the PIN, then reset a forgotten one with this phone's recovery code", async () => {
  await openAdmin("/admin", "Change PIN");
  await page.click('button:has-text("Change PIN")');
  await enterPin("5555");
  await enterPin("5555");
  assert.equal(await page.locator("text=PIN changed").count(), 1);

  await page.evaluate(() => localStorage.setItem("inspecta.adminRecovery", "K7QM-2XPA"));
  await page.reload();
  await page.waitForTimeout(2300);
  await enterPin("2021");
  assert.equal(await page.locator("text=Wrong PIN").count(), 1, "old PIN no longer works");
  await page.click("text=Forgot PIN?");
  await page.fill('input[aria-label="Recovery code"]', "nope");
  await page.click('button:has-text("Continue")');
  assert.equal(await page.locator("text=isn't right").count(), 1);
  await page.fill('input[aria-label="Recovery code"]', "k7qm 2xpa");
  await page.click('button:has-text("Continue")');
  await enterPin("7777");
  await enterPin("7777");
  assert.equal(await page.locator('button:has-text("Keywords")').count(), 1);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
