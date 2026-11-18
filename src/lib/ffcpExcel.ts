import type { Workbook } from "exceljs";
import type { FfcpTest, Site } from "../db/types";
import { FAN_CHECKS, HEADS, modesTested, reportNotes, reportSummary } from "./ffcp";
import { sheetName } from "./excelSheetName";
import { shortDate } from "./dates";

// FFCP tests in Excel: one sheet holding them all, each laid out like its
// PDF page (lib/ffcpPdf): title, details, a table per mode tested (fan
// name, indication | manual control, ✓ ✗ –, fails in red), notes, summary.

const FONT = "Arial";
const INK = "FF14212E";
const SOFT = "FF4A6175";
const NAVY = "FF0B3550";
const GROUP = "FF16486B";
const LINE = "FFD5DEE6";
const FAIL_FILL = "FFFFD9D4";
const FAIL_INK = "FFB3261E";
const PASS_INK = "FF127A3E";

export function addFfcpSheet(wb: Workbook, tests: FfcpTest[], site: Pick<Site, "name" | "address">) {
  if (!tests.length) return;
  const ws = wb.addWorksheet(sheetName(wb, "FFCP", "FFCP"), {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  ws.columns = [{ width: 22 }, ...FAN_CHECKS.map(() => ({ width: 11 }))];
  const thin = { style: "thin" as const, color: { argb: LINE } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const split = { style: "medium" as const, color: { argb: "FF9FB3C3" } };
  let r = 1;
  const put = (text: string, opts: { bold?: boolean; size?: number; color?: string; underline?: boolean } = {}) => {
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { name: FONT, bold: opts.bold, size: opts.size ?? 10, underline: opts.underline, color: { argb: opts.color ?? INK } };
    r++;
  };
  const head = (c: import("exceljs").Cell, text: string, fill: string) => {
    c.value = text;
    c.font = { name: FONT, bold: true, size: 8.5, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = box;
  };

  for (const test of tests) {
    put("Fire fan control panel", { bold: true, size: 15 });
    put("Test results", { bold: true, size: 11 });
    r++;
    for (const [label, value] of [
      ["Site", [site.name, site.address].filter(Boolean).join(", ")],
      ["Date", shortDate(test.testedAt)],
      ["Panel", test.location],
      ["Tested by", test.testedBy ?? ""],
    ]) {
      ws.getCell(r, 1).value = label;
      ws.getCell(r, 1).font = { name: FONT, bold: true, size: 9, color: { argb: NAVY } };
      ws.getCell(r, 2).value = value || "–";
      ws.getCell(r, 2).font = { name: FONT, size: 9, color: { argb: INK } };
      r++;
    }
    r++;
    for (const mode of modesTested(test)) {
      put(mode === "normal" ? "Normal mode" : "Fire mode", { bold: true, size: 10, color: NAVY });
      // FAN NAME down two rows; INDICATION and MANUAL CONTROL over their checks
      ws.mergeCells(r, 1, r + 1, 1);
      head(ws.getCell(r, 1), "FAN NAME", NAVY);
      ws.getCell(r, 1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      ws.mergeCells(r, 2, r, 4);
      head(ws.getCell(r, 2), "INDICATION", GROUP);
      ws.mergeCells(r, 5, r, 6);
      head(ws.getCell(r, 5), "MANUAL CONTROL", GROUP);
      ws.getCell(r, 5).border = { ...box, left: split };
      HEADS.forEach((h, i) => {
        head(ws.getCell(r + 1, i + 2), h, NAVY);
        if (i === 3) ws.getCell(r + 1, i + 2).border = { ...box, left: split };
      });
      r += 2;
      for (const fan of test.fans) {
        const name = ws.getCell(r, 1);
        name.value = fan.name;
        name.font = { name: FONT, bold: true, size: 9, color: { argb: INK } };
        name.border = box;
        FAN_CHECKS.forEach(([k], i) => {
          const m = fan.marks[`${mode}.${k}`];
          const c = ws.getCell(r, i + 2);
          c.value = m === "y" ? "✓" : m === "n" ? "✗" : "–";
          c.font = { name: FONT, bold: !!m, size: m ? 11 : 9, color: { argb: m === "y" ? PASS_INK : m === "n" ? FAIL_INK : "FFA9B8C5" } };
          c.alignment = { horizontal: "center", vertical: "middle" };
          c.border = i === 3 ? { ...box, left: split } : box;
          if (m === "n") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_FILL } };
        });
        r++;
      }
      r++;
    }
    const notes = reportNotes(test);
    if (notes.length) {
      put("Notes", { bold: true, size: 10, color: NAVY, underline: true });
      for (const n of notes) {
        ws.getCell(r, 1).value = n.head;
        ws.getCell(r, 1).font = { name: FONT, bold: true, size: 9, color: { argb: n.fail ? FAIL_INK : INK } };
        ws.mergeCells(r, 3, r, 6);
        ws.getCell(r, 3).value = n.text;
        ws.getCell(r, 3).font = { name: FONT, size: 9, color: { argb: INK } };
        r++;
      }
      r++;
    }
    const sum = reportSummary(test);
    put(sum.text, { bold: true, size: 9, color: sum.fails ? FAIL_INK : SOFT });
    // the next test below, after a gap
    r += 2;
  }
}
