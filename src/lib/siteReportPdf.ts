import type { jsPDF } from "jspdf";
import type { Finding, Photo } from "../db/types";
import { getStamped } from "../db/db";
import { defectTypeStyle, type DefectTypeStyle } from "./defectTypes";
import { reportRows } from "./esrGrouping";
import { headingText, type Heading } from "./findingsPdf";
import { numericDate } from "./dates";
import { drawReportFooter, drawReportHeading } from "./reportHeading";
import { EXPORT_MAX_EDGE, STAMP_VERSION, watermarkBlob } from "./watermark";

// The AFSS and Project site report's PDF pages after the cover (the "AFSS &
// Project report layout" design): a summary page (a tile per risk level, the
// re-inspected ones set apart, then every finding and the attached tests,
// each with its page), then the findings as cards under their ESR headings.
// Every page after the cover has a thin header (site, report, date,
// inspector) and a footer (site, address, page number); a card or heading
// never splits over a page, and a section or item that carries on to a new
// page repeats its heading marked (continued).

export interface SiteEntry {
  finding: Finding;
  photos: Photo[];
}

export interface SiteReportInfo {
  kind: "afss" | "project";
  siteName: string;
  // a customised report's name ("Level 3 defects"): the summary's big name
  // and the pages' header line read "Harbour Tower - Level 3 defects", as
  // the cover (the "Custom report heading" design, option B)
  reportName?: string;
  address: string;
  dateMs: number;
  inspector: string;
}

// the site's name, with a customised report's after it
export const reportHeadName = (info: Pick<SiteReportInfo, "siteName" | "reportName">) => (info.reportName?.trim() ? `${info.siteName} - ${info.reportName.trim()}` : info.siteName);

export interface AttachedTest {
  label: string;
  done: number;
  page: number;
}

const W = 595.28;
const H = 841.89;
const M = 40;
const CW = W - 2 * M;
const BOTTOM = H - 46; // the content stops here; the footer sits below
const INK: [number, number, number] = [20, 33, 46];
const SOFT: [number, number, number] = [74, 97, 117];
const NAVY: [number, number, number] = [11, 53, 80];
const LINE: [number, number, number] = [213, 222, 230];
const BAND: [number, number, number] = [243, 246, 249];
const PRIOR_BG: [number, number, number] = [250, 248, 252];
const PRIOR = ["rectified", "outstanding"];
const FRESH = ["critical", "non-critical", "non-compliance", "recommend", "note-only"];

// cards: two photos 4.3 × 5.7 cm beside the text, any more four across under them
const EDGE = 4;
const PAD = 6;
const TILE_W = 121;
const TILE_H = 161;
const TILE_GAP = 6;
const PHOTO_COL = TILE_W * 2 + TILE_GAP;
const NOTE_BOX_H = 50;
const TEXT_X = M + EDGE + PAD + PHOTO_COL + 10;
const TEXT_W = M + CW - PAD - TEXT_X;
const MORE_W = (CW - EDGE - 2 * PAD - 3 * TILE_GAP) / 4;
const MORE_H = (MORE_W * TILE_H) / TILE_W;
const ASPECT = TILE_H / TILE_W;

export const reportName = (kind: SiteReportInfo["kind"]) => (kind === "project" ? "Project inspection" : "AFSS inspection");
const isPrior = (f: Finding) => PRIOR.includes(f.defectType ?? "");

// ---- the frame: header and footer ----

// the thin line at the top of every page after the cover, but the summary's first
export function drawRunningHeader(doc: jsPDF, info: SiteReportInfo) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(reportHeadName(info), M, M + 6);
  const w = doc.getTextWidth(reportHeadName(info));
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SOFT);
  doc.text(` · ${reportName(info.kind)} · ${numericDate(info.dateMs)}`, M + w, M + 6);
  if (info.inspector) doc.text(info.inspector, M + CW, M + 6, { align: "right" });
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.line(M, M + 12, M + CW, M + 12);
  return M + 22;
}

// the footer: site and address, page number; on every page after the cover
export function drawFooter(doc: jsPDF, info: SiteReportInfo, page: number) {
  doc.setPage(page);
  drawReportFooter(doc, [info.siteName, info.address].filter((x) => x.trim()).join(" · "), page);
}

