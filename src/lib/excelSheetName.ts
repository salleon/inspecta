import type { Workbook } from "exceljs";

// a sheet name Excel accepts (no [ ] : * ? / \, 31 characters at most) and
// not already taken in the workbook (any case): "Name (2)", "Name (3)"…
export function sheetName(wb: Workbook, base: string, fallback: string): string {
  const clean = base.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || fallback;
  let name = clean;
  for (let n = 2; wb.worksheets.some((w) => w.name.toLowerCase() === name.toLowerCase()); n++) name = `${clean.slice(0, 26)} (${n})`;
  return name;
}
