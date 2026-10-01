import type { Finding, Photo, SiteReport } from "../db/types";
import { esrItem, esrOrder } from "./esrCategories";
import { defectTypeStyle, DEFECT_TYPES } from "./defectTypes";
import { forProjectReport } from "./projectReport";

// Customised reports (export page, canvas ExportReports): a named group of a
// site's findings, exported on its own, laid out by time taken or by ESR
// category. Saved on the site (Site.reports).

type Entry = { finding: Finding; photos: Pick<Photo, "takenAt">[] };

// The findings in a report, in its order: by time taken (the order the
// photos were taken, as a project report), or under ESR headings (the
// caller groups them with esrGrouping's reportRows).
export function reportEntries<T extends Entry>(all: T[], report: SiteReport): T[] {
  const ids = new Set(report.findingIds);
  const picked = all.filter((e) => ids.has(e.finding.id));
  return report.order === "time" ? forProjectReport(picked) : picked;
}

// Findings added to the site since the report was last saved and not in it.
export function newSince(all: Entry[], report: SiteReport): number {
  const ids = new Set(report.findingIds);
  return all.filter((e) => !ids.has(e.finding.id) && e.finding.createdAt > report.updatedAt).length;
}

export interface BulkOption {
  key: string;
  label: string;
  ids: string[];
}
export interface BulkGroup {
  heading: string;
  options: BulkOption[];
}

// The "Bulk refine findings" choices, from what's on this site's findings:
// every finding, then each level, location, defect type and ESR category
// used, with how many findings each covers. Groups with nothing are left
// out.
export function bulkGroups(all: Entry[]): BulkGroup[] {
  const by = (key: (f: Finding) => string | undefined) => {
    const map = new Map<string, string[]>();
    for (const { finding } of all) {
      const k = key(finding)?.trim();
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(finding.id);
    }
    return map;
  };
  const opts = (prefix: string, map: Map<string, string[]>, label: (k: string) => string = (k) => k) =>
    [...map.entries()].map(([k, ids]) => ({ key: `${prefix}:${k}`, label: label(k), ids }));
  const natural = (a: BulkOption, b: BulkOption) => a.label.localeCompare(b.label, undefined, { numeric: true });

  const levels = opts("level", by((f) => f.level)).sort(natural);
  const locations = opts("loc", by((f) => f.location)).sort(natural);
  const types = opts("type", by((f) => f.defectType), (k) => defectTypeStyle(k as Finding["defectType"])?.label ?? k).sort(
    (a, b) => DEFECT_TYPES.findIndex((t) => `type:${t.value}` === a.key) - DEFECT_TYPES.findIndex((t) => `type:${t.value}` === b.key),
  );
  const esr = opts("esr", by((f) => (esrItem(f.esrCategory) ? f.esrCategory : undefined)), (k) => `${k} ${esrItem(k)!.name}`).sort(
    (a, b) => esrOrder(a.key.slice(4)) - esrOrder(b.key.slice(4)),
  );
  return [
    { heading: "", options: [{ key: "all", label: "Every finding", ids: all.map((e) => e.finding.id) }] },
    { heading: "Level", options: levels },
    { heading: "Location", options: locations },
    { heading: "Type", options: types },
    { heading: "ESR category", options: esr },
  ].filter((g) => g.options.length);
}

// The findings ticked by the chosen bulk options (any of them).
export function bulkTicked(groups: BulkGroup[], chosen: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const g of groups) for (const o of g.options) if (chosen.has(o.key)) o.ids.forEach((id) => out.add(id));
  return out;
}
