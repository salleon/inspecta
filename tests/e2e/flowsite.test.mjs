// A flow testing site (the third site type): just its flow tests, and its
// own export: a preview page per test, a PDF with a page per test and an
// Excel with a sheet per test, named after it.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { startApp, openPage, go, seed, download, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const day = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
// flows as typed (534.15 × √" Hg on that rig), unless given
const rows = (list) => list.map(([hg, dis, flow = hg === "" ? "" : Math.round(534.15 * Math.sqrt(hg) * 10) / 10, flowUnit]) => ({ hg: String(hg), flow: String(flow), flowUnit, dis: String(dis), suc: "" }));

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "w1", name: "Woolworths Pymble", address: "12 Grandview St, Pymble", kind: "flow" }],
    flowTests: [
      {
        id: "a", siteId: "w1", kind: "sprinkler", name: "Sprinkler", k: 534.15, testedAt: day(2026, 10, 1), order: 0, createdAt: 0, updatedAt: 0,
        equipment: "80 mm / 20T", testedBy: "Wormald", comment: "Diesel pump fuel tank at 60%.",
        sections: [
          { name: "Electric pump", rows: rows([[0, 1150], [2, 1110], [4, 1040], [6, 970], [8, ""]]) },
          { name: "Diesel pump", rows: rows([[0, 1120], [2, 1080], [4, 1010], [6, 930]]) },
        ],
        demand: [{ flow: "1100", kpa: "650" }],
      },
      {
        id: "b", siteId: "w1", kind: "hydrant", name: "Hydrant", k: 0, testedAt: day(2026, 10, 1), order: 1, createdAt: 0, updatedAt: 0,
        sections: [{ name: "Booster pump", rows: rows([["", 640, 0, "sec"], ["", 585, 5, "sec"], ["", 500, 10, "sec"]]) }],
        demand: [{ flow: "10", flowUnit: "sec", kpa: "350" }],
      },
    ],
  });
});

after(async () => {
  await app?.close();
});

test("New site offers Flow testing; the home page groups flow testing sites", async () => {
  await go(page, app, "/");
  await page.reload();
  await page.waitForTimeout(1200);
  assert.equal(await page.getByText("Flow testing", { exact: true }).count(), 1, "the group heading");
  assert.equal(await page.getByText("2 flow tests").count(), 1);
  await page.click('[aria-label="Start new site inspection"]');
  await page.waitForTimeout(300);
  // the keyboard waits: nothing is focused until Site name is tapped
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "INPUT");
  await page.click('button:has-text("Flow testing")');
  // the picked kind in its own colour: flow testing blue (AFSS teal, Projects orange)
  assert.equal(await page.locator('button:has-text("Flow testing")').evaluate((e) => getComputedStyle(e).color), "rgb(90, 176, 255)");
  await page.click('button:has-text("Projects")');
  assert.equal(await page.locator('button:has-text("Projects")').evaluate((e) => getComputedStyle(e).color), "rgb(245, 165, 92)");
  await page.click('button:has-text("Flow testing")');
  assert.equal(await page.getByText("Just flow tests: no findings or photos.", { exact: false }).count(), 1);
  await page.fill('input[placeholder="Site name"]', "Aldi Gordon");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(800);
  // straight to its flow tests: no Findings tab
  assert.equal(await page.locator("text=+ New flow test").count(), 1);
  assert.equal(await page.locator("text=Findings ·").count(), 0);
  assert.equal(await page.locator('button:has-text("Export")').count(), 0, "nothing to export yet");
});

test("a flow testing site: Export above + New flow test opens a page per test", async () => {
  await go(page, app, "/site/w1/findings");
  assert.equal(await page.locator("text=Findings ·").count(), 0);
  await page.click('button:has-text("Export")');
  await page.waitForTimeout(800);
  assert.ok(page.url().endsWith("/site/w1/flow-export"), page.url());
  assert.equal(await page.locator('[data-testid="flow-page"]').count(), 2);
  const first = await page.locator('[data-testid="flow-page"]').first().innerText();
  assert.match(first, /SPRINKLER FLOW TEST RESULTS/);
  assert.match(first, /Electric pump – 2026\s*PASS/);
  assert.match(first, /Comments: Diesel pump fuel tank at 60%\./);
  assert.match(await page.locator('[data-testid="flow-page"]').nth(1).innerText(), /HYDRANT FLOW TEST RESULTS[\s\S]*Booster pump/);
  assert.equal(await page.getByText("page 1 of 2").count(), 1);
});

test("Export Excel: a sheet per test, named after it, legend on the right", async () => {
  const file = await download(page, () => page.click('button:has-text("Export Excel")'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(file.path));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Sprinkler", "Hydrant"]);
});

test("Export PDF: one page per test", async () => {
  await page.waitForTimeout(500);
  const file = await download(page, () => page.click('button:has-text("Export PDF")'));
  const pdf = fs.readFileSync(file.path).toString("latin1");
  assert.ok(pdf.startsWith("%PDF"));
  assert.equal(pdf.match(/\/Type \/Page\b/g)?.length, 2);
  await pressBack(page);
  await page.waitForTimeout(500);
  assert.ok(page.url().endsWith("/site/w1/findings"), page.url());
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