function sectionTitle(doc: jsPDF, text: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text(text.toUpperCase(), M, y + 7, { charSpace: 0.6 });
  return y + 13;
}

function pill(doc: jsPDF, t: DefectTypeStyle, x: number, y: number, h = 12) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  const w = doc.getTextWidth(t.label) + 10;
  doc.setFillColor(...t.bgRgb);
  if (t.value === "note-only") {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, w, h, 2, 2, "FD");
  } else doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setTextColor(...t.textRgb);
  doc.text(t.label, x + 5, y + h / 2 + 2.5);
  return w;
}

// ---- report order and references ----

export interface CardRow {
  kind: "heading" | "card";
  heading?: Heading;
  entry?: SiteEntry;
  ref?: string;
}

// AFSS: under the ESR headings, refs like "1.8.1"; a site with nothing
// categorised, or a Project report: in order, numbered 1, 2, 3
export function cardRows(entries: SiteEntry[], kind: SiteReportInfo["kind"]): CardRow[] {
  const rows = kind === "afss" ? reportRows(entries) : entries.map((entry) => ({ kind: "finding" as const, entry, ref: undefined }));
  const grouped = rows.some((r) => r.kind !== "finding");
  let n = 0;
  return rows.map((r) => (r.kind === "finding" ? { kind: "card", entry: r.entry, ref: r.ref ?? (grouped ? undefined : String(++n)) } : { kind: "heading", heading: r }));
}

// ---- ESR headings: a bar for a section (or group, or Uncategorised), bold with a rule for an item ----

const BAR_RGB: Record<"section" | "group" | "uncategorised", [number, number, number]> = { section: [153, 204, 255], group: [255, 255, 204], uncategorised: [217, 217, 217] };
function headingLines(doc: jsPDF, h: Heading, cont: boolean) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(h.kind === "item" ? 9.5 : 10);
  return doc.splitTextToSize(headingText(h) + (cont ? " (continued)" : ""), CW - 14) as string[];
}
function headingHeight(doc: jsPDF, h: Heading, cont = false) {
  return headingLines(doc, h, cont).length * 12 + (h.kind === "item" ? 10 : 12) + 6;
}
function drawHeading(doc: jsPDF, h: Heading, y: number, cont = false) {
  const lines = headingLines(doc, h, cont);
  if (h.kind === "item") {
    doc.setTextColor(...INK);
    doc.text(lines, M, y + 9);
    const ry = y + lines.length * 12 + 1;
    doc.setDrawColor(31, 111, 178);
    doc.setLineWidth(0.8);
    doc.line(M, ry, M + CW, ry);
  } else {
    doc.setFillColor(...BAR_RGB[h.kind]);
    doc.rect(M, y, CW, lines.length * 12 + 12, "F");
    doc.setTextColor(4, 33, 58);
    doc.text(lines, M + 7, y + 15);
  }
  return y + headingHeight(doc, h, cont);
}

// ---- the cards ----

async function tiles(photos: Photo[], onPhoto: () => void) {
  const out: Uint8Array[] = [];
  for (const p of photos) {
    const key = `${STAMP_VERSION}:${EXPORT_MAX_EDGE}:${ASPECT.toFixed(4)}:${p.takenAt}`;
    const t = await getStamped(p, "pdf", key, async (src) => {
      const { jpeg, width, height } = await watermarkBlob(src, p.takenAt, { cropAspect: ASPECT, maxEdge: EXPORT_MAX_EDGE });
      return { blob: jpeg, width, height };
    });
    out.push(new Uint8Array(await t.blob.arrayBuffer()));
    onPhoto();
  }
  return out;
}

const clock = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// the strip's right side: level · location, and for a Project report the first photo's time
function where(e: SiteEntry, kind: SiteReportInfo["kind"]) {
  const f = e.finding;
  const time = kind === "project" ? clock(e.photos.length ? Math.min(...e.photos.map((p) => p.takenAt)) : f.createdAt) : "";
  return [f.level?.trim(), f.location.trim(), time].filter(Boolean).join(" · ");
}

interface Laid {
  stripH: number;
  whereLines: string[];
  noteLines: string[];
  actLines: string[];
  bodyH: number;
  extraRows: number;
  h: number;
}

