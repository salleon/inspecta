// Flow tests (the Flow tests tab on a site): making one, the graph and
// result following the readings, and the site's Excel getting a tab per
// flow test in EnFact's template layout, with a real chart.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { startApp, openPage, go, seed, download, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const rows = (list) => list.map(([hg, dis, suc = "", rpm = "", amps = "", flow = "", flowUnit]) => ({ hg: String(hg), flow: String(flow), flowUnit, dis: String(dis), suc: String(suc), rpm: String(rpm), amps: String(amps) }));
const day = (y, m, d) => new Date(y, m - 1, d, 12).getTime();

// Three sites, also used for the example exports (FLOW_EXAMPLES=<dir>
// saves each site's Excel there)
export const SITES = [
  { id: "s1", name: "Coles Turramurra", address: "1 Rohini St, Turramurra", kind: "afss" },
  { id: "s2", name: "Westfield Hornsby", address: "236 Pacific Hwy, Hornsby", kind: "afss" },
  { id: "s3", name: "Coles NDC", address: "10 Roberts Rd, Eastern Creek", kind: "afss" },
];
export const FLOW_TESTS = [
  // 1. the usual: town main (fails the second demand point) and the electric pump, diesel not tested
  {
    id: "t1", siteId: "s1", kind: "sprinkler", name: "Sprinkler", k: 534.15, testedAt: day(2026, 9, 30),
    equipment: "80 mm / 20T Ambient", testedBy: "Wormald", comment: "Town main below demand at 1350 L/min. Electric pump satisfactory.",
    sections: [
      { name: "Town main", rows: rows([[0, 460], [2, 250], [4, 240], [6, 205], [8, 180]]) },
      { name: "Electric pump", rows: rows([[0, 980, 120, 2950, 48], [2, 750, 110, 2940, 52], [4, 670, 100, 2930, 55], [6, 430, 95, 2920, 58], [8, 250, 90, 2910, 61]]) },
      { name: "Diesel pump", rows: rows([[0, ""], [2, ""], [4, ""], [6, ""], [8, ""]]) },
    ],
    demand: [{ flow: "1100", kpa: "270" }, { flow: "1350", kpa: "240" }],
  },
  // 1b. hydrant on the same site: flows typed in L/s off the pitot
  {
    id: "t2", siteId: "s1", kind: "hydrant", name: "Hydrant", k: 0, testedAt: day(2026, 9, 30),
    equipment: "65 mm / Pitot", testedBy: "Wormald", comment: "Hydrant booster satisfactory.",
    sections: [
      { name: "Town main", rows: rows([["", 750, 300, "", "", 0, "sec"], ["", 700, 290, "", "", 2, "sec"], ["", 560, 280, "", "", 4.5, "sec"], ["", 420, 270, "", "", 6, "sec"]]) },
      { name: "Electric pump", rows: rows([["", ""]]) },
      { name: "Diesel pump", rows: rows([["", ""]]) },
    ],
    demand: [{ flow: "4.5", flowUnit: "sec", kpa: "275" }],
  },
  // 2. two diesels and a jockey pump: renamed and added supplies, four blocks
  {
    id: "t3", siteId: "s2", kind: "sprinkler", name: "Sprinkler · Zone B", k: 534.15, testedAt: day(2026, 10, 2),
    equipment: "100 mm / 20T", testedBy: "Chubb", comment: "All pumps satisfactory. Diesel 2 fuel tank at 60%.",
    sections: [
      { name: "Town main", rows: rows([[0, 520], [2, 380], [4, 330], [6, 260], [8, 190]]) },
      { name: "Diesel pump 1", rows: rows([[0, 1150, 30, 1920], [2, 1110, 30, 1926], [4, 1040, 20, 1923], [6, 970, 20, 1921], [8, 910, 10, 1917], [10, 830, 10, 1915]]) },
      { name: "Diesel pump 2", rows: rows([[0, 1140, 30, 1923], [2, 1090, 30, 1912], [4, 1040, 20, 1911], [6, 1000, 20, 1910], [8, 920, 10, 1908], [10, 850, 10, 1906]]) },
      { name: "Jockey pump", rows: rows([[0, 1200], [1, 1050], [2, 900]]) },
    ],
    demand: [{ flow: "900", kpa: "600" }, { flow: "1400", kpa: "450" }],
  },
  // 2b. a blank sheet for something that doesn't fit
  {
    id: "t4", siteId: "s2", kind: "blank", name: "Drencher valve test", testedAt: day(2026, 10, 2),
    columns: ["Valve", "Static (kPa)", "Residual (kPa)", "Time to open (s)", "Result"],
    cells: [["DV-1", "650", "480", "4", "Pass"], ["DV-2", "640", "455", "6", "Pass"], ["DV-3", "655", "300", "12", "Slow - service"]],
  },
  // 3. their Coles NDC combined system sheet
  {
    id: "t5", siteId: "s3", kind: "combined", name: "Combined system · Diesel 1 & 2", k: 3440.5, testedAt: day(2026, 9, 11),
    testedBy: "Chubb", comment: "PASS",
    sections: [
      { name: "Diesel 1", rows: rows([[0, 1150, 30, 1920], [5, 1110, 30, 1926], [10, 1040, 20, 1923], [15, 970, 20, 1921], [20, 910, 10, 1917]]) },
      { name: "Diesel 2", rows: rows([[0, 1150, 30, 1923], [5, 1090, 30, 1912], [10, 1040, 20, 1911], [15, 1000, 20, 1910], [20, 920, 10, 1908]]) },
    ],
    demand: [{ flow: "9970", kpa: "900" }, { flow: "14955", kpa: "585" }],
  },
];

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, { sites: SITES, findings: SITES.map((s, i) => ({ id: `f${i}`, siteId: s.id, note: "Exit sign not illuminated", esrCategory: "3.1" })), flowTests: FLOW_TESTS });
});

