import type { jsPDF as JsPDF } from "jspdf";
import type { Site, SpfSystem, StairTest } from "../db/types";
import { logoImage } from "./flowPdf";
import { stairPages, type StairPage } from "./stairPrint";

// Stair tests in the PDF (design canvas StairTestSimple, "The report"): a
// page per stair, laid out as lib/stairPrint (the preview draws the same).
// A tall stair runs on to more pages, the table's heading repeated.

const PAGE = { w: 595.28, h: 841.89, m: 40 };
const INK = "#14212e";
const SOFT = "#4a6175";
const NAVY = "#0b3550";
const LINE = "#d5dee6";
const FAIL_FILL = "#ffd9d4";
const FAIL_INK = "#b3261e";

// the PDF's own font has no ✓ / ✗
const plain = (s: string) => s.replace(/ ✓/g, " OK").replace(/ ✗/g, " FAIL").replace(/✓/g, "OK").replace(/✗/g, "FAIL");

type Logo = { data: string; w: number; h: number } | null;

export async function appendStairPages(doc: JsPDF, tests: StairTest[], sys: SpfSystem, site: Pick<Site, "name" | "address">, first: boolean): Promise<void> {
  const logo = await logoImage().catch(() => null);
  let fresh = first;
  for (const test of tests) {
    for (const page of stairPages(test, sys, site)) {
      if (!fresh) doc.addPage();
      fresh = false;
      drawPage(doc, page, logo);
    }
  }
}

export async function buildStairPdf(tests: StairTest[], sys: SpfSystem, site: Pick<Site, "name" | "address">): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  await appendStairPages(doc, tests, sys, site, true);
  return doc.output("blob");
}

function drawPage(doc: JsPDF, page: StairPage, logo: Logo) {
  const { w: W, h: H, m: M } = PAGE;
  const width = W - 2 * M;
  let y = M + 6;
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(page.title, M, y + 8);
  if (logo) {
    const lh = 26;
    doc.addImage(logo.data, "PNG", W - M - (logo.w / logo.h) * lh, y - 8, (logo.w / logo.h) * lh, lh);
  }
  doc.setFillColor("#1f6fb2");
  doc.rect(M, y + 15, 46, 2.5, "F");
  y += 30;
  doc.setFontSize(11);
  doc.text(page.subtitle, M, y + 4);
  y += 16;

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
  const gap = 6;
  const bw = (width - 3 * gap) / 4;
  const bh = 36;
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
      doc.text(b.ref, x + 5, y + 32);
    }
  });
  y += bh + 10;

  // the table
  const widths = [0.12, 0.17, 0.25, 0.21, 0.25].map((f) => f * width);
  const rowH = 13;
  const head = () => {
    const lines = page.head.map((h, i) => doc.splitTextToSize(h, widths[i] - 6) as string[]);
    const hh = Math.max(...lines.map((l) => l.length)) * 8.5 + 6;
    doc.setFillColor(NAVY);
    doc.rect(M, y, width, hh, "F");
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
  head();
  doc.setFontSize(8.5);
  for (const row of page.rows) {
    if (y + rowH > H - M - 10) {
      doc.addPage();
      y = M;
      head();
      doc.setFontSize(8.5);
    }
    let x = M;
    row.cells.forEach((c, i) => {
      if (row.fails[i]) {
        doc.setFillColor(FAIL_FILL);
        doc.rect(x, y, widths[i], rowH, "F");
      }
      doc.setDrawColor(LINE);
      doc.rect(x, y, widths[i], rowH, "S");
      doc.setFont("helvetica", i === 0 || row.fails[i] ? "bold" : "normal");
      doc.setTextColor(row.fails[i] ? FAIL_INK : INK);
      doc.text(c, x + widths[i] / 2, y + 9.2, { align: "center" });
      x += widths[i];
    });
    y += rowH;
  }
  y += 10;

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
  block(page.fanLabel, [page.fan || " "]);
  if (page.quick !== null) block("Three-monthly check (AS 1851-2012 Table 13.4.2.2)", [page.quick || " "]);
  if (page.siteNotes) block("Site notes", [page.siteNotes]);
  if (page.notes.length) block("Notes", page.notes);
}