function layCard(doc: jsPDF, e: SiteEntry, ref: string | undefined, kind: SiteReportInfo["kind"]): Laid {
  const t = defectTypeStyle(e.finding.defectType);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let left = ref ? doc.getTextWidth(ref) + 8 : 0;
  doc.setFontSize(7);
  if (t) left += doc.getTextWidth(t.label) + 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const whereText = where(e, kind);
  const whereLines = whereText ? (doc.splitTextToSize(whereText, CW - EDGE - 2 * PAD - left) as string[]) : [];
  const stripH = Math.max(18, whereLines.length * 10 + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  const noteLines = doc.splitTextToSize(e.finding.note.trim() || "Untitled finding", TEXT_W) as string[];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const act = e.finding.rectification?.trim();
  const actLines = act ? (doc.splitTextToSize(act, TEXT_W) as string[]) : [];
  const textH = noteLines.length * 13 + (actLines.length ? 8 + 11 + actLines.length * 10.5 : 0);
  const photoH = e.photos.length ? TILE_H : NOTE_BOX_H;
  const bodyH = Math.max(photoH, textH);
  const extraRows = Math.ceil(Math.max(0, e.photos.length - 2) / 4);
  return { stripH, whereLines, noteLines, actLines, bodyH, extraRows, h: stripH + PAD + bodyH + PAD + extraRows * (MORE_H + TILE_GAP) };
}

export interface CardsResult {
  pageOf: Map<SiteEntry, number>;
}

// Draws the cards from a fresh page onwards; the caller adds that page.
export async function drawCards(doc: jsPDF, rows: CardRow[], info: SiteReportInfo, onPhoto: (done: number, total: number) => void = () => {}): Promise<CardsResult> {
  const pageOf = new Map<SiteEntry, number>();
  const total = rows.reduce((n, r) => n + (r.entry?.photos.length ?? 0), 0);
  let done = 0;
  onPhoto(0, total);
  let y = drawRunningHeader(doc, info);
  // the headings in force, to repeat (continued) on a new page
  let section: Heading | null = null;
  let group: Heading | null = null;
  let item: Heading | null = null;
  let pending: Heading[] = [];
  const newPage = (forCard: boolean) => {
    doc.addPage();
    y = drawRunningHeader(doc, info);
    if (!forCard) return;
    // a new section among the pending headings starts afresh; else the one in force carries on
    const startsSection = pending.some((h) => h.kind !== "item");
    if (!startsSection && section) {
      y = drawHeading(doc, section, y, true);
      if (group) y = drawHeading(doc, group, y, true);
    }
    const startsItem = pending.some((h) => h.kind === "item") || startsSection;
    if (!startsItem && item) y = drawHeading(doc, item, y, true);
  };

  for (const row of rows) {
    if (row.kind === "heading") {
      pending.push(row.heading!);
      continue;
    }
    const e = row.entry!;
    const lay = layCard(doc, e, row.ref, info.kind);
    const headH = pending.reduce((a, h) => a + headingHeight(doc, h), 0);
    // the whole card (and its headings) on the next page if it won't fit; one taller than a page breaks between its photo rows
    const whole = headH + lay.h <= BOTTOM - M - 24;
    const firstPart = headH + lay.h - lay.extraRows * (MORE_H + TILE_GAP);
    if (y + (whole ? headH + lay.h : firstPart) > BOTTOM) newPage(true);
    for (const h of pending) {
      y = drawHeading(doc, h, y);
      if (h.kind === "item") item = h;
      else if (h.kind === "group") group = h;
      else {
        section = h;
        group = null;
        item = null;
      }
    }
    pending = [];
    pageOf.set(e, doc.getNumberOfPages());
    const photos = await tiles(e.photos, () => onPhoto(++done, total));
    y = drawCard(doc, e, row.ref, lay, photos, y, () => {
      newPage(false);
      return y;
    });
    y += 8;
  }
  return { pageOf };
}

function drawCard(doc: jsPDF, e: SiteEntry, ref: string | undefined, lay: Laid, photos: Uint8Array[], top: number, nextPage: () => number): number {
  const t = defectTypeStyle(e.finding.defectType);
  const edge: [number, number, number] = !t || t.value === "note-only" ? [153, 153, 153] : t.bgRgb;
  const prior = isPrior(e.finding);
  let segTop = top;
  const frame = (bottom: number) => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.rect(M, segTop, CW, bottom - segTop, "S");
    doc.setFillColor(...edge);
    doc.rect(M, segTop, EDGE, bottom - segTop, "F");
  };
  // the strip: ref, risk, then level · location (· time) on the right
  doc.setFillColor(...(prior ? PRIOR_BG : BAND));
  doc.rect(M, top, CW, lay.stripH, "F");
  doc.setDrawColor(...LINE);
  doc.line(M, top + lay.stripH, M + CW, top + lay.stripH);
  let x = M + EDGE + PAD;
  if (ref) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(ref, x, top + 12);
    x += doc.getTextWidth(ref) + 8;
  }
  if (t) pill(doc, t, x, top + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  lay.whereLines.forEach((l, i) => doc.text(l, M + CW - PAD, top + 12 + i * 10, { align: "right" }));

  // the body: two photos (or the Note box) beside the note and the recommended action
  const by = top + lay.stripH + PAD;
  const px = M + EDGE + PAD;
  if (photos.length) photos.slice(0, 2).forEach((p, i) => doc.addImage(p, "JPEG", px + i * (TILE_W + TILE_GAP), by, TILE_W, TILE_H));
  else {
    doc.setDrawColor(201, 196, 184);
    doc.setLineWidth(0.75);
    doc.setLineDashPattern([3, 3], 0);
    doc.rect(px, by, TILE_W, NOTE_BOX_H, "S");
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text("Note", px + TILE_W / 2, by + NOTE_BOX_H / 2 + 3, { align: "center" });
  }
  let ty = by + 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(lay.noteLines, TEXT_X, ty);
  ty += lay.noteLines.length * 13 + 8;
  if (lay.actLines.length) {
    doc.setFontSize(8.5);
    doc.text("Recommended action", TEXT_X, ty);
    doc.setFont("helvetica", "normal");
    doc.text(lay.actLines, TEXT_X, ty + 11);
  }
  let y = by + lay.bodyH + PAD;

  // any more photos, four across under the body; a row that won't fit starts the next page
  const more = photos.slice(2);
  for (let i = 0; i < more.length; i += 4) {
    if (y + MORE_H + PAD > BOTTOM) {
      frame(y);
      y = nextPage();
      segTop = y;
      // the card carries on: its strip again, marked (continued)
      doc.setFillColor(...(prior ? PRIOR_BG : BAND));
      doc.rect(M, y, CW, 18, "F");
      doc.setDrawColor(...LINE);
      doc.line(M, y + 18, M + CW, y + 18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      const head = ref ? `${ref} ` : "";
      doc.text(head, M + EDGE + PAD, y + 12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SOFT);
      doc.text(`${lay.noteLines[0]} (continued)`, M + EDGE + PAD + doc.getTextWidth(head), y + 12);
      y += 18 + PAD;
    }
    more.slice(i, i + 4).forEach((p, k) => doc.addImage(p, "JPEG", px + k * (MORE_W + TILE_GAP), y, MORE_W, MORE_H));
    y += MORE_H + TILE_GAP;
  }
  frame(y);
  return y;
}

// ---- the summary ----

interface SumRow {
  group?: string; // a group heading row
  ref?: string;
  type?: DefectTypeStyle;
  lines?: string[];
  where?: string[];
  page?: number;
  prior?: boolean;
  h: number;
}

const SUM_COLS = [40, 74, 0, 130, 30];
const sumWidths = () => {
  const fixed = SUM_COLS.reduce((a, b) => a + b, 0);
  return SUM_COLS.map((w) => w || CW - fixed);
};

function summaryRows(doc: jsPDF, cards: CardRow[], pageOf: Map<SiteEntry, number>): SumRow[] {
  const widths = sumWidths();
  const list = cards.filter((r) => r.kind === "card");
  const priorList = list.filter((r) => isPrior(r.entry!.finding));
  const row = (r: CardRow): SumRow => {
    const f = r.entry!.finding;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(f.note.trim() || "Untitled finding", widths[2] - 8) as string[];
    const wh = doc.splitTextToSize([f.level?.trim(), f.location.trim()].filter(Boolean).join(" · ") || "–", widths[3] - 8) as string[];
    return { ref: r.ref, type: defectTypeStyle(f.defectType), lines, where: wh, page: pageOf.get(r.entry!), prior: isPrior(f), h: Math.max(16, Math.max(lines.length, wh.length) * 10 + 6) };
  };
  if (!priorList.length) return list.map(row);
  return [
    { group: "New findings", h: 14 },
    ...list.filter((r) => !isPrior(r.entry!.finding)).map(row),
    { group: "Previous inspection · defects re-inspected", h: 14 },
    ...priorList.map(row),
  ];
}

// the summary's first page heading: the title and the logo, the site under it
function summaryHeading(doc: jsPDF, info: SiteReportInfo, logo: { data: string; w: number; h: number } | null) {
  return drawReportHeading(doc, { title: `${reportName(info.kind)} · Summary`, name: reportHeadName(info), note: [info.address, numericDate(info.dateMs), info.inspector].filter((x) => x.trim()).join(" · ") }, logo);
}

// the tiles: the five new-finding levels, then (when there are any) a
// partition and Rectified and Outstanding, captioned, on the same row
function drawTiles(doc: jsPDF, entries: SiteEntry[], y: number) {
  const count = (v: string) => entries.filter((e) => e.finding.defectType === v).length;
  const prior = PRIOR.filter((v) => count(v));
  const n = FRESH.length + prior.length;
  const partW = prior.length ? 14 : 0;
  const gap = 6;
  const tw = (CW - partW - (n - 1 - (prior.length ? 1 : 0)) * gap) / n;
  y = sectionTitle(doc, "Findings by risk level", y);
  if (prior.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...SOFT);
    doc.text("NEW FINDINGS", M, y + 5, { charSpace: 0.4 });
    doc.text("RE-INSPECTED", M + FRESH.length * (tw + gap) - gap + partW, y + 5, { charSpace: 0.4 });
    y += 10;
  }
  const th = 40;
  let x = M;
  const tile = (v: string, prior: boolean) => {
    const t = defectTypeStyle(v as Finding["defectType"])!;
    if (prior) doc.setFillColor(246, 243, 250);
    else doc.setFillColor(255, 255, 255);
    doc.setDrawColor(201, 214, 224);
    doc.setLineWidth(0.6);
    if (prior) doc.setLineDashPattern([2, 2], 0);
    doc.rect(x, y, tw, th, "FD");
    doc.setLineDashPattern([], 0);
    doc.setFillColor(...(t.value === "note-only" ? ([153, 153, 153] as [number, number, number]) : t.bgRgb));
    doc.rect(x, y, tw, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(String(count(v)), x + 6, y + 21);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...SOFT);
    doc.text(t.label, x + 6, y + 33);
    x += tw + gap;
  };
  FRESH.forEach((v) => tile(v, false));
  if (prior.length) {
    const px = x - gap + partW / 2;
    doc.setDrawColor(138, 122, 163);
    doc.setLineWidth(0.8);
    doc.line(px, y - 10, px, y + th);
    x = x - gap + partW;
    prior.forEach((v) => tile(v, true));
  }
  return y + th;
}

