import type { jsPDF as JsPDF } from "jspdf";
import type { FfcpTest, Site } from "../db/types";
import { CONTROL, FAN_CHECKS, HEADS, INDICATION, modesTested, reportNoteRows, reportResults, type FfcpTile } from "./ffcp";
import { FAIL_FILL, FAIL_INK, INK, LINE, NAVY, PAGE, SOFT, type Logo } from "./stairPdf";
import { numericDate } from "./dates";
import { drawReportHeading } from "./reportHeading";
import { flowFooter } from "./flowPdf";

// FFCP tests in the PDF (the "FFCP report layout" design): the shared heading,
// the details in one row, a Result row (each mode, then the whole test), a
// table per mode tested (a mode with nothing ticked is left out): fan name,
// then the indication lights and manual control, ✓ or ✗ (drawn: the PDF's
// font has neither), fails shaded, not checked a grey dash. Then one notes
// table: each fail's reason (a fail with none is left out) and each fan's note.

const PASS_INK = "#127a3e";
const GROUP = "#16486b";
const { w: W, h: H, m: M } = PAGE;
const CW = W - 2 * M;
const BOTTOM = H - 46;
const GAP = 12;

type SiteInfo = Pick<Site, "name" | "address">;

// onTest: each test's first page, for a report's list of what's in it;
// ownFooter false: the report around them draws the footers
export function appendFfcpPages(doc: JsPDF, tests: FfcpTest[], site: SiteInfo, first: boolean, logo: Logo, onTest?: (test: FfcpTest, page: number) => void, ownFooter = true) {
  let fresh = first;
  for (const test of tests) {
    if (!fresh) doc.addPage();
    fresh = false;
    const from = doc.getNumberOfPages();
    onTest?.(test, from);
    drawTest(doc, test, site, logo);
    if (ownFooter) for (let p = from; p <= doc.getNumberOfPages(); p++) flowFooter(doc, site, p);
    doc.setPage(doc.getNumberOfPages());
  }
}

function sectionTitle(doc: JsPDF, text: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(NAVY);
  doc.text(text.toUpperCase(), M, y + 7, { charSpace: 0.6 });
  return y + 13;
}

