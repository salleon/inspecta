import type { jsPDF as JsPDF } from "jspdf";
import type { FlowTest, Site } from "../db/types";
import logoUrl from "../assets/flow-logo.png?inline";
import { chartModel, flowFileName, PRINT_DEMAND, printDemand, printDetails, printSubtitle, printTables, printTitle } from "./flowPrint";

// The flow tests as a PDF (design canvas FlowExports): a full A4 page per
// test, laid out as in lib/flowPrint (the export preview draws the same).

const PAGE = { w: 595.28, h: 841.89, m: 40 };
const INK = "#1c2833";
const SOFT = "#55636f";
const BLUE = "#1f6fb2";

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function logoImage(): Promise<{ data: string; w: number; h: number }> {
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
    img.src = logoUrl;
  });
}

export async function buildFlowPdf(tests: FlowTest[], site: Pick<Site, "name" | "address">): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await logoImage().catch(() => null);
  tests.forEach((test, n) => {
    if (n) doc.addPage();
    drawPage(doc, test, site, logo, n + 1, tests.length);
  });
  return doc.output("blob");
}

// The same pages at the end of a site's report PDF (AFSS and projects):
// a page per flow test, numbered among the flow tests.
export async function appendFlowPages(doc: JsPDF, tests: FlowTest[], site: Pick<Site, "name" | "address">): Promise<void> {
  if (!tests.length) return;
  const logo = await logoImage().catch(() => null);
  tests.forEach((test, n) => {
    doc.addPage();
    drawPage(doc, test, site, logo, n + 1, tests.length, "Flow test");
  });
}

export const flowPdfName = (site: Pick<Site, "name">) => flowFileName(site, "pdf");

