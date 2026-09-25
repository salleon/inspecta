// Export: the "uncategorised" popup, the Categorise screen (skip rounds,
// ‹ Previous to fix a mis-tap), and the grouped Excel and PDF.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { startApp, openPage, go, seed, categories, download } from "./helpers.mjs";

let app;
let page;
let errors;

// the category codes offered on the Categorise screen, in order
const offered = () =>
  page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.querySelector("span")?.textContent ?? "").filter((t) => /^\d+(\.\d+)*$/.test(t)));
const pickCode = (code) => page.locator(`button:has(> span:text-is("${code}"))`).first().click();

const current = () =>
  page.evaluate(() => [...document.querySelectorAll("div")].find((d) => d.style.fontSize === "15px" && d.style.fontWeight === "800" && d.innerText !== "Categorise")?.innerText);

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  const notes = [
    ["f0", "Exit sign not illuminated", "critical"],
    ["f1", "Extinguisher missing from bracket, no service tag", "non-critical"],
    ["f2", "Loose cable tray cover", "note-only"],
    ["f3", "Fire damper access panel missing", "non-critical"],
    ["f4", "1.8.3 still present", "non-compliance"],
    ["f5", "Logbook not on site", "recommend"], // no photo
  ];
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower", address: "1 Harbour St" }],
    findings: notes.map(([id, note, defectType], i) => ({ id, siteId: "s1", note, defectType, location: `Area ${i}`, level: `Level ${i}` })),
    photos: notes.slice(0, 5).map(([id], i) => ({ id: `p${i}`, findingId: id, siteId: "s1", color: `hsl(${i * 60},40%,45%)` })),
  });
});

after(async () => {
  await app?.close();
});

test("Categorise: pick, fix a mis-tap with Previous, skip, then skipped ones come back", async () => {
  await go(page, app, "/site/s1/export", 2500);
  await page.click("text=Share PDF");
  assert.equal(await page.locator("text=6 findings are uncategorised").count(), 1);
  await page.click("text=Categorise now");
  await page.waitForTimeout(400);
  assert.equal(await page.locator('button:has-text("Previous")').count(), 0, "no Previous on the first");

  assert.equal(await current(), "Exit sign not illuminated");
  await page.locator('button:has-text("Illuminated exit signs")').first().click();
  await page.waitForTimeout(300);

  // mis-tap on the extinguisher, then go back and fix it
  assert.equal(await current(), "Extinguisher missing from bracket, no service tag");
  const [best, wrong] = await offered();
  assert.equal(best, "5.5");
  await pickCode(wrong);
  await page.waitForTimeout(300);
  assert.equal((await categories(page)).f1, wrong);
  await page.click('button:has-text("Previous")');
  await page.waitForTimeout(300);
  assert.match(await page.locator("text=You picked").innerText(), new RegExp(`You picked ${wrong.replace(".", "\\.")} `));
  await page.locator('button:has-text("Portable fire extinguishers")').first().click();
  await page.waitForTimeout(300);
  assert.equal((await categories(page)).f1, "5.5");
  const memory = await page.evaluate(() => JSON.parse(localStorage.getItem("inspecta.esrMemory") || "{}").extinguisher);
  assert.deepEqual(memory, { "5.5": 1 }, "the mis-tap was unlearnt");

  assert.equal(await current(), "Loose cable tray cover");
  await page.click("text=Skip finding");
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Fire dampers")').first().click(); // f3
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Solid core doors")').first().click(); // f4 (1.8.3 → 1.8)
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Miscellaneous")').first().click(); // f5
  await page.waitForTimeout(300);

  // round 2: the skipped one
  assert.equal(await page.locator("text=Skipped findings").count(), 1);
  assert.equal(await current(), "Loose cable tray cover");
  const pdf = await download(page, () => page.click("text=Skip to export"));
  const bytes = await readFile(pdf.path);
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.deepEqual(await categories(page), { f0: "3.1", f1: "5.5", f2: "-", f3: "6.3.4", f4: "1.8", f5: "13" });
});

test("Excel: blue / yellow / grey rows, refs, kept old number in purple, Uncategorised last", async () => {
  const xlsx = await download(page, () => page.click("text=Share Excel")); // asked once per visit
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx.path);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const ref = row.getCell(1);
    const text = row.getCell(2).value ?? "";
    if (ref.value === null && text === "") return; // extra photo rows
    rows.push([ref.value ?? "", String(text).split("\n").pop(), ref.fill?.fgColor?.argb ?? ""]);
  });
  assert.deepEqual(
    rows.map((r) => r.slice(0, 2)),
    [
      ["1", "Structure Fire Protection and Compartmentation"],
      ["1.8", "Solid core doors"],
      ["1.8.3", "Area 4"],
      ["3", "Signs"],
      ["3.1", "Illuminated exit signs"],
      ["3.1.1", "Area 0"],
      ["5", "Fire-fighting Services and Equipment"],
      ["5.5", "Portable fire extinguishers"],
      ["5.5.1", "Area 1"],
      ["6", "Air Handling Systems"],
      ["6.3", "Fire control operation associated with mechanical ventilation of air conditioning systems"],
      ["6.3.4", "Fire dampers"],
      ["6.3.4.1", "Area 3"],
      ["13", "Miscellaneous"],
      ["13.1", "Area 5"],
      ["", "Uncategorised"],
      ["", "Area 2"],
    ],
  );
  const fill = Object.fromEntries(rows.map(([ref, , argb]) => [ref || "uncat", argb]));
  assert.equal(fill["1"], "FF99CCFF", "blue section");
  assert.equal(fill["1.8"], "FFD9D9D9", "grey item");
  assert.equal(fill["6.3"], "FFFFFFCC", "yellow 6.3");
  assert.equal(fill["1.8.3"], "FFB1A0C7", "kept old number tinted purple");
  assert.equal(fill["3.1.1"], "", "new finding not tinted");
  const refCell = ws.getRow(ws.getColumn(1).values.indexOf("3.1.1")).getCell(1);
  assert.deepEqual([refCell.alignment.horizontal, refCell.alignment.vertical], ["left", "top"]);
});

test("photo-less findings are in the PDF", async () => {
  await go(page, app, "/site/s1/export", 2500);
  const pdf = await download(page, async () => {
    await page.click("text=Share PDF");
    await page.click("text=Export anyway"); // one finding is still uncategorised
  });
  const text = (await readFile(pdf.path)).toString("latin1");
  assert.ok(text.includes("Logbook not on site"), "photo-less finding present");
  assert.ok(text.includes("No photo"), "No photo box drawn");
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
