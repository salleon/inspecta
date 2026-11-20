import type { Workbook } from "exceljs";
import type { FfcpTest, Site } from "../db/types";
import { FAN_CHECKS, HEADS, INDICATION, modesTested, reportNoteRows, reportResults } from "./ffcp";
import { sheetName } from "./excelSheetName";
import { numericDate } from "./dates";
import { excelLogo } from "./flowExcel";
import { reportAccent } from "./reportBranding";

// FFCP tests in Excel: one sheet holding them all, each laid out like its
// PDF pages (lib/ffcpPdf, the "FFCP report layout" design): the heading and
// logo, the details, the Result (each mode, then the whole test), a table per
// mode tested (fan name, indication | manual control, ✓ ✗ and a grey –,
// fails shaded red), then the notes table.

const FONT = "Arial";
const INK = "FF14212E";
const SOFT = "FF4A6175";
const NAVY = "FF0B3550";
const GROUP = "FF16486B";
const LINE = "FFD5DEE6";
const FAIL_FILL = "FFFFD9D4";
const FAIL_INK = "FFB3261E";
const PASS_INK = "FF127A3E";
const PASS_FILL = "FFDFF3E6";

// columns: A a margin, B the notes' #, C the fan's name (B:C in the mode
// tables), D–H the five checks; about an A4 page's width
const WIDTHS = [2, 5, 24, 12.6, 12.6, 12.6, 12.6, 12.6];
const FIRST = 2;
const LAST = 8;

