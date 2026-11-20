import type { jsPDF as JsPDF } from "jspdf";
import type { FfcpTest, FlowTest, Site, SpfSystem, StairTest } from "../db/types";
import { printResults } from "./flowPrint";
import { KIND_LABEL as FLOW_KIND } from "./flowTest";
import { KIND_LABEL as STAIR_KIND, stairLabel, stairTestSummary } from "./stairTest";
import { reportResults } from "./ffcp";
import { numericDate } from "./dates";
import { drawReportHeading, type HeadingLogo } from "./reportHeading";

// The contents page at the front of an Export Other Tests Only PDF (the
// "Export Other Tests Only: the PDF" design, option B): the shared heading
// ("Test results", the site, its address), a strip (site, exported, how many
// tests and pages), then a row per test: its name, date, tester, result in a
// few words (as the tests list and Result tiles say it) and its first page.

const PAGE = { w: 595.28, h: 841.89, m: 40 };
const M = PAGE.m;
const CW = PAGE.w - 2 * M;
const BOTTOM = PAGE.h - 46;
const INK = "#14212e";
const SOFT = "#4a6175";
const NAVY = "#0b3550";
const LINE = "#d5dee6";
const FAIL = "#b3261e";
const PASS = "#1b7a43";
const MEETS = "#1f6fb2";
const NONE = "#9aabb9";

export type Tone = "fail" | "pass" | "meets" | null;
export interface ContentsRow {
  title: string;
  sub: string;
  done: number;
  by: string;
  result: string;
  tone: Tone;
  resultSub: string;
  page: number;
}

export function flowRow(test: FlowTest, page: number): ContentsRow {
  const tiles = printResults(test);
  const bad = tiles.find((t) => t.tone === "fail" || t.tone === "below");
  const main = bad ?? tiles.find((t) => t.tone) ?? tiles[0];
  // "Town main below demand", "Electric pump PASS"
  const word = (t: (typeof tiles)[number]) => `${t.name.replace(" · reference", "")} ${t.value === t.value.toUpperCase() ? t.value : t.value.charAt(0).toLowerCase() + t.value.slice(1)}`;
  return {
    title: test.kind === "blank" ? `Flow test · ${test.name.trim() || "Blank sheet"}` : `Flow test · ${FLOW_KIND[test.kind]}`,
    sub: test.equipment?.trim() ?? "",
    done: test.testedAt,
    by: test.testedBy?.trim() ?? "",
    result: main ? word(main) : "",
    tone: !main?.tone ? null : main.tone === "below" ? "fail" : main.tone,
    resultSub: tiles.filter((t) => t !== main && t.tone).map(word).join(" · "),
    page,
  };
}

export function stairRow(test: StairTest, sys: SpfSystem, page: number): ContentsRow {
  const sum = stairTestSummary(test, sys);
  // "8 of 8 doors · 1 fail": the fails as the result, the doors under it
  const [doors, rest] = sum.text.includes(" · ") ? sum.text.split(" · ") : ["", sum.text];
  const n = sys.stairs.length;
  return {
    title: test.kind === "general" ? "Stair pressurisation · System testing" : `Stair pressurisation · ${STAIR_KIND[test.kind]}`,
    sub: `${n} stair${n === 1 ? "" : "s"}: ${sys.stairs.map((s, i) => stairLabel(s, i)).join(", ")}`,
    done: test.testedAt,
    by: test.testedBy?.trim() ?? "",
    result: rest === "all pass" ? "All pass" : rest.charAt(0).toUpperCase() + rest.slice(1),
    tone: sum.fail ? "fail" : rest === "all pass" || /passed/.test(rest) ? "pass" : null,
    resultSub: doors ? `${doors} read` : "",
    page,
  };
}

export function ffcpRow(test: FfcpTest, page: number): ContentsRow {
  const whole = reportResults(test)[2];
  return {
    title: "Fire fan control panel",
    sub: test.location?.trim() ?? "",
    done: test.testedAt,
    by: test.testedBy?.trim() ?? "",
    result: whole.value,
    tone: whole.tone,
    resultSub: whole.line,
    page,
  };
}

// the columns: #, test, tested, tested by, result, page
const COLS = { num: 18, done: 58, by: 80, result: 120, page: 30 };
const testW = CW - COLS.num - COLS.done - COLS.by - COLS.result - COLS.page;
const HEAD_TOP = 190; // the heading and strip, roughly, on the first page

