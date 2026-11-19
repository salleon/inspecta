import type { jsPDF as JsPDF } from "jspdf";
import type { Site, SpfSystem, StairTest } from "../db/types";
import { getStamped } from "../db/db";
import { logoImage } from "./flowPdf";
import { columnWidths, lowerTables, photosTitle, stairPages, type StairPage, type StairTable, type StairTile } from "./stairPrint";
import { appendixPhotos, PHOTO_H, PHOTO_W, testPhotoItems, type AppendixPhoto } from "./stairPhotos";
import { numericDate } from "./dates";
import { EXPORT_MAX_EDGE, STAMP_VERSION, watermarkBlob } from "./watermark";

// Stair tests in the PDF, laid out as lib/stairPrint (the "Stair report
// layout" design, Option A; the preview draws the same). Every section keeps
// together: one that won't fit in what's left of a page starts the next,
// and only a table taller than a whole page breaks between its rows, its
// heading row repeated. Every page ends with the footer.

export const PAGE = { w: 595.28, h: 841.89, m: 40 };
export const INK = "#14212e";
export const SOFT = "#4a6175";
export const NAVY = "#0b3550";
export const LINE = "#d5dee6";
export const FAIL_FILL = "#ffd9d4";
export const FAIL_INK = "#b3261e";
const WARN_FILL = "#fff0b8";
const WARN_INK = "#6b4a00";
const TILE_LINE = "#c9d6e0";
const BAND = "#f3f6f9";
const GAP = 14; // between sections
const FOOT = 30; // kept clear at the bottom for the footer

// the PDF's own font has no ✓ / ✗
const plain = (s: string) => s.replace(/ ✓/g, " OK").replace(/ ✗/g, " FAIL").replace(/✓/g, "OK").replace(/✗/g, "FAIL");

export type Logo = { data: string; w: number; h: number } | null;

export async function appendStairPages(doc: JsPDF, tests: StairTest[], sys: SpfSystem, site: Pick<Site, "name" | "address">, first: boolean): Promise<void> {
  const logo = await logoImage().catch(() => null);
  let fresh = first;
  for (const test of tests) {
    for (const page of stairPages(test, sys, site)) {
      if (!fresh) doc.addPage();
      fresh = false;
      drawPage(doc, page, logo);
    }
    // the test's photo appendix, after all its stairs
    const photos = appendixPhotos(await testPhotoItems(test), test, sys);
    if (photos.length) {
      if (!fresh) doc.addPage();
      fresh = false;
      await drawAppendix(doc, test, site, photos, logo);
    }
  }
}

// the heading every page has (the FFCP pages too): title, logo, rule, subtitle; returns where the page goes on from
export function heading(doc: JsPDF, title: string, subtitle: string, logo: Logo) {
  const { w: W, m: M } = PAGE;
  let y = M + 6;
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  // big enough to read at a glance; a wide company logo: 240 pt across at most
  const lh = logo ? Math.min(58, (240 * logo.h) / logo.w) : 0;
  const lw = logo ? (logo.w / logo.h) * lh : 0;
  // the title stays clear of the logo: smaller type if it would run under it
  const room = W - 2 * M - lw - 12;
  let size = 15;
  doc.setFontSize(size);
  while (size > 10 && doc.getTextWidth(title) > room) doc.setFontSize((size -= 0.5));
  doc.text(title, M, y + 8);
  if (logo) doc.addImage(logo.data, "PNG", W - M - lw, y - 22, lw, lh);
  doc.setFillColor("#1f6fb2");
  doc.rect(M, y + 15, 46, 2.5, "F");
  y += 30;
  doc.setFontSize(11);
  doc.text(subtitle, M, y + 4);
  return y + 16;
}

// a page laid out top to bottom: sections that keep together, a footer on every page
class Flow {
  y = PAGE.m;
  private doc: JsPDF;
  private foot: string;
  constructor(doc: JsPDF, foot: string) {
    this.doc = doc;
    this.foot = foot;
  }
  get bottom() {
    return PAGE.h - PAGE.m - FOOT;
  }
  footer() {
    const { doc } = this;
    const { w: W, h: H, m: M } = PAGE;
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.5);
    doc.line(M, H - M - 12, W - M, H - M - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(SOFT);
    doc.text(this.foot, M, H - M - 2);
    doc.text(`Page ${doc.getNumberOfPages()}`, W - M, H - M - 2, { align: "right" });
  }
  newPage() {
    this.footer();
    this.doc.addPage();
    this.y = PAGE.m;
  }
  // room for `h` more, or on to the next page (never from the top of one)
  fit(h: number) {
    if (this.y + h > this.bottom && this.y > PAGE.m + 1) this.newPage();
  }
}

