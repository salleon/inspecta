import type { Workbook } from "exceljs";
import type { Site, SpfSystem, StairTest } from "../db/types";
import { stairPages } from "./stairPrint";

// Stair tests in Excel: a sheet per stair, laid out like the preview and the
// PDF (lib/stairPrint): title, details, the once-a-stair readings, the
// table with fails in red, then the fan checks and notes. Numbers go in as
// numbers so they can be worked with.

const FONT = "Arial";
const INK = "FF14212E";
const SOFT = "FF4A6175";
const NAVY = "FF0B3550";
const LINE = "FFD5DEE6";
const FAIL_FILL = "FFFFD9D4";
const FAIL_INK = "FFB3261E";
const WIDTHS = [10, 16, 20, 18, 20];

function sheetName(wb: Workbook, base: string): string {
  const clean = base.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Stair";
  let name = clean;
  for (let n = 2; wb.worksheets.some((w) => w.name.toLowerCase() === name.toLowerCase()); n++) name = `${clean.slice(0, 26)} (${n})`;
  return name;
}

const value = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
};

export function addStairSheets(wb: Workbook, tests: StairTest[], sys: SpfSystem, site: Pick<Site, "name" | "address">) {
  const thin = { style: "thin" as const, color: { argb: LINE } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  for (const test of tests) {
    for (const page of stairPages(test, sys, site)) {
      const ws = wb.addWorksheet(sheetName(wb, `SPF ${page.subtitle}`), {
        pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
      });
      ws.columns = WIDTHS.map((width) => ({ width }));
      let r = 1;
      const put = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) => {
        const c = ws.getCell(r, 1);
        c.value = text;
        c.font = { name: FONT, bold: opts.bold, size: opts.size ?? 10, color: { argb: opts.color ?? INK } };
        r++;
      };
      put(page.title, { bold: true, size: 15 });
      put(page.subtitle, { bold: true, size: 11 });
      r++;
      for (const d of page.details) {
        ws.getCell(r, 1).value = d.label;
        ws.getCell(r, 1).font = { name: FONT, bold: true, size: 9, color: { argb: NAVY } };
        ws.getCell(r, 2).value = d.value || "–";
        ws.getCell(r, 2).font = { name: FONT, size: 9, color: { argb: INK } };
        r++;
      }
      r++;
      // the once-a-stair readings: a label row, then the values
      page.boxes.forEach((b, i) => {
        const col = i + 2;
        const lab = ws.getCell(r, col);
        lab.value = b.label;
        lab.font = { name: FONT, size: 8, color: { argb: SOFT } };
        lab.alignment = { wrapText: true, vertical: "top" };
        const v = ws.getCell(r + 1, col);
        v.value = b.value + (b.ref ? `  (${b.ref})` : "");
        v.font = { name: FONT, bold: true, size: 10, color: { argb: b.fail ? FAIL_INK : INK } };
        lab.border = box;
        v.border = box;
      });
      ws.getRow(r).height = 24;
      r += 3;
      // the table
      page.head.forEach((h, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = h;
        c.font = { name: FONT, bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
        c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        c.border = box;
      });
      ws.getRow(r).height = 30;
      r++;
      for (const row of page.rows) {
        row.cells.forEach((v, i) => {
          const c = ws.getCell(r, i + 1);
          c.value = value(v);
          c.font = { name: FONT, size: 9, bold: i === 0 || row.fails[i], color: { argb: row.fails[i] ? FAIL_INK : INK } };
          c.alignment = { horizontal: "center" };
          c.border = box;
          if (row.fails[i]) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_FILL } };
        });
        r++;
      }
      r++;
      const block = (label: string, lines: string[]) => {
        put(label, { bold: true, size: 9 });
        for (const l of lines) put(l, { size: 9 });
        r++;
      };
      block(page.fanLabel, [page.fan]);
      if (page.quick !== null) block("Three-monthly check (AS 1851-2012 Table 13.4.2.2)", [page.quick]);
      if (page.siteNotes) block("Site notes", page.siteNotes.split("\n"));
      if (page.notes.length) block("Notes", page.notes);
    }
  }
}

export async function buildStairWorkbook(tests: StairTest[], sys: SpfSystem, site: Pick<Site, "name" | "address">): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  addStairSheets(wb, tests, sys, site);
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