function drawSumHead(doc: jsPDF, y: number, heads: string[], widths: number[]) {
  doc.setFillColor(...NAVY);
  doc.rect(M, y, CW, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  let x = M;
  heads.forEach((h, i) => {
    doc.text(h, x + widths[i] / 2, y + 11.5, { align: "center" });
    x += widths[i];
  });
  return y + 18;
}

function cell(doc: jsPDF, x: number, y: number, w: number, h: number, fill?: [number, number, number]) {
  if (fill) {
    doc.setFillColor(...fill);
    doc.rect(x, y, w, h, "F");
  }
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.5);
  doc.rect(x, y, w, h, "S");
}

// How many pages the summary takes, so they can be kept free before the
// findings are drawn (the page numbers in it are only known after).
export function summaryPageCount(doc: jsPDF, cards: CardRow[], entries: SiteEntry[], tests: number): number {
  return layoutSummary(summaryRows(doc, cards, new Map()), tests, entries.some((e) => isPrior(e.finding))).pages;
}

// the same steps as drawSummary, measuring only
function layoutSummary(rows: SumRow[], tests: number, prior: boolean) {
  // the first page: the heading, the tiles (captioned when re-inspected ones show), then the table's heading row
  let y = M + 72 + 13 + (prior ? 10 : 0) + 40 + 14 + 13 + 18;
  let pages = 1;
  const breaks: number[] = [];
  rows.forEach((r, i) => {
    if (y + r.h > BOTTOM) {
      pages++;
      breaks.push(i);
      y = M + 22 + 18;
    }
    y += r.h;
  });
  if (tests) {
    y += 14;
    if (y + 13 + 18 + tests * 16 > BOTTOM) pages++;
  }
  return { pages, breaks };
}

