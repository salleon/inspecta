import type { Workbook, Worksheet } from "exceljs";
import type { Site, SpfSystem, StairTest } from "../db/types";
import { getStamped } from "../db/db";
import { photosTitle, stairPages, type StairPage, type StairTable } from "./stairPrint";
import { sheetName } from "./excelSheetName";
import { EXPORT_MAX_EDGE, STAMP_VERSION, watermarkBlob } from "./watermark";

// Stair tests in Excel, laid out as the PDF (lib/stairPrint; the "Stair
// report layout" design): a sheet per page, in the same order, top to
// bottom the stair's name, the details two to a row, the reading tiles
// three to a row, the doors table, the checks one to a row, then the notes.
// Every column is the same width and each cell holds one short line, so
// nothing is cut off; only the notes wrap, in one wide cell sized to them.
// Numbers go in as numbers so they can be worked with. Then the photo
// appendix on a sheet of its own.

const FONT = "Arial";
const INK = "FF14212E";
const SOFT = "FF4A6175";
const NAVY = "FF0B3550";
const LINE = "FFD5DEE6";
const TILE = "FFC9D6E0";
const BAND = "FFF3F6F9";
const FAIL_FILL = "FFFFD9D4";
const FAIL_INK = "FFB3261E";
const WARN_FILL = "FFFFF0B8";
const WARN_INK = "FF6B4A00";
const COLS = 6; // at least; a runs table with more runs widens the sheet
const COL_W = 16;

const value = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
};
const thin = (argb: string) => ({ style: "thin" as const, color: { argb } });

// a running sheet: rows written top to bottom
function writer(ws: Worksheet, across: number) {
  let r = 1;
  const font = (o: { bold?: boolean; size?: number; color?: string } = {}) => ({ name: FONT, bold: o.bold, size: o.size ?? 10, color: { argb: o.color ?? INK } });
  const w = {
    get row() {
      return r;
    },
    skip(n = 1) {
      r += n;
    },
    // a line of text in the first cell, running on across the empty cells beside it
    line(text: string, o: { bold?: boolean; size?: number; color?: string; height?: number } = {}) {
      const c = ws.getCell(r, 1);
      c.value = text;
      c.font = font(o);
      if (o.height) ws.getRow(r).height = o.height;
      r++;
    },
    heading(text: string) {
      w.line(text.toUpperCase(), { bold: true, size: 9, color: NAVY, height: 18 });
    },
    // text that wraps, merged across columns `from` to the last; the row sized to it
    wrapped(label: string, text: string, from = 2) {
      const l = ws.getCell(r, 1);
      l.value = value(label);
      l.font = font({ bold: true, size: 9, color: NAVY });
      l.alignment = { vertical: "top", horizontal: "left" };
      ws.mergeCells(r, from, r, across);
      const c = ws.getCell(r, from);
      c.value = text;
      c.font = font({ size: 10 });
      c.alignment = { wrapText: true, vertical: "top" };
      const perLine = Math.max(10, (across - from + 1) * COL_W * 1.05);
      const lines = text.split("\n").reduce((n, t) => n + Math.max(1, Math.ceil(t.length / perLine)), 0);
      ws.getRow(r).height = Math.max(15, lines * 13 + 4);
      for (let i = 1; i <= across; i++) ws.getCell(r, i).border = { top: thin(LINE), bottom: thin(LINE), left: i === 1 || i === from ? thin(LINE) : undefined, right: i === across || i === from - 1 ? thin(LINE) : undefined };
      r++;
    },
    font,
  };
  return w;
}

function table(ws: Worksheet, w: ReturnType<typeof writer>, t: StairTable, across: number) {
  w.heading(t.title);
  // a last column of text (what changed before a run) runs on across the sheet
  const last = t.widths.length;
  const spread = (t.align[last - 1] ?? "c") === "l" && last < across;
  const merge = () => {
    if (spread) ws.mergeCells(w.row, last, w.row, across);
  };
  if (t.head) {
    t.head.forEach((h, i) => {
      const c = ws.getCell(w.row, i + 1);
      c.value = h;
      c.font = w.font({ bold: true, size: 8.5, color: "FFFFFFFF" });
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = { top: thin(NAVY), bottom: thin(NAVY), left: thin(NAVY), right: thin(NAVY) };
    });
    merge();
    ws.getRow(w.row).height = 32;
    w.skip();
  }
  for (const row of t.rows) {
    row.cells.forEach((v, i) => {
      const fail = !!row.fails[i];
      const warn = !fail && !!row.warns?.[i];
      const c = ws.getCell(w.row, i + 1);
      c.value = value(v);
      c.font = w.font({ size: 9, bold: (i === 0 && t.bold) || fail || warn, color: fail ? FAIL_INK : warn ? WARN_INK : v === "–" ? "FF9AABB9" : INK });
      c.alignment = { horizontal: (t.align[i] ?? "c") === "l" ? "left" : "center", vertical: "middle" };
      c.border = { top: thin(LINE), bottom: thin(LINE), left: thin(LINE), right: thin(LINE) };
      if (fail || warn) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fail ? FAIL_FILL : WARN_FILL } };
    });
    merge();
    w.skip();
  }
  if (t.key) w.line(t.key, { size: 8, color: SOFT });
  w.skip();
}

