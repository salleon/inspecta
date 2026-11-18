import type { Workbook } from "exceljs";
import type { Site, SpfSystem, StairTest } from "../db/types";
import { stairPages, type StairRow } from "./stairPrint";
import { sheetName } from "./excelSheetName";

// Stair tests in Excel: a sheet per stair, laid out like the preview and the
// PDF (lib/stairPrint): title, details, the once-a-stair readings, the
// table with fails in red, then the fan checks and notes. Numbers go in as
// numbers so they can be worked with.

const FONT = "Arial";
const INK = "FF14212E";
const NAVY = "FF0B3550";
const LINE = "FFD5DEE6";
const FAIL_FILL = "FFFFD9D4";
const FAIL_INK = "FFB3261E";
const WARN_FILL = "FFFFF0B8";
const WARN_INK = "FF6B4A00";
const WIDTHS = [10, 16, 20, 18, 20];

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
      const ws = wb.addWorksheet(sheetName(wb, page.sheet ?? `SPF ${page.subtitle}`, "Stair"), {
        pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
      });
      const across = Math.max(WIDTHS.length, ...(page.tables ?? []).map((t) => t.head.length));
      ws.columns = Array.from({ length: across }, (_, i) => ({ width: page.tables ? (i === 0 ? 12 : 13) : WIDTHS[i] }));
      const width = (i: number) => ws.getColumn(i).width ?? 10;
      const wide = Array.from({ length: across }, (_, i) => width(i + 1)).reduce((a, b) => a + b, 0);
      // wrapped lines a text takes in a width (about a 9 pt character per unit, fewer in bold)
      const linesIn = (text: string, w: number, perChar = 1.15) => text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / Math.max(4, w * perChar))), 0);
      let r = 1;
      // a line of text across the whole sheet: merged, wrapped and tall enough, so nothing is cut off
      const put = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) => {
        const c = ws.getCell(r, 1);
        c.value = text;
        const size = opts.size ?? 10;
        c.font = { name: FONT, bold: opts.bold, size, color: { argb: opts.color ?? INK } };
        c.alignment = { wrapText: true, vertical: "top" };
        ws.mergeCells(r, 1, r, across);
        ws.getRow(r).height = Math.max(size * 1.45, linesIn(text, wide, (9 / size) * (opts.bold ? 0.9 : 1)) * size * 1.35 + 3);
        r++;
      };
      put(page.title, { bold: true, size: 15 });
      put(page.subtitle, { bold: true, size: 11 });
      r++;
      // a label in the first two columns, its value across the rest
      const pair = (label: string, text: string, opts: { bold?: boolean; fail?: boolean; border?: boolean } = {}) => {
        const l = ws.getCell(r, 1);
        l.value = label;
        l.font = { name: FONT, bold: true, size: 9, color: { argb: NAVY } };
        l.alignment = { wrapText: true, vertical: "top" };
        ws.mergeCells(r, 1, r, 2);
        const v = ws.getCell(r, 3);
        v.value = value(text) ?? "–";
        v.font = { name: FONT, bold: opts.bold || opts.fail, size: 9, color: { argb: opts.fail ? FAIL_INK : INK } };
        v.alignment = { wrapText: true, vertical: "top", horizontal: "left" };
        ws.mergeCells(r, 3, r, across);
        if (opts.fail) v.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_FILL } };
        if (opts.border) {
          l.border = box;
          v.border = box;
        }
        const valueW = wide - width(1) - width(2);
        ws.getRow(r).height = Math.max(linesIn(label, width(1) + width(2), 1), linesIn(text || "–", valueW, opts.bold || opts.fail ? 1 : 1.15)) * 12 + 3;
        r++;
      };
      for (const d of page.details) pair(d.label, d.value);
      r++;
      // the once-a-stair readings: a row each, what was read and where from under it
      if (page.boxes.length) {
        for (const b of page.boxes) pair(b.label, [b.value, ...(b.ref ?? [])].filter(Boolean).join("\n"), { bold: true, fail: b.fail, border: true });
        r++;
      }
      // a table: fails in red, a pass that's only just one in yellow
      const table = (heads: string[], rows: StairRow[]) => {
        heads.forEach((h, i) => {
          const c = ws.getCell(r, i + 1);
          c.value = h;
          c.font = { name: FONT, bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
          c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          c.border = box;
        });
        ws.getRow(r).height = 30;
        r++;
        for (const row of rows) {
          row.cells.forEach((v, i) => {
            const fail = row.fails[i];
            const warn = !fail && !!row.warns?.[i];
            const c = ws.getCell(r, i + 1);
            c.value = value(v);
            c.font = { name: FONT, size: 9, bold: i === 0 || fail || warn, color: { argb: fail ? FAIL_INK : warn ? WARN_INK : INK } };
            c.alignment = { horizontal: "center" };
            c.border = box;
            if (fail || warn) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fail ? FAIL_FILL : WARN_FILL } };
          });
          r++;
        }
        r++;
      };
      if (page.tables)
        for (const t of page.tables) {
          put(t.title, { bold: true, size: 9 });
          table(t.head, t.rows);
        }
      else table(page.head, page.rows);
      const block = (label: string, lines: string[]) => {
        put(label, { bold: true, size: 9 });
        for (const l of lines) put(l, { size: 9 });
        r++;
      };
      if (page.runs?.length) block("Runs", page.runs);
      if (page.readings?.length) block("Other readings", page.readings);
      if (page.fanLabel) block(page.fanLabel, [page.fan]);
      if (page.probe) block(page.probeLabel, page.probe);
      if (page.quick !== null) block("Three-monthly check (AS 1851-2012 Table 13.4.2.2)", [page.quick]);
      if (page.siteNotes) block("Site notes", page.siteNotes.split("\n"));
      if (page.notes.length) block("Notes", page.notes);
    }
  }
}


// A test's Photos & notes (lib/stairPhotos): a sheet of their own after its
// stair sheets, laid out exactly as the findings report's register
// (lib/excelExport), without ESR headings.
export async function addStairPhotoSheets(wb: Workbook, tests: StairTest[]) {
  const { testPhotoItems, PHOTOS_SUBTITLE } = await import("./stairPhotos");
  const { addFindingsSheet } = await import("./excelExport");
  for (const test of tests) {
    const items = await testPhotoItems(test);
    if (!items.length) continue;
    await addFindingsSheet(wb, sheetName(wb, `SPF ${PHOTOS_SUBTITLE}`, "Photos"), items.map((i) => ({ finding: i.finding, photos: i.photos })), test.testedAt);
  }
}