export async function addFfcpSheet(wb: Workbook, tests: FfcpTest[], site: Pick<Site, "name" | "address">) {
  if (!tests.length) return;
  const logo = await excelLogo(wb).catch(() => null);
  const ws = wb.addWorksheet(sheetName(wb, "FFCP", "FFCP"));
  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const thin = { style: "thin" as const, color: { argb: LINE } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const split = { style: "medium" as const, color: { argb: "FF9FB3C3" } };
  const font = (extra: Partial<import("exceljs").Font> = {}) => ({ name: FONT, size: 10, color: { argb: INK }, ...extra });
  const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
  const merge = (row: number, a: number, b: number) => {
    if (b > a) ws.mergeCells(row, a, row, b);
    return ws.getCell(row, a);
  };
  const head = (c: import("exceljs").Cell, text: string, argb: string) => {
    c.value = text;
    c.font = font({ bold: true, size: 8.5, color: { argb: "FFFFFFFF" } });
    c.fill = fill(argb);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = box;
  };
  const section = (text: string) => {
    const c = ws.getCell(r, FIRST);
    c.value = text.toUpperCase();
    c.font = font({ size: 9, bold: true, color: { argb: NAVY } });
    r++;
  };
  // the logo's left edge, so its right edge sits on the page's
  const px = WIDTHS.map((w) => w * 7 + 5);
  const logoAt = () => {
    let edge = px.reduce((a, b) => a + b, 0) - (logo?.w ?? 0);
    let at = 0;
    for (const w of px) {
      if (edge <= w) break;
      edge -= w;
      at++;
    }
    return { at, off: Math.round(edge * 9525) };
  };

  let r = 1;
  for (const test of tests) {
    // as the PDF: "Fire fan control panel", the blue bar, the site's name, its address and the panel
    const top = r;
    ws.getRow(r).height = 22;
    ws.getCell(r, FIRST).value = "Fire fan control panel";
    ws.getCell(r, FIRST).font = font({ size: 14, bold: true });
    ws.getCell(r, FIRST).alignment = { vertical: "bottom" };
    r++;
    ws.getRow(r).height = 4;
    ws.getCell(r, FIRST).fill = fill(`FF${reportAccent().slice(1).toUpperCase()}`);
    r++;
    ws.getRow(r).height = 22;
    ws.getCell(r, FIRST).value = site.name.trim();
    ws.getCell(r, FIRST).font = font({ size: 14, bold: true });
    r++;
    const note = [site.address?.trim(), test.location?.trim()].filter(Boolean).join(" · ");
    if (note) {
      ws.getCell(r, FIRST).value = note;
      ws.getCell(r, FIRST).font = font({ size: 9, color: { argb: SOFT } });
      r++;
    }
    if (logo) {
      const { at, off } = logoAt();
      ws.addImage(logo.id, { tl: { nativeCol: at, nativeColOff: off, nativeRow: top - 1, nativeRowOff: 0 } as never, ext: { width: logo.w, height: logo.h }, editAs: "oneCell" });
    }
    r++;

    // the details: site, date, panel, tested by
    for (const [label, value] of [
      ["Site", site.name],
      ["Date", numericDate(test.testedAt)],
      ["Panel", test.location ?? ""],
      ["Tested by", test.testedBy ?? ""],
    ]) {
      const l = merge(r, FIRST, FIRST + 1);
      l.value = label;
      l.font = font({ bold: true, color: { argb: NAVY } });
      const v = merge(r, FIRST + 2, LAST);
      v.value = value.trim() || "–";
      v.font = font();
      r++;
    }
    r++;

    // the Result: a row per mode, then the whole test
    section("Result");
    for (const t of reportResults(test)) {
      const n = merge(r, FIRST, FIRST + 1);
      n.value = t.name;
      n.font = font({ size: 9, color: { argb: SOFT } });
      n.alignment = { vertical: "middle" };
      const v = merge(r, FIRST + 2, FIRST + 3);
      v.value = t.value;
      v.font = font({ bold: true, color: { argb: t.tone === "fail" ? FAIL_INK : t.tone === "pass" ? PASS_INK : "FF9AABB9" } });
      v.alignment = { vertical: "middle" };
      if (t.tone) v.fill = fill(t.tone === "fail" ? FAIL_FILL : PASS_FILL);
      const line = merge(r, FIRST + 4, LAST);
      line.value = t.line;
      line.font = font({ size: 9, color: { argb: SOFT } });
      line.alignment = { vertical: "middle", wrapText: true };
      r++;
    }
    r++;

    for (const mode of modesTested(test)) {
      section(mode === "normal" ? "Normal mode" : "Fire mode");
      // FAN NAME down two rows; INDICATION and MANUAL CONTROL over their checks
      ws.mergeCells(r, FIRST, r + 1, FIRST + 1);
      head(ws.getCell(r, FIRST), "FAN NAME", NAVY);
      ws.getCell(r, FIRST).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      const c0 = FIRST + 2;
      const cut = c0 + INDICATION.length; // the first manual control column
      head(merge(r, c0, cut - 1), "INDICATION", GROUP);
      head(merge(r, cut, LAST), "MANUAL CONTROL", GROUP);
      ws.getCell(r, cut).border = { ...box, left: split };
      HEADS.forEach((h, i) => {
        head(ws.getCell(r + 1, c0 + i), h, NAVY);
        if (c0 + i === cut) ws.getCell(r + 1, c0 + i).border = { ...box, left: split };
      });
      r += 2;
      test.fans.forEach((fan, k) => {
        const stripe = k % 2 ? fill("FFF6F9FB") : undefined;
        const name = merge(r, FIRST, FIRST + 1);
        name.value = fan.name;
        name.font = font({ bold: true, size: 9 });
        name.alignment = { vertical: "middle", indent: 1 };
        name.border = box;
        if (stripe) name.fill = stripe;
        FAN_CHECKS.forEach(([key], i) => {
          const m = fan.marks[`${mode}.${key}`];
          const c = ws.getCell(r, c0 + i);
          c.value = m === "y" ? "✓" : m === "n" ? "✗" : "–";
          c.font = font({ bold: !!m, size: m ? 11 : 9, color: { argb: m === "y" ? PASS_INK : m === "n" ? FAIL_INK : "FFA9B8C5" } });
          c.alignment = { horizontal: "center", vertical: "middle" };
          c.border = c0 + i === cut ? { ...box, left: split } : box;
          if (m === "n") c.fill = fill(FAIL_FILL);
          else if (stripe) c.fill = stripe;
        });
        r++;
      });
      r++;
    }

    // the notes: each fail's reason (a fail with none is left out), then each fan's note
    const rows = reportNoteRows(test);
    if (rows.length) {
      section("Notes");
      head(ws.getCell(r, FIRST), "#", NAVY);
      head(ws.getCell(r, FIRST + 1), "FAN", NAVY);
      head(merge(r, FIRST + 2, FIRST + 3), "CHECK", NAVY);
      head(merge(r, FIRST + 4, LAST), "NOTE", NAVY);
      for (const c of [FIRST + 1, FIRST + 2, FIRST + 4]) ws.getCell(r, c).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      r++;
      rows.forEach((n, i) => {
        const cells = [
          { c: ws.getCell(r, FIRST), v: i + 1, f: font({ size: 9, color: { argb: SOFT } }) },
          { c: ws.getCell(r, FIRST + 1), v: n.fan, f: font({ size: 9, bold: true }) },
          { c: merge(r, FIRST + 2, FIRST + 3), v: n.check, f: font({ size: 9, bold: true, color: { argb: n.fail ? FAIL_INK : SOFT } }) },
          { c: merge(r, FIRST + 4, LAST), v: n.text, f: font({ size: 9 }) },
        ];
        for (const [j, x] of cells.entries()) {
          x.c.value = x.v;
          x.c.font = x.f;
          x.c.border = box;
          x.c.alignment = { vertical: "top", wrapText: true, horizontal: j === 0 ? "center" : "left", indent: j ? 1 : 0 };
          if (i % 2) x.c.fill = fill("FFF6F9FB");
        }
        // merged cells don't grow: a line per ~34 characters of the note, ~30 of the check, ~22 of the fan
        const lines = Math.max(1, Math.ceil(n.text.length / 34), Math.ceil(n.check.length / 30), Math.ceil(n.fan.length / 22));
        ws.getRow(r).height = Math.max(15, lines * 12 + 3);
        r++;
      });
      r++;
    }
    // the next test below, after a gap
    r += 2;
  }
  ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, printArea: `A1:I${r}`, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  ws.views = [{ showGridLines: false }];
}