// the stair heading: title, rule and the stair's name the same size, the logo on the right
function stairHeading(doc: JsPDF, page: Pick<StairPage, "title" | "stair" | "note">, logo: Logo) {
  const { w: W, m: M } = PAGE;
  const y = M + 6;
  const lh = logo ? Math.min(58, (240 * logo.h) / logo.w) : 0;
  const lw = logo ? (logo.w / logo.h) * lh : 0;
  const room = W - 2 * M - lw - 12;
  const big = (text: string, at: number) => {
    let size = 16.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    while (size > 10 && doc.getTextWidth(text) > room) doc.setFontSize((size -= 0.5));
    doc.setTextColor(INK);
    doc.text(text, M, at);
  };
  big(page.title, y + 10);
  if (logo) doc.addImage(logo.data, "PNG", W - M - lw, y - 22, lw, lh);
  doc.setFillColor("#1f6fb2");
  doc.rect(M, y + 17, 46, 2.5, "F");
  big(page.stair, y + 42);
  if (page.note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(SOFT);
    doc.text(page.note, M, y + 54);
  }
  return y + (page.note ? 66 : 56);
}

function sectionTitle(doc: JsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(NAVY);
  doc.text(text.toUpperCase(), x, y + 7, { charSpace: 0.6 });
}
const TITLE_H = 13;

// ---- details: an even strip, three to a row ----
function detailsBlock(doc: JsPDF, details: StairPage["details"]) {
  const { m: M } = PAGE;
  const width = PAGE.w - 2 * M;
  const colW = width / 3;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const rows: { lines: string[][]; h: number }[] = [];
  for (let i = 0; i < details.length; i += 3) {
    const lines = details.slice(i, i + 3).map((d) => doc.splitTextToSize(plain(d.value || "–"), colW - 60) as string[]);
    rows.push({ lines, h: Math.max(...lines.map((l) => l.length)) * 10 + 8 });
  }
  const h = rows.reduce((a, r) => a + r.h, 0);
  return {
    h,
    draw(y: number) {
      doc.setDrawColor(LINE);
      doc.setLineWidth(0.5);
      doc.line(M, y, M + width, y);
      rows.forEach((r, ri) => {
        details.slice(ri * 3, ri * 3 + 3).forEach((d, i) => {
          const x = M + i * colW;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(NAVY);
          doc.text(d.label, x, y + 12);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(INK);
          doc.text(r.lines[i], x + 56, y + 12);
        });
        y += r.h;
        doc.line(M, y, M + width, y);
      });
    },
  };
}

// ---- reading tiles: 1 to 4 in one row, 5 or 6 in rows of three ----
function tilesBlock(doc: JsPDF, tiles: StairTile[]) {
  const { m: M } = PAGE;
  const width = PAGE.w - 2 * M;
  const cols = tiles.length <= 4 ? 4 : 3;
  const gap = 6;
  const tw = (width - (cols - 1) * gap) / cols;
  const laid = tiles.map((t) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const label = doc.splitTextToSize(t.label, tw - 12) as string[];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const value = doc.splitTextToSize(plain(t.value), tw - 12) as string[];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const lines = t.lines.flatMap((l) => doc.splitTextToSize(plain(l), tw - 12) as string[]);
    return { t, label, value, lines, h: 8 + label.length * 8 + value.length * 12 + 4 + lines.length * 7.5 + 4 };
  });
  const rows: (typeof laid)[] = [];
  for (let i = 0; i < laid.length; i += cols) rows.push(laid.slice(i, i + cols));
  const heights = rows.map((r) => Math.max(50, ...r.map((x) => x.h)));
  const h = TITLE_H + heights.reduce((a, b) => a + b, 0) + (rows.length - 1) * gap;
  return {
    h,
    draw(y: number) {
      sectionTitle(doc, "Stair readings", M, y);
      y += TITLE_H;
      rows.forEach((row, ri) => {
        row.forEach((x, i) => {
          const left = M + i * (tw + gap);
          doc.setDrawColor(x.t.fail ? FAIL_INK : TILE_LINE);
          doc.setLineWidth(x.t.fail ? 0.9 : 0.6);
          doc.roundedRect(left, y, tw, heights[ri], 3, 3, "S");
          let yy = y + 11;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(SOFT);
          x.label.forEach((l) => {
            doc.text(l, left + 6, yy);
            yy += 8;
          });
          yy += 4;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(x.t.fail ? FAIL_INK : INK);
          x.value.forEach((l) => {
            doc.text(l, left + 6, yy);
            yy += 12;
          });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(x.t.fail ? FAIL_INK : SOFT);
          x.lines.forEach((l) => {
            doc.text(l, left + 6, yy);
            yy += 7.5;
          });
        });
        y += heights[ri] + gap;
      });
    },
  };
}

