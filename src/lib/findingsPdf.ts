import type { jsPDF } from "jspdf";
import type { Finding, Photo } from "../db/types";
import { getStamped } from "../db/db";
import { defectTypeStyle } from "./defectTypes";
import { reportRows, type ReportRow } from "./esrGrouping";
import { EXPORT_MAX_EDGE, STAMP_VERSION, watermarkBlob } from "./watermark";

// The findings as the report's PDF draws them (moved from pages/Export so
// the stair and flow reports draw their photos and defects the same way):
// a photo column on the left half, the defect type, note, level and
// location on the right, under their ESR headings when they have any.

export interface FindingEntry {
  finding: Finding;
  photos: Photo[];
}

// Draws the findings from `startY` (the top margin by default) on the
// current page, onto new pages as needed; returns where the last one ends.
export async function drawFindings(doc: jsPDF, items: FindingEntry[], onPhoto: (done: number, total: number) => void = () => {}, startY?: number): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const blockGap = 28;

  // Half-page split: a fixed-width photo column on the left running from
  // the margin to the page's own centerline, and a text column that
  // always starts a fixed gap past that centerline — so the text edge
  // lines up down the page the same way for every finding, whether it
  // has one photo or three.
  const midX = pageW / 2;
  const photoColW = midX - margin;
  const textGap = 16;
  const textX = midX + textGap;
  const textColW = pageW - margin - textX;

  // Every photo tile is the same fixed box — cropped to fit, not
  // stretched — so a landscape and a portrait photo sit at identical
  // size next to each other. Up to 2 across; a 3rd (rare — most findings
  // only ever get 2 photos) drops in beneath the first rather than
  // widening the row.
  const tileGap = 8;
  const tileW = (photoColW - tileGap) / 2;
  const tileH = tileW * (161 / 121); // matches the approved mockup's proportions
  const tileAspect = tileH / tileW;

  let y = startY ?? margin;

  const totalPhotos = items.reduce((n, i) => n + i.photos.length, 0);
  let donePhotos = 0;
  onPhoto(0, totalPhotos);

  // findings under their ESR section / item headings (none if nothing is
  // categorised). A heading is drawn with the finding after it, so it's
  // never left alone at the bottom of a page. Findings without a photo
  // are included, with a "No photo" box in the photo column.
  let headings: Heading[] = [];
  for (const row of reportRows(items)) {
    if (row.kind !== "finding") {
      headings.push(row);
      continue;
    }
    const item = row.entry;

    // cropped to the tile shape from the original photo, THEN stamped, so
    // the timestamp is never trimmed off by the crop
    // one photo at a time, so only one full-size photo is ever decoded
    // (made once and kept, see db/getStamped; handed to jsPDF as bytes,
    // which takes far less memory than a data URL)
    const tiles: Uint8Array[] = [];
    for (const p of item.photos) {
      const key = `${STAMP_VERSION}:${EXPORT_MAX_EDGE}:${tileAspect.toFixed(4)}:${p.takenAt}`;
      const tile = await getStamped(p, "pdf", key, async (source) => {
        const { jpeg, width, height } = await watermarkBlob(source, p.takenAt, { cropAspect: tileAspect, maxEdge: EXPORT_MAX_EDGE });
        return { blob: jpeg, width, height };
      });
      tiles.push(new Uint8Array(await tile.blob.arrayBuffer()));
      onPhoto(++donePhotos, totalPhotos);
    }
    const rows = Math.ceil(tiles.length / 2);
    const photosBlockH = rows ? rows * tileH + (rows - 1) * tileGap : NO_PHOTO_H;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const titleLines = doc.splitTextToSize(item.finding.note || "Untitled finding", textColW);
    const defect = defectTypeStyle(item.finding.defectType);
    // level (as a subheading) and location, each on its own grey line
    const placeLines = [item.finding.level, item.finding.location].filter((t): t is string => !!t);
    // the inspector's rectification notes under them, only when written
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const rectification = item.finding.rectification?.trim();
    const rectLines: string[] = rectification ? doc.splitTextToSize(rectification, textColW) : [];
    const textBlockH =
      titleLines.length * 15 +
      (placeLines.length ? 18 + (placeLines.length - 1) * 13 : 0) +
      (rectLines.length ? 8 + 13 + rectLines.length * 13 : 0) +
      (defect ? PILL_H + 10 : 0);

    const blockH = Math.max(photosBlockH, textBlockH);
    const headingsH = headings.reduce((h, r) => h + pdfHeadingHeight(doc, r, pageW - margin * 2), 0);

    // a new page if it doesn't fit; one with more photos than a page
    // holds starts here if its text and first row of photos fit, and its
    // photos carry on over the next pages
    const bottom = pageH - margin;
    const firstH = Math.max(textBlockH, tiles.length ? tileH : NO_PHOTO_H);
    if (y + headingsH + blockH > bottom && (headingsH + blockH <= bottom - margin || y + headingsH + firstH > bottom)) {
      doc.addPage();
      y = margin;
    }
    for (const h of headings) y = drawPdfHeading(doc, h, margin, y, pageW - margin * 2);
    headings = [];

    const rowTop = y;

    if (!tiles.length) {
      doc.setDrawColor(201, 196, 184);
      doc.setLineWidth(0.75);
      doc.setLineDashPattern([3, 3], 0);
      doc.roundedRect(margin, rowTop, tileW, NO_PHOTO_H, 4, 4, "S");
      doc.setLineDashPattern([], 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text("No photo", margin + tileW / 2, rowTop + NO_PHOTO_H / 2, { align: "center", baseline: "middle" });
    }

    // defect type bubble — above the title, when the finding has one
    let ty = rowTop + 14;
    if (defect) {
      const pillTop = rowTop + 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const pillW = doc.getTextWidth(defect.label) + PILL_PAD_X * 2;
      doc.setFillColor(...defect.bgRgb);
      if (defect.value === "note-only") {
        // white bubble on a white page needs an outline to show up
        doc.setDrawColor(201, 196, 184);
        doc.setLineWidth(0.75);
        doc.roundedRect(textX, pillTop, pillW, PILL_H, PILL_H / 2, PILL_H / 2, "FD");
      } else {
        doc.roundedRect(textX, pillTop, pillW, PILL_H, PILL_H / 2, PILL_H / 2, "F");
      }
      doc.setTextColor(...defect.textRgb);
      doc.text(defect.label, textX + PILL_PAD_X, pillTop + PILL_H / 2, { baseline: "middle" });
      ty += PILL_H + 10;
    }

    // title + level + location, once per finding regardless of photo count,
    // always anchored to the shared centerline column
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(28, 30, 36);
    doc.text(titleLines, textX, ty);
    ty += titleLines.length * 15 + 8;

    if (placeLines.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(140, 140, 140);
      placeLines.forEach((line, i) => doc.text(line, textX, ty + i * 13));
    }

    if (rectLines.length) {
      const ry = ty + (placeLines.length ? placeLines.length * 13 + 8 : 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(28, 30, 36);
      doc.text("Rectification:", textX, ry);
      doc.setFont("helvetica", "normal");
      doc.text(rectLines, textX, ry + 13);
    }

    // the photos, two across; a row that won't fit goes on the next page,
    // under the finding's title marked (continued)
    const startPage = doc.getNumberOfPages();
    let rowY = rowTop;
    let photosEnd = tiles.length ? rowTop : rowTop + NO_PHOTO_H;
    for (let i = 0; i < tiles.length; i += 2) {
      if (i > 0) rowY += tileH + tileGap;
      if (rowY + tileH > bottom) {
        doc.addPage();
        rowY = margin;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(28, 30, 36);
        const cont = doc.splitTextToSize(`${item.finding.note || "Untitled finding"} (continued)`, textColW);
        doc.text(cont, textX, rowY + 14);
      }
      for (let k = i; k < Math.min(i + 2, tiles.length); k++) doc.addImage(tiles[k], "JPEG", margin + (k - i) * (tileW + tileGap), rowY, tileW, tileH);
      photosEnd = rowY + tileH;
    }
    // past the text too, if the photos stayed on the finding's first page
    y = (doc.getNumberOfPages() === startPage ? Math.max(photosEnd, rowTop + textBlockH) : photosEnd) + blockGap;
  }

  return y;
}

// ---- ESR headings (see lib/esrGrouping) ----

export type Heading = Exclude<ReportRow<unknown>, { kind: "finding" }>;

export function headingText(row: Heading): string {
  if (row.kind === "uncategorised") return "Uncategorised";
  return row.kind === "section" ? `${row.code} · ${row.name}` : `${row.code}  ${row.name}`;
}

// PDF: section (blue), group (yellow, 6.3) and Uncategorised (grey) as a
// filled bar, item as bold text with a blue rule under it.
export const BAR_FILL = { section: "#99ccff", group: "#ffffcc", uncategorised: "#d9d9d9" } as const;
const BAR_RGB: Record<keyof typeof BAR_FILL, [number, number, number]> = { section: [153, 204, 255], group: [255, 255, 204], uncategorised: [217, 217, 217] };
const BAR_PAD = 5.5;
const ITEM_LINE_H = 13;

function itemLines(doc: jsPDF, row: Heading, width: number): string[] {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  return doc.splitTextToSize(headingText(row), width);
}

// long names (6.3's) wrap inside the bar
function barLines(doc: jsPDF, row: Heading, width: number): string[] {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  return doc.splitTextToSize(headingText(row), width - 18);
}

function pdfHeadingHeight(doc: jsPDF, row: Heading, width: number): number {
  return row.kind === "item" ? itemLines(doc, row, width).length * ITEM_LINE_H + 16 : barLines(doc, row, width).length * ITEM_LINE_H + BAR_PAD * 2 + 12;
}

// draws the heading at `y` and returns where the next thing starts
function drawPdfHeading(doc: jsPDF, row: Heading, x: number, y: number, width: number): number {
  if (row.kind === "item") {
    const lines = itemLines(doc, row, width);
    doc.setTextColor(28, 30, 36);
    doc.text(lines, x, y + 9);
    const ruleY = y + lines.length * ITEM_LINE_H + 1;
    doc.setDrawColor(153, 204, 255);
    doc.setLineWidth(1.5);
    doc.line(x, ruleY, x + width, ruleY);
    return y + pdfHeadingHeight(doc, row, width);
  }
  const lines = barLines(doc, row, width);
  doc.setFillColor(...BAR_RGB[row.kind]);
  doc.rect(x, y, width, lines.length * ITEM_LINE_H + BAR_PAD * 2, "F");
  doc.setTextColor(4, 33, 58);
  doc.text(lines, x + 9, y + BAR_PAD + 9.5);
  return y + pdfHeadingHeight(doc, row, width);
}

// PDF: the box standing in for photos on a finding that has none (pt)
const NO_PHOTO_H = 56;

// PDF defect type bubble size (pt)
const PILL_H = 14;
const PILL_PAD_X = 7;
