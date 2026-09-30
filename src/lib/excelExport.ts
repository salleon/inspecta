import type { Finding, FlowTest, Photo, Site } from "../db/types";
import { defectTypeStyle } from "./defectTypes";
import { reportRows } from "./esrGrouping";
import { suggestedCorrectiveAction } from "./correctiveAction";
import { EXPORT_MAX_EDGE, STAMP_VERSION, watermarkBlob } from "./watermark";
import { getStamped } from "../db/db";
import { addFlowCharts, addFlowSheets } from "./flowExcel";

// the site's flow tests, which go in as tabs after the findings (lib/flowExcel)
export interface FlowExport {
  tests: FlowTest[];
  site: Pick<Site, "name" | "address">;
}

// A photo stamped for the Excel: made once from its export copy, then
// reused by every Excel export after (see db/getStamped).
function excelPhoto(p: Photo) {
  return getStamped(p, "excel", `${STAMP_VERSION}:${EXPORT_MAX_EDGE}:${p.takenAt}`, async (copy) => {
    const { jpeg, width, height } = await watermarkBlob(copy, p.takenAt, { maxEdge: EXPORT_MAX_EDGE });
    return { blob: jpeg, width, height };
  });
}
// Company template (header row A1:G1 with its fills, fonts and column
// widths). Inlined as a data URL so the export works offline — the PWA
// service worker doesn't precache .xlsx files.
import templateDataUrl from "../assets/findings-template.xlsx?inline";

// Excel findings register, built on the template: one row per finding,
// A Ref · B Location · C Description (+ photos) · D Date identified ·
// E Risk level · F Status · G Corrective action (pre-filled in red from the
// common defects table when the note is clearly one of them, under a
// "Confidence: High / Medium / Low" line, for the engineer to check; see
// lib/correctiveAction).
//
// With ESR categories, findings sit under a blue row per section, a yellow
// row for an item holding others (6.3), and a grey row per item (like the company's ESR spreadsheet), Uncategorised
// last, and Ref reads "1.6.1", "1.6.2"… (see lib/esrGrouping). Without any,
// it's one row per finding in list order with Ref blank.
//
// Photos go in with the same timestamp as the PDF, scaled to at most
// EXPORT_MAX_EDGE px (they're drawn exactly 5 cm wide underneath the note
// in the Description cell, so that's still far sharper than the cell
// needs). Built for desktop Excel.

interface ExcelFinding {
  finding: Finding;
  photos: Photo[];
}

// ---- layout (px at 96 dpi, which is what Excel's drawing units assume) ----
const EMU_PER_PX = 9525;
const PHOTO_W_EMU = 1_800_000; // 5 cm
const PHOTO_W = PHOTO_W_EMU / EMU_PER_PX; // ≈ 189 px
const PAD = 10; // breathing room around cell content
const GAP = 10; // between note text and photos, and between photos
const MAX_ROW_PX = 545; // Excel's row height limit (409 pt)
const LINE_PX = 17; // Arial 10 line height
const CHAR_PX = 6.5; // Arial 10 average char width (errs wide, so text never runs into photos)
const MIN_ROW_PX = 34;

// Excel column width (in "characters") <-> pixels, for the default
// Aptos Narrow 11 font (7 px max digit width).
const colPx = (width: number) => Math.floor(width * 7 + 5);
const colWidthFor = (px: number) => (px - 5) / 7;

const COL = { ref: 1, location: 2, description: 3, date: 4, risk: 5, status: 6, action: 7 } as const;

const FONT = { name: "Arial", size: 10 };
const SECTION_FILL = "FF99CCFF";
const ITEM_FILL = "FFD9D9D9";
const GROUP_FILL = "FFFFFFCC";
const UNCATEGORISED_FILL = "FFBFBFBF";
const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
// pre-filled corrective action: red until the engineer has checked it
const SUGGESTED_COLOUR = "FFFF0000";

function estimateTextPx(text: string, widthPx: number): number {
  if (!text.trim()) return 0;
  const perLine = Math.max(1, Math.floor((widthPx - 2 * PAD) / CHAR_PX));
  let lines = 0;
  for (const para of text.split("\n")) {
    let len = 0;
    let paraLines = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = word.length;
      if (len === 0) {
        paraLines += Math.floor(w / perLine);
        len = w % perLine;
      } else if (len + 1 + w <= perLine) {
        len += 1 + w;
      } else {
        paraLines += 1 + Math.floor(w / perLine);
        len = w % perLine;
      }
    }
    lines += paraLines;
  }
  return lines * LINE_PX;
}