// ---- tables: full width, rows 15 pt unless their text wraps, the heading row 24 pt ----
function tableBlock(doc: JsPDF, t: StairTable) {
  const { m: M } = PAGE;
  const width = PAGE.w - 2 * M;
  const widths = columnWidths(t, width);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const head = t.head?.map((h, i) => h.split("\n").flatMap((part) => doc.splitTextToSize(part, widths[i] - 6) as string[]));
  const hh = head ? Math.max(24, Math.max(...head.map((l) => l.length)) * 8.5 + 7) : 0;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const rows = t.rows.map((r) => {
    const lines = r.cells.map((c, i) => doc.splitTextToSize(plain(c), widths[i] - 8) as string[]);
    return { r, lines, h: Math.max(15, Math.max(...lines.map((l) => l.length)) * 10 + 5) };
  });
  const keyH = t.key ? 12 : 0;
  const h = TITLE_H + hh + rows.reduce((a, r) => a + r.h, 0) + keyH;
  const drawHead = (y: number) => {
    if (!head) return y;
    doc.setFillColor(NAVY);
    doc.rect(M, y, width, hh, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor("#ffffff");
    let x = M;
    head.forEach((l, i) => {
      const top = y + (hh - l.length * 8.5) / 2 + 6.5;
      l.forEach((line, k) => doc.text(line, x + widths[i] / 2, top + k * 8.5, { align: "center" }));
      x += widths[i];
    });
    return y + hh;
  };
  const drawRow = (row: (typeof rows)[number], y: number) => {
    let x = M;
    row.lines.forEach((l, i) => {
      const fail = !!row.r.fails[i];
      const warn = !fail && !!row.r.warns?.[i];
      if (fail || warn) {
        doc.setFillColor(fail ? FAIL_FILL : WARN_FILL);
        doc.rect(x, y, widths[i], row.h, "F");
      }
      doc.setDrawColor(LINE);
      doc.setLineWidth(0.5);
      doc.rect(x, y, widths[i], row.h, "S");
      doc.setFont("helvetica", (i === 0 && t.bold) || fail || warn ? "bold" : "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(fail ? FAIL_INK : warn ? WARN_INK : l.join("") === "–" ? "#9aabb9" : INK);
      const left = (t.align[i] ?? "c") === "l";
      const top = y + (row.h - l.length * 10) / 2 + 7.5;
      l.forEach((line, k) => doc.text(line, left ? x + 4 : x + widths[i] / 2, top + k * 10, left ? undefined : { align: "center" }));
      x += widths[i];
    });
  };
  return {
    h,
    // drawn into the flow: kept together when it fits on a page, else broken between rows
    draw(flow: Flow) {
      const whole = h <= flow.bottom - PAGE.m;
      flow.fit(whole ? h : TITLE_H + hh + 3 * 15);
      sectionTitle(doc, t.title, M, flow.y);
      flow.y = drawHead(flow.y + TITLE_H);
      for (const row of rows) {
        if (flow.y + row.h > flow.bottom) {
          flow.newPage();
          flow.y = drawHead(flow.y);
        }
        drawRow(row, flow.y);
        flow.y += row.h;
      }
      if (t.key) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(SOFT);
        doc.text(t.key, M, flow.y + 9);
        flow.y += keyH;
      }
    },
  };
}

function drawPage(doc: JsPDF, page: StairPage, logo: Logo) {
  const flow = new Flow(doc, page.footer);
  flow.y = stairHeading(doc, page, logo);
  const details = detailsBlock(doc, page.details);
  const tiles = page.tiles.length ? tilesBlock(doc, page.tiles) : null;
  // the checks two to a row while the whole page fits on one sheet; once it runs on anyway, one to a row
  const sections = (twoUp: boolean) => [...page.tables, ...lowerTables(page, twoUp)].map((t) => tableBlock(doc, t));
  const height = (list: { h: number }[]) => list.reduce((a, s) => a + s.h + GAP, 0);
  const top = flow.y + details.h + GAP + (tiles ? tiles.h + GAP : 0);
  const tables = page.checks && top + height(sections(true)) - GAP > flow.bottom ? sections(false) : sections(true);

  details.draw(flow.y);
  flow.y += details.h + GAP;
  if (tiles) {
    flow.fit(tiles.h);
    tiles.draw(flow.y);
    flow.y += tiles.h + GAP;
  }
  for (const t of tables) {
    t.draw(flow);
    flow.y += GAP;
  }
  flow.footer();
}

// ---- the photo appendix: every stair's Photos & notes, each photo 5 × 6.61 cm with a label table under it ----
const ROW_GAP = 14;
async function drawAppendix(doc: JsPDF, test: StairTest, site: Pick<Site, "name" | "address">, photos: AppendixPhoto[], logo: Logo) {
  const { w: W, m: M } = PAGE;
  const width = W - 2 * M;
  const flow = new Flow(doc, [site.name.trim(), "Photo appendix"].filter(Boolean).join(" · "));
  flow.y = stairHeading(doc, { title: photosTitle(test), stair: "Photo appendix", note: `Photos & notes from every stair in this test · ${[site.name.trim(), numericDate(test.testedAt)].filter(Boolean).join(" · ")}` }, logo);
  sectionTitle(doc, "Photo appendix", M, flow.y);
  flow.y += TITLE_H;
  const gapX = (width - 3 * PHOTO_W) / 2;
  const labelW = 44;
  const aspect = PHOTO_W / PHOTO_H;
  // a photo's label table: its number, then a row for each of stair, level, location, run, note
  const label = (p: AppendixPhoto) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const rows = p.rows.map(([k, v]) => ({ k, lines: doc.splitTextToSize(plain(v || "–"), PHOTO_W - labelW - 6) as string[] }));
    return { rows, h: 14 + rows.reduce((a, r) => a + Math.max(12, r.lines.length * 9 + 3), 0) };
  };
  for (let i = 0; i < photos.length; i += 3) {
    const row = photos.slice(i, i + 3);
    const labels = row.map(label);
    const rowH = PHOTO_H + 4 + Math.max(...labels.map((l) => l.h));
    flow.fit(rowH);
    for (const [j, p] of row.entries()) {
      const x = M + j * (PHOTO_W + gapX);
      let y = flow.y;
      if (p.photo) {
        const photo = p.photo;
        const key = `${STAMP_VERSION}:${EXPORT_MAX_EDGE}:${aspect.toFixed(4)}:${photo.takenAt}`;
        const tile = await getStamped(photo, "pdf", key, async (src) => {
          const { jpeg, width: w, height: h } = await watermarkBlob(src, photo.takenAt, { cropAspect: aspect, maxEdge: EXPORT_MAX_EDGE });
          return { blob: jpeg, width: w, height: h };
        });
        doc.addImage(new Uint8Array(await tile.blob.arrayBuffer()), "JPEG", x, y, PHOTO_W, PHOTO_H);
      } else {
        doc.setFillColor(BAND);
        doc.setDrawColor(TILE_LINE);
        doc.rect(x, y, PHOTO_W, PHOTO_H, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(SOFT);
        doc.text("No photo", x + PHOTO_W / 2, y + PHOTO_H / 2, { align: "center" });
      }
      y += PHOTO_H + 4;
      doc.setFillColor(NAVY);
      doc.rect(x, y, PHOTO_W, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor("#ffffff");
      doc.text(`Photo ${p.n}`, x + 4, y + 9.5);
      y += 14;
      for (const r of labels[j].rows) {
        const rh = Math.max(12, r.lines.length * 9 + 3);
        doc.setFillColor(BAND);
        doc.rect(x, y, labelW, rh, "F");
        doc.setDrawColor(LINE);
        doc.setLineWidth(0.5);
        doc.rect(x, y, labelW, rh, "S");
        doc.rect(x + labelW, y, PHOTO_W - labelW, rh, "S");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(NAVY);
        doc.text(r.k, x + 4, y + 8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK);
        r.lines.forEach((l, k) => doc.text(l, x + labelW + 4, y + 8.5 + k * 9));
        y += rh;
      }
    }
    flow.y += rowH + ROW_GAP;
  }
  flow.footer();
}
