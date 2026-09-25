import type { Finding } from "../db/types";
import { esrGroup, esrItem, esrOrder, esrSection, isSectionOnly, noteReference } from "./esrCategories";
import { noteSimilarity } from "./esrSuggest";

// Report order for the PDF, Excel and export preview once findings have
// ESR categories: a heading per section (blue in Excel), one per item (grey)
// — with a yellow one above items that sit inside another (6.3 over
// 6.3.1–6.3.4) — and the findings under it, in the spreadsheet's order,
// Uncategorised last. Within an item, findings with the same or near-same note sit
// together (keeping the order they were in otherwise), and each gets a Ref
// like "1.6.1", "1.6.2".
//
// A site with no categorised findings comes out exactly as before: the
// findings in list order, no headings, no Refs.

export type ReportRow<T> =
  | { kind: "section"; code: string; name: string }
  | { kind: "group"; code: string; name: string }
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
  let lastGroup: string | undefined;
  for (const code of [...byCode.keys()].sort((a, b) => esrOrder(a) - esrOrder(b))) {
    const section = esrSection(code)!;
    if (section.code !== lastSection) {
      rows.push({ kind: "section", code: section.code, name: section.name });
      lastSection = section.code;
      lastGroup = undefined;
    }
    const group = esrGroup(code);
    if (group && group.code !== lastGroup) {
      rows.push({ kind: "group", code: group.code, name: group.name });
      lastGroup = group.code;
    }
    // "12 Emergency evacuation procedures" has no items, and findings
    // tagged "6.3" itself belong to its yellow row: either way they go
    // straight under the heading already shown
    if (!isSectionOnly(code) && code !== group?.code) rows.push({ kind: "item", code, name: esrItem(code)!.name });
    // Findings carrying their number from an old report ("1.8.1 still
    // present") keep it and come first, in number order; the rest count on
    // from the highest of those.
    const oldRef = (e: T) => {
      const r = noteReference(e.finding.note);
      return r?.code === code ? r.ref : undefined;
    };
    const lastPart = (ref: string) => Number(ref.split(".").pop());
    const kept = byCode.get(code)!.filter(oldRef).sort((a, b) => lastPart(oldRef(a)!) - lastPart(oldRef(b)!));
    const rest = clusterSimilar(byCode.get(code)!.filter((e) => !oldRef(e)));
    const start = Math.max(0, ...kept.map((e) => (oldRef(e)!.split(".").length === code.split(".").length + 1 ? lastPart(oldRef(e)!) : 0)));
    kept.forEach((entry) => rows.push({ kind: "finding", entry, ref: oldRef(entry) }));
    rest.forEach((entry, n) => rows.push({ kind: "finding", entry, ref: `${code}.${start + n + 1}` }));
  }
  if (uncategorised.length) {
    rows.push({ kind: "uncategorised" });
    for (const entry of clusterSimilar(uncategorised)) rows.push({ kind: "finding", entry });
  }
  return rows;
}
