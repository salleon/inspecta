import type { Finding, Photo } from "../db/types";

// Reports for a Projects site (site.kind "project"): no ESR categories, and
// findings in the order their photos were taken — each at its earliest
// photo's time, or, for a note-only finding, when it was written. Ties keep
// the list order. AFSS sites are untouched.

export function findingTime(finding: Finding, photos: Pick<Photo, "takenAt">[]): number {
  return photos.length ? Math.min(...photos.map((p) => p.takenAt)) : finding.createdAt;
}

export function forProjectReport<T extends { finding: Finding; photos: Pick<Photo, "takenAt">[] }>(entries: T[]): T[] {
  return entries
    .map((e, i) => ({ e, i, t: findingTime(e.finding, e.photos) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(({ e }) => ({ ...e, finding: { ...e.finding, esrCategory: undefined } }));
}
