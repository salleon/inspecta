import type { jsPDF as JsPDF } from "jspdf";
import type { FlowTest, Site } from "../db/types";
import { reportLogoUrl } from "./branding";
import { KIND_LABEL as KIND_TITLE } from "./flowTest";
import { chartModel, PRINT_DEMAND, printResults, printStrip, printSubtitle, printTables, type PrintTable, type ResultTile, type Tone } from "./flowPrint";
import { numericDate } from "./dates";
import { drawReportHeading } from "./reportHeading";
import { listTestFindings } from "../db/db";
import { photoItems } from "./stairPhotos";

// The flow tests as a PDF (the "Flow test report layout" design, Option B):
// a page per test headed like the stair report ("Flow test · Sprinkler",
// the site's name under it), the details strip, a Result tile per supply
// (PASS / FAIL, or the town main's Meets / Below demand, with the kPa
// margin), a table per supply with only the columns filled in, the graph
// with its legend under it, the comments, then the test's defects as the
// site report's finding cards. Sections keep together; a test that runs on
// starts its next page with a thin header line. Every page ends with the
// footer (site, address, page number), unless a report around them draws it.

const PAGE = { w: 595.28, h: 841.89, m: 40 };
const W = PAGE.w;
const M = PAGE.m;
const CW = W - 2 * M;
const BOTTOM = PAGE.h - 46;
const INK = "#14212e";
const SOFT = "#4a6175";
const NAVY = "#0b3550";
const LINE = "#d5dee6";
const GAP = 12;
const TONE: Record<Tone, { ink: string; fill: string }> = {
  pass: { ink: "#1b7a43", fill: "#dff3e6" },
  fail: { ink: "#b3261e", fill: "#ffd9d4" },
  below: { ink: "#b3261e", fill: "#ffd9d4" },
  meets: { ink: "#1f6fb2", fill: "#dcecfb" },
};

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
type Logo = { data: string; w: number; h: number } | null;
type SiteInfo = Pick<Site, "name" | "address">;

export function logoImage(): Promise<{ data: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // shrunk to what the page needs, so the PDF stays small
    img.onload = () => {
      const h = 96;
      const w = Math.round((img.naturalWidth / img.naturalHeight) * h);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve({ data: c.toDataURL("image/png"), w, h });
    };
    img.onerror = reject;
    const url = reportLogoUrl();
    if (!url) return reject(new Error("no logo"));
    img.src = url;
  });
}

export async function buildFlowPdf(tests: FlowTest[], site: SiteInfo): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await logoImage().catch(() => null);
  for (const [n, test] of tests.entries()) {
    if (n) doc.addPage();
    await drawTest(doc, test, site, logo, true);
  }
  return doc.output("blob");
}

// The same pages at the end of a site's report PDF (AFSS and projects) or a
// tests-only export. onTest: each test's first page, for a report's list of
// what's in it; ownFooter false: the report around them draws the footers.
export async function appendFlowPages(doc: JsPDF, tests: FlowTest[], site: SiteInfo, onTest?: (test: FlowTest, page: number) => void, ownFooter = true): Promise<void> {
  if (!tests.length) return;
  const logo = await logoImage().catch(() => null);
  for (const test of tests) {
    doc.addPage();
    onTest?.(test, doc.getNumberOfPages());
    await drawTest(doc, test, site, logo, ownFooter);
  }
}

// the footer every page ends with: site and address, the page number
export function flowFooter(doc: JsPDF, site: SiteInfo, page: number) {
  doc.setPage(page);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.5);
  doc.line(M, PAGE.h - 32, M + CW, PAGE.h - 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(SOFT);
  doc.text([site.name, site.address].filter((x) => x?.trim()).join(" · "), M, PAGE.h - 22);
  doc.text(`Page ${page}`, M + CW, PAGE.h - 22, { align: "right" });
}

