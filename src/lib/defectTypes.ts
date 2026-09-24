import type { DefectType } from "../db/types";

// Defect type options, in picker order. `bg`/`text` are the bubble's fill
// and label colour; `rgb` copies are for jsPDF, which takes numeric
// channels. Orange/green/lime use dark text since white isn't readable on
// them. "Note only" is a white bubble, so it gets an outline anywhere it
// sits on a white background (the PDF / export preview).

export interface DefectTypeStyle {
  value: DefectType;
  label: string;
  bg: string;
  text: string;
  bgRgb: [number, number, number];
  textRgb: [number, number, number];
}

export const DEFECT_TYPES: DefectTypeStyle[] = [
  { value: "critical", label: "Critical", bg: "#dc2626", text: "#ffffff", bgRgb: [220, 38, 38], textRgb: [255, 255, 255] },
  { value: "non-critical", label: "Non-critical", bg: "#f97316", text: "#2a1200", bgRgb: [249, 115, 22], textRgb: [42, 18, 0] },
  { value: "non-compliance", label: "Non-compliance", bg: "#22c55e", text: "#03210f", bgRgb: [34, 197, 94], textRgb: [3, 33, 15] },
  { value: "recommend", label: "Recommend", bg: "#a3e635", text: "#1a2e05", bgRgb: [163, 230, 53], textRgb: [26, 46, 5] },
  { value: "note-only", label: "Note only", bg: "#ffffff", text: "#000000", bgRgb: [255, 255, 255], textRgb: [0, 0, 0] },
];

export function defectTypeStyle(value: DefectType | undefined): DefectTypeStyle | undefined {
  return DEFECT_TYPES.find((t) => t.value === value);
}