function drawPage(doc: JsPDF, test: FlowTest, site: Pick<Site, "name" | "address">, logo: { data: string; w: number; h: number } | null, page: number, pages: number, counter = "Page") {
  const { w: W, h: H, m: M } = PAGE;
  const width = W - 2 * M;
  let y = M + 6;
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(printTitle(test), M, y + 8);
  if (logo) {
    const lh = 26;
    const lw = (logo.w / logo.h) * lh;
    doc.addImage(logo.data, "PNG", W - M - lw, y - 8, lw, lh);
  }
  doc.setFillColor(BLUE);
  doc.rect(M, y + 15, 46, 2.5, "F");
  y += 28;
  const sub = printSubtitle(test);
  if (sub) {
    doc.setFontSize(10);
    doc.text(sub, M, y + 6);
    y += 14;
  }

  // site details, and the demand on the right
  doc.setFontSize(8.5);
  const details = printDetails(test, site);
  const demand = printDemand(test);
  details.forEach((d, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(d.label, M, y + 8 + i * 11);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(d.value || "–", width * 0.55)[0] ?? "", M + 62, y + 8 + i * 11);
  });
  if (demand.length) {
    doc.setFont("helvetica", "bold");
    doc.text("Demand", M + width * 0.68, y + 8);
    doc.setFont("helvetica", "normal");
    demand.forEach((d, i) => doc.text(d, M + width * 0.68 + 44, y + 8 + i * 11));
  }
  y += Math.max(details.length, demand.length) * 11 + 10;

  // the tables, smaller if there are a lot of readings so it fits the page
  const tables = printTables(test);
  const chartH = test.kind === "blank" ? 0 : 230;
  const comment = test.comment?.trim() ?? "";
  const commentLines = comment ? doc.splitTextToSize(`Comments: ${comment}`, width) : [];
  const room = H - M - 24 - y - chartH - commentLines.length * 11 - 20;
  const rowsNeeded = tables.reduce((n, t) => n + t.rows.length + 1, 0) + tables.length * 1.6;
  const rowH = Math.max(9, Math.min(14, room / Math.max(1, rowsNeeded)));
  const font = Math.min(8.5, rowH * 0.62);
  for (const t of tables) {
    if (t.name) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(INK);
      doc.text(t.name, M, y + rowH * 0.9);
      if (t.result) {
        const c = t.result === "PASS" ? "#127a3e" : "#c62828";
        doc.setDrawColor(c);
        doc.setTextColor(c);
        doc.setLineWidth(1);
        doc.setFontSize(8);
        doc.roundedRect(W - M - 40, y + rowH * 0.9 - 9, 40, 12, 2, 2, "S");
        doc.text(t.result, W - M - 20, y + rowH * 0.9, { align: "center" });
        doc.setTextColor(INK);
      }
      y += rowH * 1.3;
    }
    const cols = Math.max(1, t.head.length);
    const cw = width / cols;
    doc.setFontSize(font);
    doc.setLineWidth(0.5);
    doc.setDrawColor("#b8c6d2");
    doc.setFillColor("#e6eef5");
    doc.setFont("helvetica", "bold");
    // headings wrap onto two lines if they need to
    const heads = t.head.map((h) => (doc.splitTextToSize(h, cw - 4) as string[]).slice(0, 2));
    const headH = rowH * (heads.some((l) => l.length > 1) ? 1.7 : 1);
    doc.rect(M, y, width, headH, "FD");
    heads.forEach((lines, j) => lines.forEach((l, k) => doc.text(l, M + cw * (j + 0.5), y + headH / 2 + (k - (lines.length - 1) / 2) * font * 1.05 + font * 0.35, { align: "center" })));
    y += headH;
    doc.setFont("helvetica", "normal");
    doc.setDrawColor("#d3dbe2");
    for (const row of t.rows) {
      doc.rect(M, y, width, rowH, "S");
      row.forEach((v, j) => doc.text(v ?? "", M + cw * (j + 0.5), y + rowH * 0.68, { align: "center" }));
      y += rowH;
    }
    for (let j = 1; j < cols; j++) doc.line(M + cw * j, y - rowH * t.rows.length - headH, M + cw * j, y);
    y += 6;
  }

  if (chartH) {
    y += 6;
    drawChart(doc, test, M, y, width, chartH);
    y += chartH + 10;
  }
  if (commentLines.length) {
    doc.setFontSize(8.5);
    doc.setTextColor(INK);
    doc.setFont("helvetica", "normal");
    doc.text(commentLines, M, y + 8);
  }

  // footer
  doc.setDrawColor("#d3dbe2");
  doc.setLineWidth(0.5);
  doc.line(M, H - M + 8, W - M, H - M + 8);
  doc.setFontSize(7.5);
  doc.setTextColor(SOFT);
  doc.text(`${site.name} · Flow tests · ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`, M, H - M + 20);
  doc.text(`${counter} ${page} of ${pages}`, W - M, H - M + 20, { align: "right" });
}

function drawChart(doc: JsPDF, test: FlowTest, x0: number, y0: number, w: number, h: number) {
  const font = 7.5;
  const m = chartModel(test, w, h, font);
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
  for (const p of m.demand) doc.lines([[4, 4], [-4, 4], [-4, -4], [4, -4]], X(p.x), Y(p.y) - 4, [1, 1], "S", true);
  const g = m.legend;
  if (g.items.length) {
    doc.setDrawColor("#b8c6d2");
    doc.setLineWidth(0.6);
    doc.setFillColor("#ffffff");
    doc.roundedRect(X(g.x), Y(g.y), g.w, g.h, 2, 2, "FD");
    g.items.forEach((it, i) => {
      const y = Y(g.y) + 4 + (i + 0.5) * (font + 7);
      doc.setDrawColor(...hex(it.colour));
      if (it.diamond) {
        doc.setLineWidth(1);
        doc.lines([[3.5, 3.5], [-3.5, 3.5], [-3.5, -3.5], [3.5, -3.5]], X(g.x) + 12, y - 3.5, [1, 1], "S", true);
      } else {
        doc.setLineWidth(1.8);
        doc.setLineDashPattern(it.dash, 0);
        doc.line(X(g.x) + 5, y, X(g.x) + 19, y);
        doc.setLineDashPattern([], 0);
      }
      doc.setTextColor(INK);
      doc.text(it.label, X(g.x) + 24, y + font * 0.35);
    });
  }
}