function stairSheet(wb: Workbook, page: StairPage) {
  const across = Math.max(COLS, ...page.tables.map((t) => t.widths.length));
  const ws = wb.addWorksheet(sheetName(wb, page.sheet, "Stair"), {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  ws.columns = Array.from({ length: across }, () => ({ width: COL_W }));
  const w = writer(ws, across);
  w.line(page.title, { bold: true, size: 15, height: 22 });
  w.line(page.stair, { bold: true, size: 15, height: 22 });
  if (page.note) w.line(page.note, { size: 9, color: SOFT });
  w.skip();

  // details: two to a row, each value running on into the empty cell beside it
  for (let i = 0; i < page.details.length; i += 2) {
    page.details.slice(i, i + 2).forEach((d, j) => {
      const l = ws.getCell(w.row, 1 + j * 3);
      l.value = d.label;
      l.font = w.font({ bold: true, size: 9, color: NAVY });
      const v = ws.getCell(w.row, 2 + j * 3);
      v.value = value(d.value || "–");
      v.font = w.font();
      v.alignment = { horizontal: "left" };
    });
    for (let c = 1; c <= across; c++) ws.getCell(w.row, c).border = { top: thin(LINE), bottom: thin(LINE) };
    w.skip();
  }
  w.skip();

  // the reading tiles: three to a row, each two cells wide, a line to a row
  if (page.tiles.length) {
    w.heading("Stair readings");
    for (let i = 0; i < page.tiles.length; i += 3) {
      const group = page.tiles.slice(i, i + 3);
      const rows = Math.max(4, ...group.map((t) => 2 + t.lines.length));
      for (let k = 0; k < rows; k++) {
        group.forEach((t, j) => {
          const col = 1 + j * 2;
          ws.mergeCells(w.row, col, w.row, col + 1);
          const c = ws.getCell(w.row, col);
          const text = k === 0 ? t.label : k === 1 ? t.value : (t.lines[k - 2] ?? "");
          c.value = k === 1 ? value(text) ?? text : text;
          c.font = k === 1 ? w.font({ bold: true, size: 12, color: t.fail ? FAIL_INK : INK }) : w.font({ size: 8, color: k > 1 && t.fail ? FAIL_INK : SOFT });
          c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
          const edge = t.fail ? FAIL_INK : TILE;
          for (const x of [col, col + 1])
            ws.getCell(w.row, x).border = { top: k === 0 ? thin(edge) : undefined, bottom: k === rows - 1 ? thin(edge) : undefined, left: x === col ? thin(edge) : undefined, right: x === col + 1 ? thin(edge) : undefined };
        });
        const longest = Math.max(0, ...group.map((t) => (k === 0 ? t.label : k === 1 ? t.value : (t.lines[k - 2] ?? "")).length));
        ws.getRow(w.row).height = k === 1 ? 18 : Math.max(13, Math.ceil(longest / (COL_W * 2 * 1.2)) * 11 + 2);
        w.skip();
      }
      w.skip();
    }
  }

  for (const t of page.tables) table(ws, w, t, across);

  // the checks: one to a row, the check running across to its answer
  if (page.checks) {
    w.heading(page.checks.title);
    for (const ch of page.checks.list) {
      const l = ws.getCell(w.row, 1);
      l.value = ch.label;
      l.font = w.font({ size: 9 });
      const v = ws.getCell(w.row, 5);
      v.value = ch.value;
      v.font = w.font({ size: 9, bold: ch.value === "No", color: ch.value === "No" ? FAIL_INK : INK });
      v.alignment = { horizontal: "center" };
      if (ch.value === "No") v.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_FILL } };
      for (let c = 1; c <= 5; c++) ws.getCell(w.row, c).border = { top: thin(LINE), bottom: thin(LINE), left: c === 1 || c === 5 ? thin(LINE) : undefined, right: c >= 4 ? thin(LINE) : undefined };
      w.skip();
    }
    w.skip();
  }
  if (page.generalNotes.length) {
    w.heading("General notes");
    page.generalNotes.forEach((n, i) => w.wrapped(String(i + 1), n));
    w.skip();
  }
  if (page.notes.length) {
    w.heading("Test notes");
    page.notes.forEach((n, i) => w.wrapped(`${i + 1}${n.location ? ` · ${n.location}` : ""}`, n.text));
    w.skip();
  }
  w.line(page.footer, { size: 8, color: SOFT });
}

