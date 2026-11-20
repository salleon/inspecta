import type { jsPDF } from "jspdf";

// The heading every report page starts with (stair, flow test, FFCP, and
// the AFSS / Project summary): the title, a short blue rule, a name as big
// as the title (the stair, the site), and a small grey line under it; the
// logo on the right. The title and the name shrink to stay clear of a wide
// logo. One drawing for them all, so they can't drift apart.

export type HeadingLogo = { data: string; w: number; h: number } | null;

const W = 595.28;
const M = 40;
const INK = "#14212e";
const SOFT = "#4a6175";

// draws it; returns where the page goes on from
export function drawReportHeading(doc: jsPDF, h: { title: string; name: string; note?: string }, logo: HeadingLogo): number {
  const y = M + 6;
  // big enough to read at a glance; a wide company logo: 240 pt across at most
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
  big(h.title, y + 10);
  if (logo) doc.addImage(logo.data, "PNG", W - M - lw, y - 22, lw, lh);
  doc.setFillColor("#1f6fb2");
  doc.rect(M, y + 17, 46, 2.5, "F");
  big(h.name, y + 42);
  const note = h.note?.trim();
  if (note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(SOFT);
    doc.text(note, M, y + 54);
  }
  return y + (note ? 66 : 56);
}
