import type { Finding, Photo, Site } from "../db/types";
import { defectTypeStyle } from "./defectTypes";
// Company template (header row A1:G1 with its fills, fonts and column
// widths). Inlined as a data URL so the export works offline — the PWA
// service worker doesn't precache .xlsx files.
import templateDataUrl from "../assets/findings-template.xlsx?inline";

// Excel findings register, built on the template: one row per finding,
// A Ref · B Location · C Description (+ photos) · D Date identified ·
// E Risk level · F Status · G Corrective action.
//
// Photos go in at their original camera quality (no downscaling or
// re-encoding — these files go to OneDrive, not email), drawn exactly 5 cm
// wide underneath the note in the Description cell. Built for desktop
// Excel.

export interface ExcelFinding {
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
const THIN = { style: "thin" as const, color: { argb: "FF000000" } };

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

// Natural pixel size of a photo, so it can be scaled to 5 cm wide without
// distorting it.
async function photoSize(blob: Blob): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  const size = { w: bmp.width, h: bmp.height };
  bmp.close();
  return size;
}

// Excel only takes JPEG/PNG/GIF. Camera photos are JPEG and go in
// untouched; anything else (e.g. a HEIC picked on the web) is converted to
// a full-resolution, near-lossless JPEG.
async function photoBytes(blob: Blob): Promise<{ bytes: Uint8Array; extension: "jpeg" | "png" | "gif" }> {
  const type = blob.type.toLowerCase();
  const ext = type === "image/jpeg" || type === "image/jpg" ? "jpeg" : type === "image/png" ? "png" : type === "image/gif" ? "gif" : null;
  if (ext) return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: ext };
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo conversion failed"))), "image/jpeg", 0.95),
  );
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), extension: "jpeg" };
}

// Site inspection date as an Excel date. Built from the local calendar
// date in UTC, since Excel dates have no time zone — otherwise an
// Australian morning would land on the previous day.
function inspectionDate(site: Site): Date {
  const d = new Date(site.createdAt);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export async function buildFindingsWorkbook(site: Site, items: ExcelFinding[]): Promise<Blob> {
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

  const date = inspectionDate(site);
  let rowNum = 2; // row 1 is the template's header

  for (const { finding, photos } of items) {
    const locationText = [finding.level, finding.location].filter(Boolean).join("\n");
    const noteH = estimateTextPx(finding.note, descPx);
    const locH = estimateTextPx(locationText, locPx);

    const prepared: PreparedPhoto[] = [];
    for (const p of photos) {
      const [{ w, h }, { bytes, extension }] = await Promise.all([photoSize(p.blob), photoBytes(p.blob)]);
      // ExcelJS writes `buffer` straight into the zip; its type says Buffer
      // (Node) but a Uint8Array is what the browser build accepts.
      const imageId = wb.addImage({ buffer: bytes as unknown as ArrayBuffer, extension });
      prepared.push({ imageId, heightPx: (PHOTO_W * h) / w });
    }

    // Lay the photos out two per line under the note. If they'd push the
    // row past Excel's max row height, carry on in an extra row below
    // (the other columns are merged across those rows).
    const rowHeights: number[] = [];
    const placements: { imageId: number; rowIdx: number; x: number; y: number; h: number }[] = [];
    let rowIdx = 0;
    let y = PAD + (noteH ? noteH + GAP : 0);
    let rowFloor = Math.max(y, PAD + locH + PAD, MIN_ROW_PX);
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

    row.getCell(COL.ref).alignment = centred;

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
    status.value = "Open";
    status.alignment = centred;

    row.getCell(COL.action).alignment = topLeft;

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

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