after(async () => {
  await app?.close();
});

async function exportExcel(siteId) {
  await go(page, app, `/site/${siteId}/export`, 1500);
  const file = await download(page, async () => {
    await page.click("text=Share Excel");
    await page.waitForTimeout(600);
    if (await page.locator("text=Skip to export").count()) await page.click("text=Skip to export");
  });
  if (process.env.FLOW_EXAMPLES) fs.copyFileSync(file.path, path.join(process.env.FLOW_EXAMPLES, `${siteId} ${file.name}`));
  return fs.readFileSync(file.path);
}

test("the Flow tests tab lists the site's tests with their results", async () => {
  await go(page, app, "/site/s1/findings");
  await page.click("text=Flow tests");
  await page.waitForTimeout(500);
  assert.ok(page.url().endsWith("?tab=flow"));
  assert.equal(await page.locator("text=ALPHA TEST").count(), 1);
  assert.equal(await page.locator("text=Town main below demand").count(), 1);
  assert.equal(await page.locator("text=Converter tool").count(), 1);
  await page.fill('[aria-label="Litres per second"]', "4.5");
  assert.equal(await page.inputValue('[aria-label="Litres per minute"]'), "270");
});

test("a new sprinkler test: readings fill the flow, the result follows, and it's saved", async () => {
  await go(page, app, "/site/s1/findings?tab=flow");
  await page.click("text=+ New flow test");
  await page.click("text=Sprinkler >> nth=-1");
  await page.waitForTimeout(800);
  assert.match(page.url(), /\/site\/s1\/flow\//);
  // flow from " Hg: 534.15 × √2
  assert.equal(await page.locator('[aria-label="Flow"]').nth(1).inputValue(), "755.4");
  const dis = page.locator('[aria-label="Discharge"]');
  for (const [i, v] of ["600", "500", "420", "350", "300"].entries()) await dis.nth(i).fill(v);
  await page.fill('[aria-label="Demand flow"]', "1000");
  await page.fill('[aria-label="Demand pressure"]', "300");
  await page.waitForTimeout(300);
  assert.equal(await page.locator("text=Supply 1: Above all demand points").count(), 1);
  // name it from the tab's list, then a second of the same kind numbers both
  await page.click('[aria-label="Supply 1: change name"]');
  await page.click('[role="menuitem"]:has-text("Diesel pump")');
  await page.click('[aria-label="Add a supply"]');
  await page.click('[aria-label="Supply 2: change name"]');
  assert.equal(await page.getByText('"Diesel pump" becomes "Diesel pump 1"').count(), 1);
  await page.click('[role="menuitem"]:has-text("Diesel pump 2")');
  assert.equal(await page.locator('[aria-label="Diesel pump 1"]').count(), 1);
  // a third, custom-named
  await page.click('[aria-label="Add a supply"]');
  await page.click('[aria-label="Supply 3: change name"]');
  await page.click('[role="menuitem"]:has-text("Custom…")');
  await page.fill('[aria-label="Supply name"]', "Fire pump 3");
  await page.click('button:has-text("Use")');
  // removing asks first; the other diesel goes back to its plain name
  await page.click('[aria-label="Diesel pump 2"]');
  await page.click('[aria-label="Diesel pump 2: change name"]');
  await page.click('[role="menuitem"]:has-text("Remove this supply")');
  await page.click('button:has-text("Cancel")');
  assert.equal(await page.locator('[aria-label="Diesel pump 2: change name"]').count(), 1, "kept after Cancel");
  await page.click('[aria-label="Diesel pump 2: change name"]');
  await page.click('[role="menuitem"]:has-text("Remove this supply")');
  await page.click('button:has-text("Remove")');
  await page.waitForTimeout(700);
  await pressBack(page);
  await page.waitForTimeout(600);
  assert.ok(page.url().endsWith("/site/s1/findings?tab=flow"), page.url());
  assert.equal(await page.locator("text=Flow tests · 3").count(), 1);
  const saved = await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("flowTests").objectStore("flowTests").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.find((t) => !["t1", "t2", "t3", "t4", "t5"].includes(t.id));
  });
  assert.deepEqual(saved.sections.map((s) => s.name), ["Diesel pump", "Fire pump 3"]);
  assert.deepEqual(saved.sections[0].rows.map((r) => r.dis), ["600", "500", "420", "350", "300"]);
});

