import type { jsPDF as JsPDF } from "jspdf";
import type { FfcpTest, Site } from "../db/types";
import { CONTROL, FAN_CHECKS, HEADS, INDICATION, modesTested, reportNotes, reportSummary } from "./ffcp";
import { FAIL_FILL, FAIL_INK, INK, LINE, NAVY, PAGE, SOFT, heading, type Logo } from "./stairPdf";
import { shortDate } from "./dates";

// FFCP tests in the PDF (design canvas: FFCP results table, option B): a
// page per panel test, headed like the stair pages, with a small table per
// mode tested (a mode with nothing ticked is left out): fan name, then the
// indication lights and manual control, ✓ or ✗ (drawn: the PDF's font has
// neither), fails shaded. The fail notes and fan notes follow.

const PASS_INK = "#127a3e";
const GROUP = "#16486b";



// onTest: each test's first page, for a report's list of what's in it
export function appendFfcpPages(doc: JsPDF, tests: FfcpTest[], site: Pick<Site, "name" | "address">, first: boolean, logo: Logo, onTest?: (test: FfcpTest, page: number) => void) {
  let fresh = first;
  for (const test of tests) {
    if (!fresh) doc.addPage();
    fresh = false;
    onTest?.(test, doc.getNumberOfPages());
    drawTest(doc, test, site, logo);
  }
}

function drawTest(doc: JsPDF, test: FfcpTest, site: Pick<Site, "name" | "address">, logo: Logo) {
  const { w: W, h: H, m: M } = PAGE;
  const width = W - 2 * M;
  let y = heading(doc, "Fire fan control panel", "Test results", logo);

  // details, two columns (as the stair pages)
  const details = [
    { label: "Site", value: [site.name, site.address].filter(Boolean).join(", ") },
    { label: "Date", value: shortDate(test.testedAt) },
    { label: "Panel", value: test.location },
    { label: "Tested by", value: test.testedBy ?? "" },
  ];
  doc.setFontSize(8.5);
  details.forEach((d, i) => {
    const x = M + (i % 2) * (width / 2);
    const yy = y + Math.floor(i / 2) * 12;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY);
    doc.text(d.label, x, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    doc.text((doc.splitTextToSize(d.value || "–", width / 2 - 60) as string[])[0] ?? "", x + 52, yy);
  });
  y += 2 * 12 + 8;

  const nameW = 135;
  const colW = (width - nameW) / FAN_CHECKS.length;
  const rowH = 15;
  const groupH = 12;
  const headH = 13;

  const head = () => {
    // INDICATION | MANUAL CONTROL over the checks, FAN NAME down both rows
    doc.setFillColor(NAVY);
    doc.rect(M, y, width, groupH + headH, "F");
    doc.setFillColor(GROUP);
    doc.rect(M + nameW, y, width - nameW, groupH, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#ffffff");
    doc.setFontSize(7.5);
    doc.text("FAN NAME", M + 6, y + (groupH + headH) / 2 + 2.6);
    doc.setFontSize(7);
    doc.text("INDICATION", M + nameW + (INDICATION.length * colW) / 2, y + 8.3, { align: "center" });
    doc.text("MANUAL CONTROL", M + nameW + INDICATION.length * colW + (CONTROL.length * colW) / 2, y + 8.3, { align: "center" });
    doc.setFontSize(7.5);
    HEADS.forEach((label, i) => doc.text(label, M + nameW + (i + 0.5) * colW, y + groupH + 9, { align: "center" }));
    // the line between indication and manual control
    doc.setDrawColor("#9fb3c3");
    doc.setLineWidth(1.2);
    const xs = M + nameW + INDICATION.length * colW;
    doc.line(xs, y, xs, y + groupH + headH);
    doc.setLineWidth(0.5);
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

  for (const mode of modesTested(test)) {
    if (y + 12 + groupH + headH + 3 * rowH > H - M) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(NAVY);
    doc.text(mode === "normal" ? "Normal mode" : "Fire mode", M, y + 8);
    y += 13;
    head();
    test.fans.forEach((fan, r) => {
      if (y + rowH > H - M - 10) {
        doc.addPage();
        y = M;
        head();
      }
      if (r % 2) {
        doc.setFillColor("#f6f9fb");
        doc.rect(M, y, width, rowH, "F");
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
        else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor("#a9b8c5");
          doc.text("–", cx, y + 10, { align: "center" });
        }
      });
      doc.setDrawColor("#9fb3c3");
      doc.setLineWidth(1.2);
      const xs = M + nameW + INDICATION.length * colW;
      doc.line(xs, y, xs, y + rowH);
      doc.setLineWidth(0.5);
      y += rowH;
    });
    y += 14;
  }

  // the notes: each fail's why, then each fan's own note
  const notes = reportNotes(test);
  if (notes.length) {
    if (y + 30 > H - M) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(NAVY);
    doc.text("Notes", M, y + 6);
    doc.setDrawColor(NAVY);
    doc.setLineWidth(0.8);
    doc.line(M, y + 8.5, M + doc.getTextWidth("Notes"), y + 8.5);
    doc.setLineWidth(0.5);
    y += 20;
    doc.setFontSize(8.5);
    for (const n of notes) {
      doc.setFont("helvetica", "bold");
      const hw = doc.getTextWidth(n.head) + 8;
      const lines = doc.splitTextToSize(n.text, width - hw) as string[];
      if (y + lines.length * 11 > H - M) {
        doc.addPage();
        y = M;
      }
      doc.setTextColor(n.fail ? FAIL_INK : INK);
      doc.text(n.head, M, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      lines.forEach((l, i) => doc.text(l, M + hw, y + i * 11));
      y += lines.length * 11 + 3;
    }
  }

  // the summary line
  const sum = reportSummary(test);
  y += 8;
  if (y > H - M) {
    doc.addPage();
    y = M + 6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(sum.fails ? FAIL_INK : SOFT);
  doc.text(sum.text, M, y);
}