async function drawTest(doc: JsPDF, test: FlowTest, site: SiteInfo, logo: Logo, ownFooter: boolean) {
  const first = doc.getNumberOfPages();
  let y = heading(doc, test, site, logo);
  // a test that runs on: the next page, its thin header line first
  const newPage = () => {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(INK);
    doc.text(site.name, M, M + 6);
    const w = doc.getTextWidth(site.name);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(SOFT);
    doc.text(` · Flow tests · ${numericDate(test.testedAt)}`, M + w, M + 6);
    if (test.testedBy?.trim()) doc.text(test.testedBy.trim(), M + CW, M + 6, { align: "right" });
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.5);
    doc.line(M, M + 12, M + CW, M + 12);
    return M + 22;
  };
  const fit = (h: number) => {
    if (y + h > BOTTOM && y > M + 30) y = newPage();
  };

  y = strip(doc, printStrip(test, site), y) + GAP;
  const tiles = printResults(test);
  if (tiles.length) {
    const h = 13 + tileHeight(doc, tiles);
    fit(h);
    y = resultTiles(doc, tiles, y) + GAP;
  }
  for (const t of printTables(test)) {
    const h = tableHeight(doc, t);
    fit(Math.min(h, BOTTOM - M - 30));
    y = table(doc, t, y, () => (y = newPage())) + GAP;
  }
  if (test.kind !== "blank") {
    const chartH = 230;
    fit(13 + chartH);
    y = sectionTitle(doc, "Pressure against flow", y);
    drawChart(doc, test, M, y, CW, chartH);
    y += chartH + GAP;
  }
  const comment = test.comment?.trim();
  if (comment) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(comment, CW - 12) as string[];
    const h = lines.length * 10.5 + 10;
    fit(13 + h);
    y = sectionTitle(doc, "Comments", y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.5);
    doc.rect(M, y, CW, h, "S");
    doc.setTextColor(INK);
    doc.text(lines, M + 6, y + 13);
    y += h + GAP;
  }
  // the test's defects, straight on after it, numbered within the test
  const items = photoItems(await listTestFindings(test.siteId, test.id));
  if (items.length) {
    fit(13 + 60);
    y = sectionTitle(doc, "Defects found during testing", y);
    const { drawEntryCards } = await import("./siteReportPdf");
    y = await drawEntryCards(doc, items.map((i) => ({ finding: i.finding, photos: i.photos })), y, () => (y = newPage()));
  }
  if (ownFooter) for (let p = first; p <= doc.getNumberOfPages(); p++) flowFooter(doc, site, p);
  doc.setPage(doc.getNumberOfPages());
}

// "Flow test · Sprinkler", the rule, the site's name as big, its address (and the test's own name) under it (lib/reportHeading)
function heading(doc: JsPDF, test: FlowTest, site: SiteInfo, logo: Logo) {
  return drawReportHeading(doc, {
    title: test.kind === "blank" ? `Flow test · ${test.name.trim() || "Blank sheet"}` : `Flow test · ${KIND_TITLE[test.kind]}`,
    name: site.name.trim() || "Flow test",
    note: [site.address?.trim(), printSubtitle(test)].filter(Boolean).join(" · "),
  }, logo);
}

function sectionTitle(doc: JsPDF, text: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(NAVY);
  doc.text(text.toUpperCase(), M, y + 7, { charSpace: 0.6 });
  return y + 13;
}

// the details: an even strip, three to a row
function strip(doc: JsPDF, details: { label: string; value: string }[], y: number) {
  const colW = CW / 3;
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.5);
  doc.line(M, y, M + CW, y);
  for (let i = 0; i < details.length; i += 3) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const lines = details.slice(i, i + 3).map((d) => d.value.split("\n").flatMap((v) => doc.splitTextToSize(v || "–", colW - 66) as string[]));
    const h = Math.max(1, ...lines.map((l) => l.length)) * 10 + 8;
    details.slice(i, i + 3).forEach((d, j) => {
      const x = M + j * colW;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(NAVY);
      doc.text(d.label, x, y + 12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.text(lines[j].length ? lines[j] : ["–"], x + 60, y + 12);
    });
    y += h;
    doc.line(M, y, M + CW, y);
  }
  return y;
}

