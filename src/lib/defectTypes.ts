import type { DefectType } from "../db/types";

// Defect type options, in picker order. Fills are Excel's standard Red,
// Gold, Green, Light Green and Light Blue, so the spreadsheet matches the
// app. `bg` / `text` are the bubble's fill and label colour; `rgb` copies
// are for jsPDF, which takes numeric channels. Gold, the greens and light
// blue use dark text since white isn't readable on them. "Note only" is a
// white bubble, so it gets an outline anywhere it sits on a white
// background (the PDF / export preview).
//
// "Rectified" and "Outstanding" are for a defect from a previous
// inspection (fixed since, or still there): AFSS sites only, offered under
// their own heading at the bottom of the picker. Outstanding's purple is the
// one the Excel already uses for a finding's old reference number, and in
// the Excel both are also written under the Ref (in `refText`).

interface DefectTypeStyle {
  value: DefectType;
  label: string;
  bg: string;
  text: string;
  bgRgb: [number, number, number];
  textRgb: [number, number, number];
  previousInspection?: boolean;
  refText?: string; // ARGB for the word under the Ref in the Excel
}

export const DEFECT_TYPES: DefectTypeStyle[] = [
  { value: "critical", label: "Critical", bg: "#ff0000", text: "#ffffff", bgRgb: [255, 0, 0], textRgb: [255, 255, 255] },
  { value: "non-critical", label: "Non-critical", bg: "#ffc000", text: "#2a1200", bgRgb: [255, 192, 0], textRgb: [42, 18, 0] },
  { value: "non-compliance", label: "Non-compliance", bg: "#00b050", text: "#03210f", bgRgb: [0, 176, 80], textRgb: [3, 33, 15] },
  { value: "recommend", label: "Recommend", bg: "#92d050", text: "#1a2e05", bgRgb: [146, 208, 80], textRgb: [26, 46, 5] },
  { value: "note-only", label: "Note only", bg: "#ffffff", text: "#000000", bgRgb: [255, 255, 255], textRgb: [0, 0, 0] },
  { value: "rectified", label: "Rectified", bg: "#00b0f0", text: "#022a3a", bgRgb: [0, 176, 240], textRgb: [2, 42, 58], previousInspection: true, refText: "FF0070C0" },
  { value: "outstanding", label: "Outstanding", bg: "#b1a0c7", text: "#2a1a40", bgRgb: [177, 160, 199], textRgb: [42, 26, 64], previousInspection: true, refText: "FF7030A0" },
];

export function defectTypeStyle(value: DefectType | undefined): DefectTypeStyle | undefined {
  return DEFECT_TYPES.find((t) => t.value === value);
}
