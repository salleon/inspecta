import type { jsPDF as JsPDF } from "jspdf";
import type { Site, SpfSystem, StairTest } from "../db/types";
import { logoImage } from "./flowPdf";
import { stairPages, type StairPage, type StairRow } from "./stairPrint";
import { PHOTOS_SUBTITLE, testPhotoItems, type StairPhotoItem } from "./stairPhotos";

// Stair tests in the PDF (design canvas StairTestSimple, "The report"): a
// page per stair, laid out as lib/stairPrint (the preview draws the same).
// A tall stair runs on to more pages, the table's heading repeated.

export const PAGE = { w: 595.28, h: 841.89, m: 40 };
export const INK = "#14212e";
export const SOFT = "#4a6175";
export const NAVY = "#0b3550";
export const LINE = "#d5dee6";
export const FAIL_FILL = "#ffd9d4";
export const FAIL_INK = "#b3261e";
const WARN_FILL = "#fff0b8";
const WARN_INK = "#6b4a00";

// the PDF's own font has no ✓ / ✗
const plain = (s: string) => s.replace(/ ✓/g, " OK").replace(/ ✗/g, " FAIL").replace(/✓/g, "OK").replace(/✗/g, "FAIL");

export type Logo = { data: string; w: number; h: number } | null;

export async function appendStairPages(doc: JsPDF, tests: StairTest[], sys: SpfSystem, site: Pick<Site, "name" | "address">, first: boolean): Promise<void> {
  const logo = await logoImage().catch(() => null);
  let fresh = first;
  for (const test of tests) {
    const pages = stairPages(test, sys, site);
    for (const page of pages) {
      if (!fresh) doc.addPage();
      fresh = false;
      drawPage(doc, page, logo);
    }
    // the test's photos and notes, on their own page after its stairs
    const items = await testPhotoItems(test);
    if (items.length && pages[0]) {
      if (!fresh) doc.addPage();
      fresh = false;
      await drawPhotos(doc, { ...pages[0], title: pages[0].title.replace(/ · Summary$/, "") }, items, logo);
    }
  }
}

// the heading every page has: title, logo, rule, subtitle; returns where the page goes on from
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