// the Result row: a tile per supply, three to a row
function tileLayout(doc: JsPDF, tiles: ResultTile[]) {
  const cols = Math.max(3, Math.min(4, tiles.length));
  const tw = (CW - (cols - 1) * 6) / cols;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const lines = tiles.map((t) => doc.splitTextToSize(t.line, tw - 12) as string[]);
  const h = Math.max(46, ...lines.map((l) => 32 + l.length * 7.5));
  return { cols, tw, lines, h, rows: Math.ceil(tiles.length / cols) };
}
const tileHeight = (doc: JsPDF, tiles: ResultTile[]) => {
  const l = tileLayout(doc, tiles);
  return l.rows * l.h + (l.rows - 1) * 6;
};
function resultTiles(doc: JsPDF, tiles: ResultTile[], y: number) {
  y = sectionTitle(doc, "Result", y);
  const { cols, tw, lines, h } = tileLayout(doc, tiles);
  tiles.forEach((t, i) => {
    const x = M + (i % cols) * (tw + 6);
    const ty = y + Math.floor(i / cols) * (h + 6);
    const tone = t.tone ? TONE[t.tone] : null;
    doc.setDrawColor(tone ? tone.ink : "#c9d6e0");
    doc.setLineWidth(tone ? 0.9 : 0.6);
    doc.roundedRect(x, ty, tw, h, 3, 3, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(SOFT);
    doc.text(t.name, x + 6, ty + 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(tone ? tone.ink : "#9aabb9");
    doc.text(`${t.value}${t.margin ? `  ${t.margin}` : ""}`, x + 6, ty + 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(SOFT);
    doc.text(lines[i], x + 6, ty + 35);
  });
  return y + tileHeight(doc, tiles);
}

// a supply's table: its name and badge, a navy heading row, its readings
const ROW_H = 15;
function headLines(doc: JsPDF, t: PrintTable) {
  const cw = CW / Math.max(1, t.head.length);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const lines = t.head.map((h) => doc.splitTextToSize(h, cw - 6) as string[]);
  return { cw, lines, hh: Math.max(22, Math.max(...lines.map((l) => l.length)) * 8.5 + 6) };
}
const tableHeight = (doc: JsPDF, t: PrintTable) => (t.name ? 13 : 0) + headLines(doc, t).hh + t.rows.length * ROW_H;
function table(doc: JsPDF, t: PrintTable, y: number, newPage: () => number) {
  const { cw, lines, hh } = headLines(doc, t);
  if (t.name) {
    sectionTitle(doc, t.name, y);
    if (t.badge) {
      const tone = TONE[t.badge.tone];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      const bw = doc.getTextWidth(t.badge.text) + 12;
      doc.setFillColor(tone.fill);
      doc.roundedRect(M + CW - bw, y - 1, bw, 11, 2, 2, "F");
      doc.setTextColor(tone.ink);
      doc.text(t.badge.text, M + CW - bw / 2, y + 6.8, { align: "center" });
    }
    y += 13;
  }
  const head = () => {
    doc.setFillColor(NAVY);
    doc.rect(M, y, CW, hh, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor("#ffffff");
    lines.forEach((l, j) => {
      const top = y + (hh - l.length * 8.5) / 2 + 6.5;
      l.forEach((line, k) => doc.text(line, M + cw * (j + 0.5), top + k * 8.5, { align: "center" }));
    });
    y += hh;
  };
  head();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const row of t.rows) {
    if (y + ROW_H > BOTTOM) {
      y = newPage();
      head();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.5);
    row.forEach((v, j) => {
      doc.rect(M + cw * j, y, cw, ROW_H, "S");
      doc.setTextColor(INK);
      doc.text(v ?? "", M + cw * (j + 0.5), y + 10, { align: "center" });
    });
    y += ROW_H;
  }
  return y;
}

function drawChart(doc: JsPDF, test: FlowTest, x0: number, y0: number, w: number, h: number) {
  const font = 7.5;
  // the legend in one line under the graph
  const m = chartModel(test, w, h, font, true);
  const X = (x: number) => x0 + x;
  const Y = (y: number) => y0 + y;
  doc.setLineWidth(0.4);
  doc.setDrawColor("#e3e8ec");
  for (const g of m.grid) doc.line(X(g.x1), Y(g.y1), X(g.x2), Y(g.y2));
  doc.setDrawColor("#9aa6b1");
  doc.setLineWidth(0.6);
  doc.rect(X(m.plot.x), Y(m.plot.y), m.plot.w, m.plot.h, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(font);
  doc.setTextColor(SOFT);
  for (const k of m.ticks) doc.text(k.text, X(k.x), Y(k.y), { align: k.anchor === "end" ? "right" : "center" });
  doc.setTextColor("#3a4753");
  doc.text(m.xLabel.text, X(m.xLabel.x), Y(m.xLabel.y), { align: "center" });
  doc.text(m.yLabel.text, X(m.yLabel.x) + 3, Y(m.yLabel.y), { align: "center", angle: 90 });
  for (const l of m.lines) {
    doc.setDrawColor(...hex(l.colour));
    doc.setFillColor(...hex(l.colour));
    doc.setLineWidth(l.width);
    doc.setLineDashPattern(l.dash, 0);
    for (let i = 1; i < l.pts.length; i++) doc.line(X(l.pts[i - 1].x), Y(l.pts[i - 1].y), X(l.pts[i].x), Y(l.pts[i].y));
    doc.setLineDashPattern([], 0);
    if (l.dots) for (const p of l.pts) doc.circle(X(p.x), Y(p.y), 1.8, "F");
  }
  doc.setDrawColor(...hex(PRINT_DEMAND));
  doc.setLineWidth(1.1);
  // a combined system's pump duty is filled, as in the app
  doc.setFillColor(...hex(PRINT_DEMAND));
  for (const p of m.demand) doc.lines([[4, 4], [-4, 4], [-4, -4], [4, -4]], X(p.x), Y(p.y) - 4, [1, 1], p.filled ? "FD" : "S", true);
  const g = m.legend;
  g.items.forEach((it) => {
    const x = X(it.x ?? 0);
    const y = Y(g.y) + g.h / 2;
    doc.setDrawColor(...hex(it.colour));
    if (it.diamond) {
      doc.setLineWidth(1);
      doc.lines([[3.5, 3.5], [-3.5, 3.5], [-3.5, -3.5], [3.5, -3.5]], x + 10, y - 3.5, [1, 1], "S", true);
    } else {
      doc.setLineWidth(1.8);
      doc.setLineDashPattern(it.dash, 0);
      doc.line(x + 2, y, x + 18, y);
      doc.setLineDashPattern([], 0);
    }
    doc.setTextColor(INK);
    doc.text(it.label, x + 22, y + font * 0.35);
  });
}
