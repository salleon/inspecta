// Projects sites: no ESR category box on a finding or chip in the list, no
// Categorise prompt at export, and a plain photo-first Excel (Photo ·
// Location · Notes · Date · Risk level) in the order the photos were taken.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { startApp, openPage, go, seed, download, scrollFindingToBottom } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app, { advanced: true }));
  const t = (h, m) => new Date(2026, 8, 29, h, m).getTime();
  await seed(page, {
    sites: [
      { id: "p1", name: "Riverside Apartments", kind: "project" },
      { id: "a1", name: "Harbour Tower", kind: "afss" },
    ],
    findings: [
      // list order deliberately different from photo order
      { id: "f0", siteId: "p1", note: "Exit sign not illuminated", location: "Lift lobby", level: "Level 2", defectType: "critical", esrCategory: "3.1" },
      { id: "f1", siteId: "p1", note: "Fire collar missing on PVC pipe", location: "Plant room", level: "Level 1", defectType: "non-compliance" },
      { id: "f2", siteId: "p1", note: "Fire door closer disconnected", location: "Corridor", level: "Level 1", defectType: "critical" },
      { id: "g0", siteId: "a1", note: "Fire door held open with a wedge", esrCategory: "1.6" },
      { id: "g1", siteId: "a1", note: "Exit sign still not illuminated", esrCategory: "3.1", defectType: "outstanding" },
      { id: "g2", siteId: "a1", note: "Door closer replaced", esrCategory: "1.6", defectType: "rectified" },
    ],
    photos: [
      { id: "ph0", findingId: "f0", siteId: "p1", takenAt: t(9, 48) },
      { id: "ph1", findingId: "f1", siteId: "p1", takenAt: t(9, 2) },
      { id: "ph2", findingId: "f2", siteId: "p1", takenAt: t(9, 15), color: "#8a7a64" },
      { id: "ph3", findingId: "f2", siteId: "p1", takenAt: t(9, 14), color: "#8a7a64" },
    ],
  });
});

after(async () => {
  await app?.close();
});

test("no ESR category on a Projects finding, still there on AFSS", async () => {
  await go(page, app, "/site/p1/finding/f0/note", 1200);
  await scrollFindingToBottom(page);
  assert.equal(await page.locator("text=ESR category").count(), 0);
  await go(page, app, "/site/a1/finding/g0/note", 1200);
  await scrollFindingToBottom(page);
  assert.equal(await page.locator("text=ESR category").count(), 1);
});

test("no category chip in the Projects findings list", async () => {
  await go(page, app, "/site/p1/findings", 1200);
  assert.equal(await page.locator("text=3.1").count(), 0);
});

test("Excel: Photo · Location · Notes · Date · Risk level, by photo time, no Categorise prompt", async () => {
  await go(page, app, "/site/p1/export", 2500);
  const xlsx = await download(page, () => page.click("text=Share Excel"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx.path);
  const ws = wb.worksheets[0];
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((c) => ws.getRow(1).getCell(c).value ?? null), ["Photo", "Location", "Notes", "Date", "Risk Level", null, null]);
  const rows = [];
  ws.eachRow((row, n) => {
    if (n > 1 && row.getCell(3).value) rows.push([row.getCell(2).value, row.getCell(3).value, row.getCell(4).value, row.getCell(5).value]);
  });
  assert.deepEqual(rows, [
    ["Level 1\nPlant room", "Fire collar missing on PVC pipe", "29/09/26\n09:02", "Non-compliance"],
    ["Level 1\nCorridor", "Fire door closer disconnected", "29/09/26\n09:14", "Critical"],
    ["Level 2\nLift lobby", "Exit sign not illuminated", "29/09/26\n09:48", "Critical"],
  ]);
  const photos = ws.getImages();
  assert.equal(photos.length, 4);
  assert.ok(photos.every((p) => p.range.tl.nativeCol === 0), "photos in the first column");
});

test("defect type: Rectified and Outstanding under their own heading on AFSS, not offered on Projects", async () => {
  await go(page, app, "/site/a1/finding/g0/note", 1200);
  await scrollFindingToBottom(page);
  await page.click("#defectTypeInput");
  await page.waitForTimeout(400);
  const sheet = page.locator(".sheet-panel").last();
  const labels = (await sheet.innerText()).split("\n").map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(labels.slice(1, 10), ["Critical", "Non-critical", "Non-compliance", "Recommend", "Note only", "FROM A PREVIOUS INSPECTION", "Rectified", "Outstanding", "Skip"]);
  await page.keyboard.press("Escape");
  await go(page, app, "/site/p1/finding/f1/note", 1200);
  await scrollFindingToBottom(page);
  await page.click("#defectTypeInput");
  await page.waitForTimeout(400);
  const projectSheet = await page.locator(".sheet-panel").last().innerText();
  assert.ok(!/Rectified|Outstanding|previous inspection/i.test(projectSheet), projectSheet);
});

test("AFSS Excel: the word under the Ref for Rectified / Outstanding", async () => {
  await go(page, app, "/site/a1/export", 2500);
  const xlsx = await download(page, async () => {
    await page.click("text=Share Excel");
    await page.waitForTimeout(600);
    if (await page.locator("text=Skip to export").count()) await page.click("text=Skip to export");
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx.path);
  const ws = wb.worksheets[0];
  const refs = [];
  ws.eachRow((row) => {
    const v = row.getCell(1).value;
    if (v?.richText) refs.push([v.richText.map((r) => r.text).join(""), v.richText[1].font.color.argb, v.richText[1].font.bold]);
  });
  // Rectified: closed on the inspection date, no suggested corrective action;
  // Outstanding: still Open, still gets one
  const byNote = {};
  ws.eachRow((row) => (byNote[row.getCell(3).value] = row));
  const rect = byNote["Door closer replaced"];
  const out = byNote["Exit sign still not illuminated"];
  assert.ok(rect.getCell(6).value instanceof Date, String(rect.getCell(6).value));
  assert.equal(rect.getCell(6).value.getTime(), rect.getCell(4).value.getTime());
  assert.equal(rect.getCell(6).numFmt, "dd/mm/yy");
  assert.equal(rect.getCell(7).value ?? null, null);
  assert.equal(out.getCell(6).value, "Open");
  assert.ok(out.getCell(7).value?.richText, "Outstanding keeps its suggestion");
  assert.deepEqual(refs.sort(), [
    ["1.6.2\nRectified", "FF0070C0", true],
    ["3.1.1\nOutstanding", "FF7030A0", true],
  ].sort());
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