function layout(doc: JsPDF, rows: ContentsRow[]) {
  return rows.map((r) => {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    const title = doc.splitTextToSize(r.title, testW - 10) as string[];
    const result = doc.splitTextToSize(r.result || "–", COLS.result - 10) as string[];
    doc.setFont("helvetica", "normal");
    const by = doc.splitTextToSize(r.by || "–", COLS.by - 10) as string[];
    doc.setFontSize(7.5);
    const sub = r.sub ? (doc.splitTextToSize(r.sub, testW - 10) as string[]) : [];
    const resultSub = r.resultSub ? (doc.splitTextToSize(r.resultSub, COLS.result - 10) as string[]) : [];
    const h = Math.max(title.length * 10.5 + sub.length * 9, result.length * 10.5 + resultSub.length * 9, by.length * 10.5) + 10;
    return { r, title, sub, by, result, resultSub, h };
  });
}

// how many pages the contents take (to leave room for them before the tests)
export function contentsPageCount(doc: JsPDF, rows: ContentsRow[]): number {
  let pages = 1;
  let y = M + HEAD_TOP;
  for (const l of layout(doc, rows)) {
    if (y + l.h > BOTTOM) {
      pages++;
      y = M + 22 + 18;
    }
    y += l.h;
  }
  return pages;
}

// draws the contents from page `from` (pages already there)
export function drawContents(doc: JsPDF, from: number, site: Pick<Site, "name" | "address">, rows: ContentsRow[], totalPages: number, logo: HeadingLogo) {
  doc.setPage(from);
  let y = drawReportHeading(doc, { title: "Test results", name: site.name.trim() || "Test results", note: site.address?.trim() || undefined }, logo);
  // the strip: site, exported, how many tests and pages
  const strip = [
    ["Site", site.name.trim()],
    ["Exported", numericDate(Date.now())],
    ["Tests", `${rows.length} test${rows.length === 1 ? "" : "s"}, ${totalPages} page${totalPages === 1 ? "" : "s"}`],
  ];
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.5);
  doc.line(M, y, M + CW, y);
  doc.setFontSize(8.5);
  strip.forEach(([label, value], i) => {
    const x = M + (i * CW) / 3;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY);
    doc.text(label, x, y + 12);
    const lw = doc.getTextWidth(label) + 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    doc.text((doc.splitTextToSize(value || "–", CW / 3 - lw - 8) as string[])[0] ?? "", x + lw, y + 12);
  });
  y += 18;
  doc.line(M, y, M + CW, y);
  y += 12;

  const title = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(NAVY);
    doc.text(text.toUpperCase(), M, y + 7, { charSpace: 0.6 });
    y += 13;
  };
  const head = () => {
    doc.setFillColor(NAVY);
    doc.rect(M, y, CW, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor("#ffffff");
    let x = M;
    doc.text("#", x + COLS.num / 2, y + 12, { align: "center" });
    x += COLS.num;
    doc.text("TEST", x + 6, y + 12);
    x += testW;
    doc.text("TESTED", x + 6, y + 12);
    x += COLS.done;
    doc.text("TESTED BY", x + 6, y + 12);
    x += COLS.by;
    doc.text("RESULT", x + 6, y + 12);
    doc.text("PAGE", M + CW - 6, y + 12, { align: "right" });
    y += 18;
  };
  title("In this report");
  head();
  layout(doc, rows).forEach((l, i) => {
    if (y + l.h > BOTTOM) {
      doc.setPage(doc.getCurrentPageInfo().pageNumber + 1);
      y = M;
      title("In this report (continued)");
      head();
    }
    const top = y + 12;
    let x = M;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(SOFT);
    doc.text(String(i + 1), x + COLS.num / 2, top, { align: "center" });
    x += COLS.num;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.text(l.title, x + 6, top);
    if (l.sub.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(SOFT);
      doc.text(l.sub, x + 6, top + l.title.length * 10.5 - 1);
    }
    x += testW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(INK);
    doc.text(numericDate(l.r.done), x + 6, top);
    x += COLS.done;
    doc.text(l.by, x + 6, top);
    x += COLS.by;
    doc.setFont("helvetica", l.r.tone ? "bold" : "normal");
    doc.setTextColor(l.r.tone === "fail" ? FAIL : l.r.tone === "pass" ? PASS : l.r.tone === "meets" ? MEETS : NONE);
    doc.text(l.result, x + 6, top);
    if (l.resultSub.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(SOFT);
      doc.text(l.resultSub, x + 6, top + l.result.length * 10.5 - 1);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(INK);
    doc.text(String(l.r.page), M + CW - 6, top, { align: "right" });
    y += l.h;
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.5);
    doc.line(M, y, M + CW, y);
  });
}