export function addStairSheets(wb: Workbook, tests: StairTest[], sys: SpfSystem, site: Pick<Site, "name" | "address">) {
  for (const test of tests) for (const page of stairPages(test, sys, site)) stairSheet(wb, page);
}

// The photo appendix (lib/stairPhotos), a sheet after the test's stair
// sheets: three photos across, each 5 × 6.61 cm (189 × 250 px) over two
// columns, its label table in the cells under it.
export async function addStairPhotoSheets(wb: Workbook, tests: StairTest[], sys: SpfSystem) {
  const { testPhotoItems, appendixPhotos, PHOTO_W, PHOTO_H } = await import("./stairPhotos");
  for (const test of tests) {
    const photos = appendixPhotos(await testPhotoItems(test), test, sys);
    if (!photos.length) continue;
    const ws = wb.addWorksheet(sheetName(wb, "Photos", "Photos"), {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = Array.from({ length: COLS }, (_, i) => ({ width: i % 2 ? 22 : 10 }));
    const w = writer(ws, COLS);
    w.line(photosTitle(test), { bold: true, size: 15, height: 22 });
    w.line("Photo appendix", { bold: true, size: 15, height: 22 });
    w.skip();
    const aspect = PHOTO_W / PHOTO_H;
    for (let i = 0; i < photos.length; i += 3) {
      const group = photos.slice(i, i + 3);
      // the photos: one tall row
      const top = w.row;
      ws.getRow(top).height = PHOTO_H;
      for (const [j, p] of group.entries()) {
        if (!p.photo) {
          const c = ws.getCell(top, 1 + j * 2);
          ws.mergeCells(top, 1 + j * 2, top, 2 + j * 2);
          c.value = "No photo";
          c.alignment = { horizontal: "center", vertical: "middle" };
          c.font = w.font({ size: 9, color: SOFT });
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
          continue;
        }
        const photo = p.photo;
        const key = `${STAMP_VERSION}:${EXPORT_MAX_EDGE}:${aspect.toFixed(4)}:${photo.takenAt}`;
        const tile = await getStamped(photo, "excel", key, async (src) => {
          const { jpeg, width, height } = await watermarkBlob(src, photo.takenAt, { cropAspect: aspect, maxEdge: EXPORT_MAX_EDGE });
          return { blob: jpeg, width, height };
        });
        const id = wb.addImage({ buffer: (await tile.blob.arrayBuffer()) as ArrayBuffer, extension: "jpeg" });
        ws.addImage(id, { tl: { col: j * 2, row: top - 1 }, ext: { width: 189, height: 250 } });
      }
      w.skip();
      // the label tables: "Photo n", then a row each for stair, level, location, run, note
      const lines = Math.max(...group.map((p) => p.rows.length)) + 1;
      for (let k = 0; k < lines; k++) {
        let tallest = 1;
        group.forEach((p, j) => {
          const a = ws.getCell(w.row, 1 + j * 2);
          const b = ws.getCell(w.row, 2 + j * 2);
          if (k === 0) {
            a.value = `Photo ${p.n}`;
            for (const c of [a, b]) {
              c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
              c.font = w.font({ bold: true, size: 9, color: "FFFFFFFF" });
            }
            return;
          }
          const row = p.rows[k - 1];
          if (!row) return;
          a.value = row[0];
          a.font = w.font({ bold: true, size: 8.5, color: NAVY });
          a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
          b.value = row[1];
          b.font = w.font({ size: 8.5 });
          b.alignment = { wrapText: true, vertical: "top" };
          for (const c of [a, b]) c.border = { top: thin(LINE), bottom: thin(LINE), left: thin(LINE), right: thin(LINE) };
          tallest = Math.max(tallest, Math.ceil(row[1].length / 24));
        });
        ws.getRow(w.row).height = Math.max(15, tallest * 11 + 4);
        w.skip();
      }
      w.skip();
    }
  }
}
