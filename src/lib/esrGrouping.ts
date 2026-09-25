import type { Finding } from "../db/types";
import { esrItem, esrOrder, esrSection, isSectionOnly } from "./esrCategories";
import { noteSimilarity } from "./esrSuggest";

// Report order for the PDF, Excel and export preview once findings have
// ESR categories: a heading per section (blue in Excel), one per item (grey)
// and the findings under it, in the spreadsheet's order, Uncategorised
// last. Within an item, findings with the same or near-same note sit
// together (keeping the order they were in otherwise), and each gets a Ref
// like "1.6.1", "1.6.2".
//
// A site with no categorised findings comes out exactly as before: the
// findings in list order, no headings, no Refs.

export type ReportRow<T> =
  | { kind: "section"; code: string; name: string }
  | { kind: "item"; code: string; name: string }
  | { kind: "uncategorised" }
  | { kind: "finding"; entry: T; ref?: string };

// notes at least this alike are put next to each other
const SIMILAR = 0.5;

// Stable: each finding pulls the later findings that resemble it up to
// just below itself.
function clusterSimilar<T extends { finding: Finding }>(entries: T[]): T[] {
  const out: T[] = [];
  const placed = new Set<number>();
  entries.forEach((e, i) => {
    if (placed.has(i)) return;
    placed.add(i);
    out.push(e);
    for (let j = i + 1; j < entries.length; j++) {
      if (placed.has(j)) continue;
      if (noteSimilarity(e.finding.note, entries[j].finding.note) >= SIMILAR) {
        placed.add(j);
        out.push(entries[j]);
      }
    }
  });
  return out;
}

export function reportRows<T extends { finding: Finding }>(entries: T[]): ReportRow<T>[] {
  const categorised = (e: T) => !!esrItem(e.finding.esrCategory);
  if (!entries.some(categorised)) return entries.map((entry) => ({ kind: "finding", entry }));

  const byCode = new Map<string, T[]>();
  const uncategorised: T[] = [];
  for (const e of entries) {
    if (categorised(e)) {
      const code = e.finding.esrCategory!;
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code)!.push(e);
    } else {
      uncategorised.push(e);
    }
  }

  const rows: ReportRow<T>[] = [];
  let lastSection: string | undefined;
  for (const code of [...byCode.keys()].sort((a, b) => esrOrder(a) - esrOrder(b))) {
    const section = esrSection(code)!;
    if (section.code !== lastSection) {
      rows.push({ kind: "section", code: section.code, name: section.name });
      lastSection = section.code;
    }
    // "12 Emergency evacuation procedures" has no items: its findings go
    // straight under the section heading
    if (!isSectionOnly(code)) rows.push({ kind: "item", code, name: esrItem(code)!.name });
    clusterSimilar(byCode.get(code)!).forEach((entry, n) => rows.push({ kind: "finding", entry, ref: `${code}.${n + 1}` }));
  }
  if (uncategorised.length) {
    rows.push({ kind: "uncategorised" });
    for (const entry of clusterSimilar(uncategorised)) rows.push({ kind: "finding", entry });
  }
  return rows;
}
