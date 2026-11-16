import type { Finding, Photo, StairTest } from "../db/types";
import { getStamped, listTestFindings } from "../db/db";
import { defectTypeStyle } from "./defectTypes";
import { EXPORT_MAX_EDGE, STAMP_VERSION, watermarkBlob } from "./watermark";

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

export async function testPhotoItems(test: StairTest): Promise<StairPhotoItem[]> {
  return photoItems(await listTestFindings(test.siteId, test.id));
}

// the photos as tiles in the PDF: cropped 4:3, stamped with when they were
// taken, made once and kept (db/getStamped)
export const PDF_TILE_ASPECT = 4 / 3;
export async function pdfTile(p: Photo) {
  const key = `${STAMP_VERSION}:${EXPORT_MAX_EDGE}:${PDF_TILE_ASPECT.toFixed(4)}:${p.takenAt}`;
  const tile = await getStamped(p, "pdf", key, async (source) => {
    const { jpeg, width, height } = await watermarkBlob(source, p.takenAt, { cropAspect: PDF_TILE_ASPECT, maxEdge: EXPORT_MAX_EDGE });
    return { blob: jpeg, width, height };
  });
  return new Uint8Array(await tile.blob.arrayBuffer());
}

// a photo for the Excel, the same stamp the findings register uses
export function excelTile(p: Photo) {
  return getStamped(p, "excel", `${STAMP_VERSION}:${EXPORT_MAX_EDGE}:${p.takenAt}`, async (source) => {
    const { jpeg, width, height } = await watermarkBlob(source, p.takenAt, { maxEdge: EXPORT_MAX_EDGE });
    return { blob: jpeg, width, height };
  });
}