test("deleting a flow test asks first", async () => {
  await go(page, app, "/site/s1/findings?tab=flow");
  await page.click("text=Sprinkler >> nth=-1");
  await page.waitForTimeout(700);
  await page.click("text=Delete flow test");
  await page.click("button:has-text('Delete') >> nth=-1");
  await page.waitForTimeout(700);
  assert.equal(await page.locator("text=Flow tests · 2").count(), 1);
});

test("the Excel gets a SPRINKLER and a HYDRANT tab in the template layout, with charts", async () => {
  const buf = await exportExcel("s1");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name).slice(1), ["SPRINKLER", "HYDRANT"]);
  const s = wb.getWorksheet("SPRINKLER");
  assert.equal(s.getCell("C1").value, "SPRINKLER FLOW TEST RESULTS");
  assert.equal(s.getCell("F3").value, "Coles Turramurra, 1 Rohini St, Turramurra");
  assert.equal(s.getCell("F6").value, "Wormald");
  assert.equal(s.getCell("I6").value, 1350);
  // Town main block, then Electric pump; the untested diesel is left out
  assert.equal(s.getCell("C9").value, "Town main");
  assert.equal(s.getCell("D12").value, 755.4);
  assert.equal(s.getCell("F12").value, 250);
  assert.equal(s.getCell("N15").value, "FAIL");
  assert.equal(s.getCell("C21").value, "Electric pump");
  assert.equal(s.getCell("G23").value, 120);
  assert.equal(s.getCell("H23").value, 2950);
  assert.equal(s.getCell("I22").value, "Amps");
  assert.equal(s.getCell("N26").value, "PASS");
  assert.notEqual(s.getCell("C33").value, "Diesel pump");
  const h = wb.getWorksheet("HYDRANT");
  assert.equal(h.getCell("B9").value, "Town main");
  assert.equal(h.getCell("B13").value, 270); // 4.5 L/s
  assert.equal(h.getCell("H5").value, 270);

  const zip = await JSZip.loadAsync(buf);
  const charts = Object.keys(zip.files).filter((n) => /^xl\/charts\/chart\d+\.xml$/.test(n));
  assert.equal(charts.length, 2);
  const chart = await zip.file(charts[0]).async("string");
  assert.match(chart, /'SPRINKLER'!\$D\$11:\$D\$15/);
  assert.match(chart, /Electric pump - 2026/);
  assert.match(await zip.file("[Content_Types].xml").async("string"), /drawingml\.chart\+xml/);
});

test("more supplies than the template has get their own blocks", async () => {
  const buf = await exportExcel("s2");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name).slice(1), ["SPRINKLER", "Drencher valve test"]);
  const s = wb.getWorksheet("SPRINKLER");
  assert.deepEqual(["C9", "C21", "C33", "C45"].map((c) => s.getCell(c).value), ["Town main", "Diesel pump 1", "Diesel pump 2", "Jockey pump"]);
  assert.equal(wb.getWorksheet("Drencher valve test").getCell("C6").value, 300);
});

test("a combined system goes on a Combined System tab like their sheet", async () => {
  const buf = await exportExcel("s3");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const s = wb.getWorksheet("Combined System");
  assert.equal(s.getCell("C1").value, "COMBINED SYSTEM FLOW TEST RESULTS");
  assert.equal(s.getCell("C9").value, "Diesel 1");
  assert.equal(s.getCell("D12").value, 7693.2);
  assert.equal(s.getCell("C21").value, "Diesel 2");
  assert.equal(s.getCell("N14").value, "PASS");
  assert.equal(s.getCell("N26").value, "PASS");
  assert.deepEqual(errors, []);
});
