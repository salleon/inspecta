// Customised reports on the export page: Create Customised Report (name,
// bulk refine findings with Skip, pick the findings, organise by time taken
// or ESR category), the report's own chip, its own PDF named after it, kept
// after a restart, and changed or deleted with a long-press.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { startApp, openPage, go, seed, download, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const F = [
  ["f1", "Exit sign not illuminated", "Level 1", "Stair 1", "3.1", "critical"],
  ["f2", "Fire door does not self-close", "Level 2", "Stair 2", "1.6", "critical"],
  ["f3", "Extinguisher service tag expired", "Level 3", "Stair 3", "5.5", "non-critical"],
  ["f4", "Hose reel obstructed by storage", "Level 1", "Carpark", "5.4", "non-compliance"],
  ["f5", "Fire door hinge damaged", "Level 1", "Stair 1", "1.6", "critical"],
];

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower", address: "1 Harbour St" }],
    findings: F.map(([id, note, level, location, esrCategory, defectType]) => ({ id, siteId: "s1", note, level, location, esrCategory, defectType })),
    photos: F.map(([id], i) => ({ id: `p${i}`, findingId: id, siteId: "s1", color: `hsl(${i * 60},40%,45%)` })),
    // a flow test started but nothing read: no tab in the Excel
    flowTests: [{ id: "t1", siteId: "s1", kind: "sprinkler", name: "Sprinkler", k: 534.15, testedAt: 0, order: 0, createdAt: 0, updatedAt: 0, sections: [{ name: "", rows: [{ hg: "2", flow: "", dis: "", suc: "" }] }], demand: [] }],
  });
});

after(async () => {
  await app?.close();
});

const sheet = () => page.locator('[role="dialog"][aria-label="Create Customised Report"]');

test("Create Customised Report: name, bulk refine (Skip in orange, groups from the findings), pick, organise, Done", async () => {
  await go(page, app, "/site/s1/export", 2500);
  await page.click("text=✎ Create Customised Report");
  assert.equal(await sheet().count(), 1);
  // bulk refine options come from the findings: levels, locations, types, ESR categories, with counts
  for (const t of ["Every finding · 5", "Level 1 · 3", "Stair 1 · 2", "Carpark · 1", "Critical · 3", "1.6 Fire Doors · 2"]) assert.equal(await sheet().locator(`button:has-text("${t}")`).count(), 1, t);
  const skip = sheet().locator('button:has-text("Skip")');
  assert.equal(await skip.evaluate((e) => getComputedStyle(e).color), "rgb(245, 165, 92)", "Skip orange to start");
  assert.equal(await page.locator('button:has-text("Pick findings")').isDisabled(), true, "needs a name");
  await page.fill('[aria-label="Report name"]', "Level 1");
  await sheet().locator('button:has-text("Level 1 · 3")').click();
  assert.notEqual(await skip.evaluate((e) => getComputedStyle(e).color), "rgb(245, 165, 92)", "Skip no longer highlighted");
  await page.click('button:has-text("Pick findings")');
  const boxes = page.locator('[role="dialog"][aria-label="Pick findings"] [role="checkbox"]');
  assert.equal(await boxes.count(), 5);
  assert.deepEqual(await boxes.evaluateAll((els) => els.filter((e) => e.getAttribute("aria-checked") === "true").map((e) => e.getAttribute("aria-label"))), ["Exit sign not illuminated", "Hose reel obstructed by storage", "Fire door hinge damaged"]);
  await page.click('[role="checkbox"][aria-label="Hose reel obstructed by storage"]');
  await page.click('[role="radio"]:has-text("Time taken")');
  await page.click('button:has-text("Done")');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('button:has-text("Level 1 · 2")').count(), 1, "its chip, selected");
  const paper = await page.locator("text=Harbour Tower - Level 1").count();
  assert.equal(paper, 1);
  assert.equal(await page.locator("text=2 findings · by time taken").count(), 1);
  assert.equal(await page.locator("text=Fire door does not self-close").count(), 0, "only its findings");
  assert.equal(await page.locator("text=Fire door hinge damaged").count(), 1);
});

test("its PDF is named after it and has only its findings; Whole site still has all", async () => {
  const pdf = await download(page, async () => {
    await page.click("text=Share PDF");
    if (await page.locator("text=Export anyway").count()) await page.click("text=Export anyway");
  });
  assert.match(pdf.name, /^harbour-tower-level-1/);
  const text = (await readFile(pdf.path)).toString("latin1");
  assert.ok(text.includes("Fire door hinge damaged") && text.includes("Exit sign not illuminated"));
  assert.ok(!text.includes("Extinguisher service tag expired"));
  await page.click('button:has-text("Whole site · 5")');
  assert.equal(await page.locator("text=Extinguisher service tag expired").count(), 1);
});

test("the Excel has no flow test tab when the site's flow tests have nothing read", async () => {
  const xl = await download(page, async () => {
    await page.click("text=Share Excel");
    if (await page.locator("text=Export anyway").count()) await page.click("text=Export anyway");
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await readFile(xl.path));
  assert.equal(wb.worksheets.length, 1, wb.worksheets.map((w) => w.name).join(", "));
});

test("kept after a restart; long-press to change it or delete it", async () => {
  await page.reload();
  await page.waitForTimeout(600);
  await go(page, app, "/site/s1/export", 2500);
  const chip = page.locator('button[aria-label="Level 1 report"]');
  assert.equal(await chip.count(), 1, "saved with the site");
  // long-press: change (the sheet comes back with its name, Skip keeps its findings)
  await chip.dispatchEvent("pointerdown");
  await page.waitForTimeout(700);
  await chip.dispatchEvent("pointerup");
  await page.click('[role="menuitem"]:has-text("Change")');
  assert.equal(await page.inputValue('[aria-label="Report name"]'), "Level 1");
  await page.click('button:has-text("Pick findings")');
  assert.equal(await page.locator('[role="checkbox"][aria-checked="true"]').count(), 2);
  await pressBack(page);
  await pressBack(page);
  assert.equal(await sheet().count(), 0);
  // long-press: delete, asks first
  await chip.dispatchEvent("pointerdown");
  await page.waitForTimeout(700);
  await chip.dispatchEvent("pointerup");
  await page.click('[role="menuitem"]:has-text("Delete")');
  await page.click("button:has-text('Delete') >> nth=-1");
  await page.waitForTimeout(300);
  assert.equal(await chip.count(), 0);
  assert.equal(await page.locator("text=Exit sign not illuminated").count(), 1, "findings stay");
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