// Photos & notes: on the page after the stair pages, headed like them,
// then each drawn exactly as the findings report draws a finding (lib/findingsPdf)
async function drawPhotos(doc: JsPDF, first: StairPage, items: StairPhotoItem[], logo: Logo) {
  const { w: W, m: M } = PAGE;
  const width = W - 2 * M;
  let y = heading(doc, first.title, PHOTOS_SUBTITLE, logo);
  doc.setFontSize(8.5);
  first.details
    .filter((d) => ["Site", "Date", "Test", "Tested by"].includes(d.label))
    .forEach((d, i) => {
      const x = M + (i % 2) * (width / 2);
      const yy = y + Math.floor(i / 2) * 12;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(NAVY);
      doc.text(d.label, x, yy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.text(doc.splitTextToSize(d.value || "–", width / 2 - 60)[0] ?? "", x + 52, yy);
    });
  y += 40;
  const { drawFindings } = await import("./findingsPdf");
  await drawFindings(doc, items.map((i) => ({ finding: i.finding, photos: i.photos })), undefined, y);
}

function drawPage(doc: JsPDF, page: StairPage, logo: Logo) {
  const { w: W, h: H, m: M } = PAGE;
  const width = W - 2 * M;
  let y = heading(doc, page.title, page.subtitle, logo);

  // details, two columns
  doc.setFontSize(8.5);
  const colW = width / 2;
  page.details.forEach((d, i) => {
    const x = M + (i % 2) * colW;
    const yy = y + Math.floor(i / 2) * 12;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY);
    doc.text(d.label, x, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    doc.text(doc.splitTextToSize(d.value || "–", colW - 60)[0] ?? "", x + 52, yy);
  });
  y += Math.ceil(page.details.length / 2) * 12 + 6;

  // the once-a-stair readings
  if (page.boxes.length) {
    const gap = 6;
    const bw = (width - 3 * gap) / 4;
    const bh = 36 + 7 * Math.max(0, ...page.boxes.map((b) => (b.ref?.length ?? 1) - 1));
    page.boxes.forEach((b, i) => {
      const x = M + i * (bw + gap);
      doc.setDrawColor("#c9d6e0");
      doc.roundedRect(x, y, bw, bh, 3, 3, "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(SOFT);
      doc.text(b.label, x + 5, y + 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(b.fail ? FAIL_INK : INK);
      doc.text(plain(b.value), x + 5, y + 24);
      if (b.ref) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(SOFT);
        b.ref.forEach((r, k) => doc.text(r, x + 5, y + 32 + 7 * k));
      }
    });
    y += bh + 10;
  }

  // a table: its heading again on each page it runs on to
  const rowH = 13;
  const table = (heads: string[], rows: StairRow[], widths: number[], title?: string) => {
    const lines = heads.map((h, i) => doc.splitTextToSize(h, widths[i] - 6) as string[]);
    const hh = Math.max(...lines.map((l) => l.length)) * 8.5 + 6;
    const span = widths.reduce((a, b) => a + b, 0);
    const head = () => {
      doc.setFillColor(NAVY);
      doc.rect(M, y, span, hh, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor("#ffffff");
      let x = M;
      lines.forEach((l, i) => {
        doc.text(l, x + widths[i] / 2, y + 9, { align: "center" });
        x += widths[i];
      });
      y += hh;
    };
    // a run's table starts with its title, and at least a few rows under it
    if (title) {
      const text = doc.splitTextToSize(plain(title), width) as string[];
      if (y + text.length * 10 + hh + 3 * rowH > H - M) {
        doc.addPage();
        y = M;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(INK);
      text.forEach((t, i) => doc.text(t, M, y + 7 + i * 10));
      y += text.length * 10 + 3;
    }
    head();
    doc.setFontSize(8.5);
    for (const row of rows) {
      if (y + rowH > H - M - 10) {
        doc.addPage();
        y = M;
        head();
        doc.setFontSize(8.5);
      }
      let x = M;
      row.cells.forEach((c, i) => {
        const fail = row.fails[i];
        const warn = !fail && !!row.warns?.[i];
        if (fail || warn) {
          doc.setFillColor(fail ? FAIL_FILL : WARN_FILL);
          doc.rect(x, y, widths[i], rowH, "F");
        }
        doc.setDrawColor(LINE);
        doc.rect(x, y, widths[i], rowH, "S");
        doc.setFont("helvetica", i === 0 || fail || warn ? "bold" : "normal");
        doc.setTextColor(fail ? FAIL_INK : warn ? WARN_INK : INK);
        doc.text(c, x + widths[i] / 2, y + 9.2, { align: "center" });
        x += widths[i];
      });
      y += rowH;
    }
    y += 10;
  };
  if (page.tables) {
    for (const t of page.tables) {
      // level, then the runs in equal columns (not stretched when there are only a few)
      const each = Math.min(90, (width - 60) / Math.max(1, t.head.length - 1));
      table(t.head, t.rows, [60, ...t.head.slice(1).map(() => each)], t.title);
    }
  } else table(page.head, page.rows, [0.12, 0.17, 0.25, 0.21, 0.25].map((f) => f * width));

  // fan checks, three-monthly ticks, site notes, notes
  const block = (label: string, lines: string[]) => {
    const text = lines.flatMap((l) => doc.splitTextToSize(plain(l), width) as string[]);
    if (y + 12 + text.length * 10 > H - M) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(INK);
    doc.text(label, M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    text.forEach((t, i) => doc.text(t, M, y + 11 + i * 10));
    y += 16 + Math.max(1, text.length) * 10;
  };
  if (page.runs?.length) block("Runs", page.runs);
  if (page.readings?.length) block("Other readings", page.readings);
  if (page.fanLabel) block(page.fanLabel, [page.fan || " "]);
  if (page.probe) block(page.probeLabel, page.probe);
  if (page.quick !== null) block("Three-monthly check (AS 1851-2012 Table 13.4.2.2)", [page.quick || " "]);
  if (page.siteNotes) block("Site notes", [page.siteNotes]);
  if (page.notes.length) block("Notes", page.notes);
}
