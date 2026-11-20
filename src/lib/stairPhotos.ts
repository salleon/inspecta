import type { Finding, Photo, SpfSystem, StairTest } from "../db/types";
import { listTestFindings } from "../db/db";
import { defectTypeStyle } from "./defectTypes";
import { stairLabel } from "./stairTest";

// A stair test's Photos & notes (lib/testPhotos) as they print: their own
// page after the stair pages, in the preview, the PDF and the Excel alike.
// Oldest first, numbered; each with its level and location where there is
// one, its defect type, its note and its photos.

export interface StairPhotoItem {
  n: number;
  place: string; // "Level 12 · stair door", or "" for neither
  type?: { label: string; bg: string; text: string };
  note: string;
  finding: Finding;
  photos: Photo[];
}

export const PHOTOS_SUBTITLE = "Photos & notes";
// a flow test's, on the page after it
export const DEFECTS_HEADING = "Defects found during testing";

// its level and location, the level once if the location already says it
function place(f: Finding) {
  const loc = f.location.trim();
  const level = f.level && !loc.toLowerCase().includes(f.level.toLowerCase()) ? f.level : "";
  return [level, loc].filter(Boolean).join(" · ");
}

export function photoItems(rows: { finding: Finding; photos: Photo[] }[]): StairPhotoItem[] {
  return rows
    .filter((r) => r.photos.length || r.finding.note.trim() || r.finding.location.trim())
    .map((r, i) => {
      const t = defectTypeStyle(r.finding.defectType);
      return {
        n: i + 1,
        place: place(r.finding),
        type: t && { label: t.label, bg: t.bg, text: t.text },
        note: r.finding.note.trim(),
        finding: r.finding,
        photos: r.photos,
      };
    });
}

export async function testPhotoItems(test: { id: string; siteId: string }): Promise<StairPhotoItem[]> {
  return photoItems(await listTestFindings(test.siteId, test.id));
}

// The photo appendix (the PDF, the preview and the Excel alike): every photo
// of the test's Photos & notes, numbered in order across all its stairs, each
// 5 × 6.61 cm with a label table under it. A note with no photo still gets
// its place, marked No photo.
export const PHOTO_W = 141.73; // pt, 5 cm
export const PHOTO_H = 187.37; // pt, 6.61 cm

export interface AppendixPhoto {
  n: number;
  photo: Photo | null;
  rows: [string, string][]; // Stair, Level, Location, Run (system testing only), Note
}

export function appendixPhotos(items: StairPhotoItem[], test: Pick<StairTest, "kind">, sys: Pick<SpfSystem, "stairs">): AppendixPhoto[] {
  const out: AppendixPhoto[] = [];
  for (const item of items) {
    const f = item.finding;
    const k = sys.stairs.findIndex((s) => s.id === f.stairId);
    const rows: [string, string][] = [
      ["Stair", k >= 0 ? stairLabel(sys.stairs[k], k) : "–"],
      ["Level", f.level?.trim() || "–"],
      ["Location", f.location.trim() || "–"],
      ...(test.kind === "general" ? [["Run", f.run === undefined ? "–" : `Run ${f.run + 1}`] as [string, string]] : []),
      ["Note", f.note.trim() || "–"],
    ];
    for (const photo of item.photos.length ? item.photos : [null]) out.push({ n: out.length + 1, photo, rows });
  }
  return out;
}