// Draws the summary on the pages kept for it, from `first`.
export function drawSummary(doc: jsPDF, first: number, info: SiteReportInfo, entries: SiteEntry[], cards: CardRow[], pageOf: Map<SiteEntry, number>, tests: AttachedTest[], logo: { data: string; w: number; h: number } | null) {
  const rows = summaryRows(doc, cards, pageOf);
  const widths = sumWidths();
  let page = first;
  doc.setPage(page);
  let y = summaryHeading(doc, info, logo);
  y = drawTiles(doc, entries, y) + 14;
  y = sectionTitle(doc, "All findings", y);
  const heads = ["Ref", "Risk", "Finding", "Level · location", "Page"];
  y = drawSumHead(doc, y, heads, widths);
  const turn = () => {
    page++;
    doc.setPage(page);
    y = drawRunningHeader(doc, info);
  };
  for (const r of rows) {
    if (y + r.h > BOTTOM) {
      turn();
      y = drawSumHead(doc, y, heads, widths);
    }
    if (r.group) {
      cell(doc, M, y, CW, r.h, BAND);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...NAVY);
      doc.text(r.group.toUpperCase(), M + 4, y + 9.5, { charSpace: 0.4 });
      y += r.h;
      continue;
    }
    let x = M;
    const fill = r.prior ? PRIOR_BG : undefined;
    widths.forEach((w) => {
      cell(doc, x, y, w, r.h, fill);
      x += w;
    });
    x = M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    if (r.ref) doc.text(r.ref, x + widths[0] / 2, y + r.h / 2 + 3, { align: "center" });
    x += widths[0];
    if (r.type) {
      doc.setFontSize(7);
      const pw = doc.getTextWidth(r.type.label) + 10;
      pill(doc, r.type, x + (widths[1] - pw) / 2, y + (r.h - 12) / 2);
    }
    x += widths[1];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(r.lines!, x + 4, y + 10.5);
    x += widths[2];
    doc.text(r.where!, x + 4, y + 10.5);
    x += widths[3];
    if (r.page) doc.text(String(r.page), x + widths[4] / 2, y + r.h / 2 + 3, { align: "center" });
    y += r.h;
  }
  if (tests.length) {
    y += 14;
    if (y + 13 + 18 + tests.length * 16 > BOTTOM) turn();
    y = sectionTitle(doc, "Attached tests", y);
    const tw = [CW - 160, 130, 30];
    y = drawSumHead(doc, y, ["Test", "Done", "Page"], tw);
    for (const t of tests) {
      let x = M;
      tw.forEach((w) => {
        cell(doc, x, y, w, 16);
        x += w;
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text(t.label, M + 4, y + 10.5);
      doc.text(numericDate(t.done), M + tw[0] + 4, y + 10.5);
      doc.text(String(t.page), M + tw[0] + tw[1] + tw[2] / 2, y + 10.5, { align: "center" });
      y += 16;
    }
  }
}

// Cards drawn from `y` on, numbered 1, 2, 3 (a flow test's defects, straight
// on after its comments); `newPage` starts the next page and says where its
// content begins. Returns where the last card ends.
export async function drawEntryCards(doc: jsPDF, entries: SiteEntry[], y: number, newPage: () => number): Promise<number> {
  for (const [i, e] of entries.entries()) {
    const ref = String(i + 1);
    const lay = layCard(doc, e, ref, "afss");
    const whole = lay.h <= BOTTOM - M - 24;
    if (y + (whole ? lay.h : lay.h - lay.extraRows * (MORE_H + TILE_GAP)) > BOTTOM) y = newPage();
    const photos = await tiles(e.photos, () => {});
    y = drawCard(doc, e, ref, lay, photos, y, () => newPage()) + 8;
  }
  return y;
}

export const CONTENT_BOTTOM = BOTTOM;
