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
const SOFT = "FF4A6175";
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
      if (page.boxes.length) {
        page.boxes.forEach((b, i) => {
          const col = i + 2;
          const lab = ws.getCell(r, col);
          lab.value = b.label;
          lab.font = { name: FONT, size: 8, color: { argb: SOFT } };
          lab.alignment = { wrapText: true, vertical: "top" };
          const v = ws.getCell(r + 1, col);
          v.value = b.value + (b.ref ? `  (${b.ref.join(" · ")})` : "");
          v.font = { name: FONT, bold: true, size: 10, color: { argb: b.fail ? FAIL_INK : INK } };
          lab.border = box;
          v.border = box;
        });
        ws.getRow(r).height = 24;
        r += 3;
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
      if (page.quick !== null) block("Three-monthly check (AS 1851-2012 Table 13.4.2.2)", [page.quick]);
      if (page.siteNotes) block("Site notes", page.siteNotes.split("\n"));
      if (page.notes.length) block("Notes", page.notes);
    }
  }
}


// A test's Photos & notes (lib/stairPhotos): a sheet of their own after its
// stair sheets, a row each: number, level and location, type, note, then
// its photos across.
const PHOTO_W = 220; // px
export async function addStairPhotoSheets(wb: Workbook, tests: StairTest[], sys: SpfSystem, site: Pick<Site, "name" | "address">) {
  const { testPhotoItems, excelTile, PHOTOS_SUBTITLE } = await import("./stairPhotos");
  const thin = { style: "thin" as const, color: { argb: LINE } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  for (const test of tests) {
    const items = await testPhotoItems(test);
    if (!items.length) continue;
    const ws = wb.addWorksheet(sheetName(wb, `SPF ${PHOTOS_SUBTITLE}`, "Photos"), {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    });
    const most = Math.max(1, ...items.map((i) => i.photos.length));
    ws.columns = [{ width: 5 }, { width: 24 }, { width: 15 }, { width: 44 }, ...Array.from({ length: most }, () => ({ width: 32 }))];
    // headed like the test's stair sheets: its title, then the site and date
    const first = stairPages(test, sys, site)[0];
    let top = 1;
    const put = (text: string, bold: boolean, size: number) => {
      const c = ws.getCell(top++, 1);
      c.value = text;
      c.font = { name: FONT, bold, size, color: { argb: INK } };
    };
    put(first?.title ?? "Stair pressurisation", true, 15);
    put(PHOTOS_SUBTITLE, true, 11);
    top++;
    for (const d of (first?.details ?? []).filter((x) => ["Site", "Date", "Test", "Tested by"].includes(x.label))) {
      // the label beside the narrow # column, the value running on from it
      ws.getCell(top, 2).value = d.label;
      ws.getCell(top, 2).font = { name: FONT, bold: true, size: 9, color: { argb: NAVY } };
      ws.getCell(top, 3).value = d.value || "–";
      ws.getCell(top, 3).font = { name: FONT, size: 9, color: { argb: INK } };
      top++;
    }
    top++;
    const headRow = top;
    const heads = ["#", "Level · location", "Type", "Note", ...Array.from({ length: most }, (_, i) => (most > 1 ? `Photo ${i + 1}` : "Photo"))];
    heads.forEach((h, i) => {
      const c = ws.getCell(headRow, i + 1);
      c.value = h;
      c.font = { name: FONT, bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = box;
    });
    let r = headRow + 1;
    for (const it of items) {
      const row = ws.getRow(r);
      const cells: [number, string | number | null][] = [[1, it.n], [2, it.place || null], [3, it.type?.label ?? null], [4, it.note || null]];
      for (const [col, v] of cells) {
        const c = row.getCell(col);
        c.value = v;
        c.font = { name: FONT, size: 9, bold: col === 1, color: { argb: INK } };
        c.alignment = { vertical: "top", horizontal: col === 1 ? "center" : "left", wrapText: true };
        c.border = box;
      }
      if (it.type) {
        const c = row.getCell(3);
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${it.type.bg.slice(1).toUpperCase()}` } };
        c.font = { name: FONT, size: 9, bold: true, color: { argb: `FF${it.type.text.slice(1).toUpperCase()}` } };
      }
      let tallest = 0;
      for (const [k, p] of it.photos.entries()) {
        const { blob, width, height } = await excelTile(p);
        const id = wb.addImage({ buffer: new Uint8Array(await blob.arrayBuffer()) as unknown as ArrayBuffer, extension: "jpeg" });
        const h = Math.round((PHOTO_W * height) / width);
        tallest = Math.max(tallest, h);
        ws.addImage(id, { tl: { col: 4 + k + 0.04, row: r - 1 + 0.04 } as never, ext: { width: PHOTO_W, height: h }, editAs: "oneCell" });
        row.getCell(5 + k).border = box;
      }
      const lines = Math.ceil((it.note.length || 1) / 55) + 1;
      row.height = Math.max(lines * 13, tallest ? tallest * 0.75 + 8 : 0);
      r++;
    }
    const note = ws.getCell(r + 1, 1);
    note.value = `${items.length} taken during testing (photos timestamped)`;
    note.font = { name: FONT, size: 8, italic: true, color: { argb: SOFT } };
  }
}