function drawTest(doc: JsPDF, test: FfcpTest, site: SiteInfo, logo: Logo) {
  let y = drawReportHeading(doc, {
    title: "Fire fan control panel",
    name: site.name.trim() || "Fire fan control panel",
    note: [site.address?.trim(), test.location?.trim()].filter(Boolean).join(" · "),
  }, logo);

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
    doc.text(` · FFCP · ${numericDate(test.testedAt)}`, M + w, M + 6);
    if (test.testedBy?.trim()) doc.text(test.testedBy.trim(), M + CW, M + 6, { align: "right" });
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.5);
    doc.line(M, M + 12, M + CW, M + 12);
    return M + 22;
  };
  const fit = (h: number) => {
    if (y + h > BOTTOM && y > M + 30) y = newPage();
  };

  y = strip(doc, [
    { label: "Site", value: site.name },
    { label: "Date", value: numericDate(test.testedAt) },
    { label: "Panel", value: test.location ?? "" },
    { label: "Tested by", value: test.testedBy ?? "" },
  ], y) + GAP;

  y = resultTiles(doc, reportResults(test), y) + GAP;

  const nameW = 135;
  const colW = (CW - nameW) / FAN_CHECKS.length;
  const rowH = 15;
  const groupH = 12;
  const headH = 13;
  const divider = (top: number, h: number) => {
    doc.setDrawColor("#9fb3c3");
    doc.setLineWidth(1.2);
    const xs = M + nameW + INDICATION.length * colW;
    doc.line(xs, top, xs, top + h);
    doc.setLineWidth(0.5);
  };
  const head = () => {
    // INDICATION | MANUAL CONTROL over the checks, FAN NAME down both rows
    doc.setFillColor(NAVY);
    doc.rect(M, y, CW, groupH + headH, "F");
    doc.setFillColor(GROUP);
    doc.rect(M + nameW, y, CW - nameW, groupH, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#ffffff");
    doc.setFontSize(7.5);
    doc.text("FAN NAME", M + 6, y + (groupH + headH) / 2 + 2.6);
    doc.setFontSize(7);
    doc.text("INDICATION", M + nameW + (INDICATION.length * colW) / 2, y + 8.3, { align: "center" });
    doc.text("MANUAL CONTROL", M + nameW + INDICATION.length * colW + (CONTROL.length * colW) / 2, y + 8.3, { align: "center" });
    doc.setFontSize(7.5);
    HEADS.forEach((label, i) => doc.text(label, M + nameW + (i + 0.5) * colW, y + groupH + 9, { align: "center" }));
    divider(y, groupH + headH);
    y += groupH + headH;
  };
  const tick = (cx: number, cy: number) => {
    doc.setDrawColor(PASS_INK);
    doc.setLineWidth(1.4);
    doc.lines([[2.4, 2.6], [4.6, -6]], cx - 3.6, cy + 0.2);
    doc.setLineWidth(0.5);
  };
  const cross = (cx: number, cy: number) => {
    doc.setDrawColor(FAIL_INK);
    doc.setLineWidth(1.4);
    doc.line(cx - 3, cy - 3, cx + 3, cy + 3);
    doc.line(cx - 3, cy + 3, cx + 3, cy - 3);
    doc.setLineWidth(0.5);
  };
  const dash = (cx: number, cy: number) => {
    doc.setDrawColor("#a9b8c5");
    doc.setLineWidth(1);
    doc.line(cx - 3, cy, cx + 3, cy);
    doc.setLineWidth(0.5);
  };

  for (const mode of modesTested(test)) {
    // a short table stays whole; a long one starts with room for its first rows
    fit(13 + groupH + headH + Math.min(test.fans.length, 3) * rowH);
    if (13 + groupH + headH + test.fans.length * rowH <= BOTTOM - M - 30) fit(13 + groupH + headH + test.fans.length * rowH);
    y = sectionTitle(doc, mode === "normal" ? "Normal mode" : "Fire mode", y);
    head();
    test.fans.forEach((fan, r) => {
      if (y + rowH > BOTTOM) {
        y = newPage();
        y = sectionTitle(doc, `${mode === "normal" ? "Normal mode" : "Fire mode"} (continued)`, y);
        head();
      }
      if (r % 2) {
        doc.setFillColor("#f6f9fb");
        doc.rect(M, y, CW, rowH, "F");
      }
      doc.setDrawColor(LINE);
      doc.rect(M, y, nameW, rowH, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(INK);
      doc.text((doc.splitTextToSize(fan.name, nameW - 10) as string[])[0] ?? "", M + 6, y + 10);
      FAN_CHECKS.forEach(([k], i) => {
        const x = M + nameW + i * colW;
        const m = fan.marks[`${mode}.${k}`];
        if (m === "n") {
          doc.setFillColor(FAIL_FILL);
          doc.rect(x, y, colW, rowH, "F");
        }
        doc.setDrawColor(LINE);
        doc.rect(x, y, colW, rowH, "S");
        const cx = x + colW / 2;
        const cy = y + rowH / 2;
        if (m === "y") tick(cx, cy);
        else if (m === "n") cross(cx, cy);
        else dash(cx, cy);
      });
      divider(y, rowH);
      y += rowH;
    });
    y += GAP;
  }

  // the notes: one table, each fail's reason, then each fan's own note
  const rows = reportNoteRows(test);
  if (rows.length) {
    const numW = 22;
    const fanW = 110;
    const checkW = 130;
    const noteW = CW - numW - fanW - checkW;
    const headRow = () => {
      doc.setFillColor(NAVY);
      doc.rect(M, y, CW, 15, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor("#ffffff");
      doc.text("#", M + numW / 2, y + 10, { align: "center" });
      doc.text("FAN", M + numW + 6, y + 10);
      doc.text("CHECK", M + numW + fanW + 6, y + 10);
      doc.text("NOTE", M + numW + fanW + checkW + 6, y + 10);
      y += 15;
    };
    doc.setFontSize(8.5);
    const laid = rows.map((r) => {
      doc.setFont("helvetica", "bold");
      const fan = doc.splitTextToSize(r.fan, fanW - 12) as string[];
      const check = doc.splitTextToSize(r.check, checkW - 12) as string[];
      doc.setFont("helvetica", "normal");
      const note = doc.splitTextToSize(r.text, noteW - 12) as string[];
      return { ...r, fan, checkLines: check, note, h: Math.max(fan.length, check.length, note.length) * 10.5 + 6 };
    });
    fit(13 + 15 + laid.slice(0, 2).reduce((s, r) => s + r.h, 0));
    y = sectionTitle(doc, "Notes", y);
    headRow();
    laid.forEach((r, i) => {
      if (y + r.h > BOTTOM) {
        y = newPage();
        y = sectionTitle(doc, "Notes (continued)", y);
        headRow();
      }
      if (i % 2) {
        doc.setFillColor("#f6f9fb");
        doc.rect(M, y, CW, r.h, "F");
      }
      doc.setDrawColor(LINE);
      doc.setLineWidth(0.5);
      doc.line(M, y + r.h, M + CW, y + r.h);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(SOFT);
      doc.text(String(i + 1), M + numW / 2, y + 10, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.text(r.fan, M + numW + 6, y + 10);
      doc.setTextColor(r.fail ? FAIL_INK : SOFT);
      doc.text(r.checkLines, M + numW + fanW + 6, y + 10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.text(r.note, M + numW + fanW + checkW + 6, y + 10);
      y += r.h;
    });
  }
}

// the details: an even strip, all four in one row
function strip(doc: JsPDF, details: { label: string; value: string }[], y: number) {
  const colW = CW / details.length;
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.5);
  doc.line(M, y, M + CW, y);
  doc.setFontSize(8.5);
  const lines = details.map((d) => {
    doc.setFont("helvetica", "bold");
    const lw = doc.getTextWidth(d.label) + 6;
    doc.setFont("helvetica", "normal");
    return { lw, l: doc.splitTextToSize(d.value.trim() || "–", colW - lw - 8) as string[] };
  });
  const h = Math.max(1, ...lines.map((l) => l.l.length)) * 10 + 8;
  details.forEach((d, j) => {
    const x = M + j * colW;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY);
    doc.text(d.label, x, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    doc.text(lines[j].l, x + lines[j].lw, y + 12);
  });
  y += h;
  doc.line(M, y, M + CW, y);
  return y;
}

// the Result row: each mode, then the whole test
function resultTiles(doc: JsPDF, tiles: FfcpTile[], y: number) {
  y = sectionTitle(doc, "Result", y);
  const tw = (CW - (tiles.length - 1) * 6) / tiles.length;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const lines = tiles.map((t) => doc.splitTextToSize(t.line, tw - 12) as string[]);
  const h = Math.max(46, ...lines.map((l) => 32 + l.length * 7.5));
  tiles.forEach((t, i) => {
    const x = M + i * (tw + 6);
    const ink = t.tone === "fail" ? FAIL_INK : t.tone === "pass" ? PASS_INK : null;
    doc.setDrawColor(ink ?? "#c9d6e0");
    doc.setLineWidth(ink ? 0.9 : 0.6);
    doc.roundedRect(x, y, tw, h, 3, 3, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(SOFT);
    doc.text(t.name, x + 6, y + 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(ink ?? "#9aabb9");
    doc.text(t.value, x + 6, y + 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(SOFT);
    doc.text(lines[i], x + 6, y + 35);
  });
  return y + h;
}