interface PreparedPhoto {
  imageId: number;
  heightPx: number; // at 5 cm wide
}

// Inspection date as an Excel date. Built from the local calendar date in
// UTC, since Excel dates have no time zone — otherwise an Australian
// morning would land on the previous day.
function excelDate(ms: number): Date {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// `inspectionMs`: the site visit date, shown as "Date identified" on every
// row (see ExportPreview).
// Projects sites (see buildProjectWorkbook): a plain register, photo first.
const PCOL = { photo: 1, location: 2, notes: 3, date: 4, risk: 5 } as const;
const PROJECT_HEADINGS = ["Photo", "Location", "Notes", "Date", "Risk Level"];

// Progress for the loading screen. Stamping and adding photos is nearly
// all of the work, so it's reported photo by photo.
type ExcelProgress =
  | { stage: "photos"; done: number; total: number }
  | { stage: "building" };

export async function buildFindingsWorkbook(
  items: ExcelFinding[],
  inspectionMs: number,
  onProgress?: (progress: ExcelProgress) => void,
  flow?: FlowExport,
): Promise<Blob> {
  const totalPhotos = items.reduce((n, i) => n + i.photos.length, 0);
  let donePhotos = 0;
  onProgress?.({ stage: "photos", done: 0, total: totalPhotos });

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const template = await (await fetch(templateDataUrl)).arrayBuffer();
  await wb.xlsx.load(template);
  const ws = wb.worksheets[0];

  // Description column: wide enough for two 5 cm photos side by side when
  // any finding has more than one, plus padding either side.
  const multiPhoto = items.some((i) => i.photos.length > 1);
  const neededPx = PAD + PHOTO_W + (multiPhoto ? GAP + PHOTO_W : 0) + PAD + 4;
  const descCol = ws.getColumn(COL.description);
  const descPx = Math.max(colPx(descCol.width ?? 46), Math.ceil(neededPx));
  descCol.width = colWidthFor(descPx);
  const locPx = colPx(ws.getColumn(COL.location).width ?? 19);
  const actionPx = colPx(ws.getColumn(COL.action).width ?? 40);

  const date = excelDate(inspectionMs);
  let rowNum = 2; // row 1 is the template's header

  // B–G merged, for heading text
  let headingPx = 0;
  for (let c: number = COL.location; c <= COL.action; c++) headingPx += colPx(ws.getColumn(c).width ?? 10);

  for (const reportRow of reportRows(items)) {
    if (reportRow.kind !== "finding") {
      const text = reportRow.kind === "uncategorised" ? "Uncategorised" : reportRow.name;
      const fill = { section: SECTION_FILL, group: GROUP_FILL, item: ITEM_FILL, uncategorised: UNCATEGORISED_FILL }[reportRow.kind];
      const row = ws.getRow(rowNum);
      row.height = Math.min(409, Math.ceil(Math.max(20, estimateTextPx(text, headingPx) + 6) * 0.75));
      for (let c: number = COL.ref; c <= COL.action; c++) {
        const cell = row.getCell(c);
        cell.font = { ...FONT, bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.border = { left: THIN, right: THIN, top: THIN, bottom: THIN };
        cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      }
      row.getCell(COL.ref).value = reportRow.kind === "uncategorised" ? null : reportRow.code;
      row.getCell(COL.location).value = text;
      ws.mergeCells(rowNum, COL.location, rowNum, COL.action);
      rowNum++;
      continue;
    }
    const { entry: { finding, photos }, ref } = reportRow;
    const locationText = [finding.level, finding.location].filter(Boolean).join("\n");
    const noteH = estimateTextPx(finding.note, descPx);
    const locH = estimateTextPx(locationText, locPx);
    const rectified = finding.defectType === "rectified";
    // a rectified defect needs no corrective action
    const suggestion = rectified ? undefined : suggestedCorrectiveAction(finding);
    const confidenceLine = suggestion ? `Confidence: ${suggestion.confidence}` : "";
    const actionH = suggestion ? estimateTextPx(`${confidenceLine}\n\n${suggestion.defect.wording}`, actionPx) : 0;

    const prepared: PreparedPhoto[] = [];
    for (const p of photos) {
      // Re-drawn to stamp the timestamp on, which also turns sideways
      // camera photos upright (Excel ignores the JPEG rotation flag). Capped
      // at EXPORT_MAX_EDGE: shown 5 cm wide, so full camera resolution only
      // costs memory and file size.
      const { blob: jpeg, width, height } = await excelPhoto(p);
      const bytes = new Uint8Array(await jpeg.arrayBuffer());
      // ExcelJS writes `buffer` straight into the zip; its type says Buffer
      // (Node) but a Uint8Array is what the browser build accepts.
      const imageId = wb.addImage({ buffer: bytes as unknown as ArrayBuffer, extension: "jpeg" });
      prepared.push({ imageId, heightPx: (PHOTO_W * height) / width });
      onProgress?.({ stage: "photos", done: ++donePhotos, total: totalPhotos });
    }

    // Lay the photos out two per line under the note. If they'd push the
    // row past Excel's max row height, carry on in an extra row below
    // (the other columns are merged across those rows).
    const rowHeights: number[] = [];
    const placements: { imageId: number; rowIdx: number; x: number; y: number; h: number }[] = [];
    let rowIdx = 0;
    let y = PAD + (noteH ? noteH + GAP : 0);
    // Rectified / Outstanding add a second line under the Ref
    const refLines = defectTypeStyle(finding.defectType)?.previousInspection ? 2 : 1;
    let rowFloor = Math.max(y, PAD + locH + PAD, PAD + actionH + PAD, PAD + refLines * LINE_PX + PAD, MIN_ROW_PX);
    for (let i = 0; i < prepared.length; i += 2) {
      const pair = prepared.slice(i, i + 2);
      const pairH = Math.max(...pair.map((p) => p.heightPx));
      if (y + pairH + PAD > MAX_ROW_PX && y > PAD) {
        rowHeights.push(Math.max(rowFloor, y - GAP + PAD));
        rowIdx++;
        y = PAD;
        rowFloor = MIN_ROW_PX;
      }
      pair.forEach((p, j) => placements.push({ imageId: p.imageId, rowIdx, x: PAD + j * (PHOTO_W + GAP), y, h: p.heightPx }));
      y += pairH + GAP;
    }
    rowHeights.push(Math.max(rowFloor, prepared.length ? y - GAP + PAD : y + PAD));

    const first = rowNum;
    const last = rowNum + rowHeights.length - 1;

    rowHeights.forEach((px, i) => {
      const row = ws.getRow(first + i);
      row.height = Math.min(409, Math.ceil(px * 0.75));
      for (let c: number = COL.ref; c <= COL.action; c++) {
        const cell = row.getCell(c);
        cell.font = FONT;
        // Description spans several rows without inner lines, so it reads
        // as one box.
        const inner = c === COL.description;
        cell.border = {
          left: THIN,
          right: THIN,
          top: inner && i > 0 ? undefined : THIN,
          bottom: inner && i < rowHeights.length - 1 ? undefined : THIN,
        };
      }
    });

    const topLeft = { horizontal: "left", vertical: "top", wrapText: true } as const;
    const centred = { horizontal: "center", vertical: "middle", wrapText: true } as const;
    const row = ws.getRow(first);

    const refCell = row.getCell(COL.ref);
    // a defect from a previous inspection says so under its Ref
    const previous = defectTypeStyle(finding.defectType);
    refCell.value =
      previous?.previousInspection && previous.refText
        ? { richText: [{ text: ref ? `${ref}\n` : "", font: FONT }, { text: previous.label, font: { ...FONT, bold: true, color: { argb: previous.refText } } }] }
        : (ref ?? null);
    refCell.alignment = topLeft;

    const loc = row.getCell(COL.location);
    loc.value = locationText || null;
    loc.alignment = topLeft;

    const desc = row.getCell(COL.description);
    desc.value = finding.note || null;
    desc.alignment = topLeft;

    const dateCell = row.getCell(COL.date);
    dateCell.value = date;
    dateCell.numFmt = "dd/mm/yy";
    dateCell.alignment = centred;

    const risk = row.getCell(COL.risk);
    const defect = defectTypeStyle(finding.defectType);
    if (defect) {
      risk.value = defect.label;
      risk.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${defect.bg.slice(1).toUpperCase()}` } };
      risk.font = { ...FONT, bold: true, color: { argb: `FF${defect.text.slice(1).toUpperCase()}` } };
    }
    risk.alignment = centred;

    const status = row.getCell(COL.status);
    // rectified: closed on the day it was found fixed
    status.value = rectified ? date : "Open";
    if (rectified) status.numFmt = "dd/mm/yy";
    status.alignment = centred;

    const actionCell = row.getCell(COL.action);
    actionCell.alignment = topLeft;
    if (suggestion) {
      // "Confidence: High" in bold over the wording, all red until checked
      actionCell.value = {
        richText: [
          { text: `${confidenceLine}\n\n`, font: { ...FONT, bold: true, color: { argb: SUGGESTED_COLOUR } } },
          { text: suggestion.defect.wording, font: { ...FONT, color: { argb: SUGGESTED_COLOUR } } },
        ],
      };
      actionCell.font = { ...FONT, color: { argb: SUGGESTED_COLOUR } };
    }

    if (last > first) {
      for (const c of [COL.ref, COL.location, COL.date, COL.risk, COL.status, COL.action]) {
        ws.mergeCells(first, c, last, c);
      }
    }

    for (const p of placements) {
      ws.addImage(p.imageId, {
        // native anchors are exact EMU offsets from the cell's top-left
        tl: {
          nativeCol: COL.description - 1,
          nativeColOff: Math.round(p.x * EMU_PER_PX),
          nativeRow: first - 1 + p.rowIdx,
          nativeRowOff: Math.round(p.y * EMU_PER_PX),
        } as never,
        ext: { width: PHOTO_W_EMU / EMU_PER_PX + 1e-6, height: p.h },
        editAs: "oneCell",
      });
    }

    rowNum = last + 1;
  }

  // keep the header visible while scrolling through tall photo rows
  ws.views = [{ state: "frozen", ySplit: 1, topLeftCell: "A2", activeCell: "A2" }];

  onProgress?.({ stage: "building" });
  return writeWorkbook(wb, flow);
}

// Stored, not deflated: the photos are already JPEG-compressed, so
// deflating the zip only burns time (it runs on the main thread and
// freezes the loading screen) for a negligible saving on the XML.
async function writeWorkbook(wb: import("exceljs").Workbook, flow?: FlowExport): Promise<Blob> {
  const charts = flow?.tests.length ? await addFlowSheets(wb, flow.tests, flow.site) : [];
  const buffer = await wb.xlsx.writeBuffer({ zip: { compression: "STORE" } } as never);
  const bytes = await addFlowCharts(new Uint8Array(buffer as ArrayBuffer), charts);
  return new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const two = (n: number) => String(n).padStart(2, "0");
// "29/09/26" over "09:02", in the phone's local time
function dateAndTime(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${two(d.getFullYear() % 100)}\n${two(d.getHours())}:${two(d.getMinutes())}`;
}

// The Excel register for a Projects site: Photo · Location · Notes · Date ·
// Risk level, one row per finding with no ESR sections, in the order given
// (the export screen sorts Projects findings by when their photos were
// taken — see lib/projectReport). A finding's photos are stacked in its
// Photo cell, carrying on into extra rows past Excel's row height limit;
// Date is its first photo's (or, with none, when it was written).
export async function buildProjectWorkbook(
  items: ExcelFinding[],
  onProgress?: (progress: ExcelProgress) => void,
  flow?: FlowExport,
): Promise<Blob> {
  const totalPhotos = items.reduce((n, i) => n + i.photos.length, 0);
  let donePhotos = 0;
  onProgress?.({ stage: "photos", done: 0, total: totalPhotos });

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const template = await (await fetch(templateDataUrl)).arrayBuffer();
  await wb.xlsx.load(template);
  const ws = wb.worksheets[0];

  // the template's header styling, on five headings instead of seven
  const header = ws.getRow(1);
  const headStyle = JSON.parse(JSON.stringify(header.getCell(1).style));
  for (let c = 1; c <= 7; c++) {
    const cell = header.getCell(c);
    if (c <= PROJECT_HEADINGS.length) {
      cell.style = JSON.parse(JSON.stringify(headStyle));
      cell.value = PROJECT_HEADINGS[c - 1];
    } else {
      cell.value = null;
      cell.style = {};
    }
  }
  const photoPx = PAD + PHOTO_W + PAD + 4;
  ws.getColumn(PCOL.photo).width = colWidthFor(photoPx);
  ws.getColumn(PCOL.location).width = 22;
  ws.getColumn(PCOL.notes).width = 46;
  ws.getColumn(PCOL.date).width = 12;
  ws.getColumn(PCOL.risk).width = 18;
  for (const c of [6, 7]) ws.getColumn(c).width = 9;
  const locPx = colPx(22);
  const notesPx = colPx(46);

  let rowNum = 2;
  for (const { finding, photos } of items) {
    const locationText = [finding.level, finding.location].filter(Boolean).join("\n");
    const textFloor = Math.max(PAD + estimateTextPx(locationText, locPx) + PAD, PAD + estimateTextPx(finding.note, notesPx) + PAD, MIN_ROW_PX, 2 * LINE_PX + 2 * PAD);

    // photos one under another in the Photo column
    const rowHeights: number[] = [];
    const placements: { imageId: number; rowIdx: number; y: number; h: number }[] = [];
    let rowIdx = 0;
    let y = PAD;
    for (const p of photos) {
      const { blob: jpeg, width, height } = await excelPhoto(p);
      const bytes = new Uint8Array(await jpeg.arrayBuffer());
      const imageId = wb.addImage({ buffer: bytes as unknown as ArrayBuffer, extension: "jpeg" });
      const h = (PHOTO_W * height) / width;
      if (y + h + PAD > MAX_ROW_PX && y > PAD) {
        rowHeights.push(y - GAP + PAD);
        rowIdx++;
        y = PAD;
      }
      placements.push({ imageId, rowIdx, y, h });
      y += h + GAP;
      onProgress?.({ stage: "photos", done: ++donePhotos, total: totalPhotos });
    }
    rowHeights.push(photos.length ? y - GAP + PAD : 0);
    for (let i = 0; i < rowHeights.length; i++) rowHeights[i] = Math.max(rowHeights[i], i === 0 ? textFloor : MIN_ROW_PX);

    const first = rowNum;
    const last = rowNum + rowHeights.length - 1;
    rowHeights.forEach((px, i) => {
      const row = ws.getRow(first + i);
      row.height = Math.min(409, Math.ceil(px * 0.75));
      for (let c = 1; c <= PROJECT_HEADINGS.length; c++) {
        const cell = row.getCell(c);
        cell.font = FONT;
        const inner = c === PCOL.photo; // one box across its rows
        cell.border = {
          left: THIN,
          right: THIN,
          top: inner && i > 0 ? undefined : THIN,
          bottom: inner && i < rowHeights.length - 1 ? undefined : THIN,
        };
      }
    });

    const topLeft = { horizontal: "left", vertical: "top", wrapText: true } as const;
    const centred = { horizontal: "center", vertical: "middle", wrapText: true } as const;
    const row = ws.getRow(first);
    const loc = row.getCell(PCOL.location);
    loc.value = locationText || null;
    loc.alignment = topLeft;
    const notes = row.getCell(PCOL.notes);
    notes.value = finding.note || null;
    notes.alignment = topLeft;
    const date = row.getCell(PCOL.date);
    date.value = dateAndTime(photos.length ? Math.min(...photos.map((p) => p.takenAt)) : finding.createdAt);
    date.alignment = centred;
    const risk = row.getCell(PCOL.risk);
    const defect = defectTypeStyle(finding.defectType);
    if (defect) {
      risk.value = defect.label;
      risk.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${defect.bg.slice(1).toUpperCase()}` } };
      risk.font = { ...FONT, bold: true, color: { argb: `FF${defect.text.slice(1).toUpperCase()}` } };
    }
    risk.alignment = centred;
    row.getCell(PCOL.photo).alignment = topLeft;

    if (last > first) for (const c of [PCOL.location, PCOL.notes, PCOL.date, PCOL.risk]) ws.mergeCells(first, c, last, c);

    for (const p of placements) {
      ws.addImage(p.imageId, {
        tl: {
          nativeCol: PCOL.photo - 1,
          nativeColOff: Math.round(PAD * EMU_PER_PX),
          nativeRow: first - 1 + p.rowIdx,
          nativeRowOff: Math.round(p.y * EMU_PER_PX),
        } as never,
        ext: { width: PHOTO_W_EMU / EMU_PER_PX + 1e-6, height: p.h },
        editAs: "oneCell",
      });
    }
    rowNum = last + 1;
  }

  ws.views = [{ state: "frozen", ySplit: 1, topLeftCell: "A2", activeCell: "A2" }];
  onProgress?.({ stage: "building" });
  return writeWorkbook(wb, flow);
}
