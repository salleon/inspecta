import type { Finding, Photo } from "../db/types";
import { watermarkBlob } from "./watermark";
import { ZipWriter } from "./zip";

// "Send Photos Only": every photo on the site at full camera resolution,
// with the same time/date stamp as the reports, in one zip whose only
// content is a folder named after the site. Extracting it on the laptop
// gives e.g.
//
//   Harbour Tower/
//     01 - Level 25 - Back of house kitchen.jpg
//     02 - Level 25 - Fire stair B (1).jpg
//     02 - Level 25 - Fire stair B (2).jpg
//
// numbered in the same finding order as the PDF and Excel. Photos are
// stamped and written one at a time, so memory stays flat however many
// there are.

export interface ZipFinding {
  finding: Finding;
  photos: Photo[];
}

// Windows won't allow these in file or folder names
function safeName(text: string): string {
  return text
    // control characters are deliberately stripped too
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim();
}

export function photosZipName(siteName: string | undefined): string {
  return `${safeName(siteName ?? "") || "Inspection"}.zip`;
}

export function countPhotos(items: ZipFinding[]): number {
  return items.reduce((n, i) => n + i.photos.length, 0);
}

export async function writePhotosZip(
  items: ZipFinding[],
  siteName: string | undefined,
  write: (bytes: Uint8Array) => Promise<void>,
  onPhoto: (done: number, total: number) => void,
): Promise<void> {
  const folder = safeName(siteName ?? "") || "Inspection";
  const total = countPhotos(items);
  const digits = Math.max(2, String(items.length).length);
  const used = new Set<string>();
  const zip = new ZipWriter(write);
  await zip.addFolder(folder, new Date());

  let done = 0;
  onPhoto(0, total);
  for (let i = 0; i < items.length; i++) {
    const { finding, photos } = items[i];
    const base = [String(i + 1).padStart(digits, "0"), safeName(finding.level ?? ""), safeName(finding.location)]
      .filter(Boolean)
      .join(" - ");
    for (let j = 0; j < photos.length; j++) {
      const photo = photos[j];
      let name = photos.length > 1 ? `${base} (${j + 1})` : base;
      while (used.has(name.toLowerCase())) name += "_";
      used.add(name.toLowerCase());

      // full resolution, visually lossless; upright (EXIF applied) and stamped
      const { jpeg } = await watermarkBlob(photo.blob, photo.takenAt, { quality: 0.95 });
      await zip.addFile(`${folder}/${name}.jpg`, new Uint8Array(await jpeg.arrayBuffer()), new Date(photo.takenAt));
      onPhoto(++done, total);
    }
  }
  await zip.finish();
}
