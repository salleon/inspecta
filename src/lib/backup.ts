import type { Finding, Photo, Site } from "../db/types";
import { backupRecords, photoBlob, restorePhoto, restoreSiteRecords, siteExists } from "../db/db";
import { ZipWriter } from "./zip";

// Backup: every site, finding and photo on this phone in one .zip —
// backup.json (the records) plus photos/<id>.jpg (the original photos, as
// taken). Shared like the other exports, e.g. saved to OneDrive.
//
// Restore adds what isn't on the phone yet and never overwrites: a site
// that's already here (same site, e.g. restoring the same backup twice)
// is left exactly as it is. So it works for moving to a new phone, and for
// handing a site to a coworker, without risk to what's already there.
//
// Not included: settings, name, admin PIN and keyword changes — they
// belong to the phone and person, not the inspections.

const TYPE = "inspecta-backup";
const VERSION = 1;

interface BackupJson {
  type: typeof TYPE;
  version: number;
  createdAt: string;
  sites: Site[];
  findings: Finding[];
  photos: (Omit<Photo, "blob"> & { file: string; mime: string })[];
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `inspecta-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`;
}

export async function backupCounts() {
  const { sites, findings, photos } = await backupRecords();
  return { sites: sites.length, findings: findings.length, photos: photos.length };
}

// Photos are written one at a time, so memory stays flat however many
// there are.
export async function writeBackup(write: (bytes: Uint8Array) => Promise<void>, onPhoto: (done: number, total: number) => void) {
  const { sites, findings, photos } = await backupRecords();
  const zip = new ZipWriter(write);
  const now = new Date();
  const listed: BackupJson["photos"] = [];
  onPhoto(0, photos.length);
  for (let i = 0; i < photos.length; i++) {
    const meta = photos[i];
    const blob = await photoBlob(meta.id);
    if (!blob) continue;
    const file = `photos/${meta.id}.jpg`;
    await zip.addFile(file, new Uint8Array(await blob.arrayBuffer()), new Date(meta.takenAt));
    listed.push({ ...meta, file, mime: blob.type || "image/jpeg" });
    onPhoto(i + 1, photos.length);
  }
  const json: BackupJson = { type: TYPE, version: VERSION, createdAt: now.toISOString(), sites, findings, photos: listed };
  await zip.addFile("backup.json", new TextEncoder().encode(JSON.stringify(json)), now);
  await zip.finish();
}

// ---- reading ----

// Reads the stored (uncompressed) entries of a zip like ours, straight
// from the file: only the part being used is loaded.
async function zipEntries(file: Blob): Promise<Map<string, Blob>> {
  const tailSize = Math.min(file.size, 65557);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = tail.getUint16(eocd + 10, true);
  const dirSize = tail.getUint32(eocd + 12, true);
  const dirOffset = tail.getUint32(eocd + 16, true);
  const dir = new DataView(await file.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const entries = new Map<string, Blob>();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (dir.getUint32(p, true) !== 0x02014b50) throw new Error("Damaged zip file");
    const method = dir.getUint16(p + 10, true);
    const size = dir.getUint32(p + 20, true);
    const nameLen = dir.getUint16(p + 28, true);
    const extraLen = dir.getUint16(p + 30, true);
    const commentLen = dir.getUint16(p + 32, true);
    const localOffset = dir.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (method !== 0) continue; // only stored entries (ours are)
    const local = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
    const dataStart = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    entries.set(name, file.slice(dataStart, dataStart + size));
  }
  return entries;
}

export interface RestorePlan {
  json: BackupJson;
  entries: Map<string, Blob>;
  newSites: Site[];
  existingSites: Site[];
}

// Checks the file and works out what it would add, without changing
// anything yet.
export async function readBackup(file: Blob): Promise<RestorePlan> {
  const entries = await zipEntries(file);
  const jsonBlob = entries.get("backup.json");
  if (!jsonBlob) throw new Error("Not an Inspecta backup");
  const json = JSON.parse(await jsonBlob.text()) as BackupJson;
  if (json?.type !== TYPE || !Array.isArray(json.sites) || !Array.isArray(json.findings) || !Array.isArray(json.photos)) {
    throw new Error("Not an Inspecta backup");
  }
  if (json.version > VERSION) throw new Error("This backup is from a newer version of Inspecta");
  const newSites: Site[] = [];
  const existingSites: Site[] = [];
  for (const site of json.sites) ((await siteExists(site.id)) ? existingSites : newSites).push(site);
  return { json, entries, newSites, existingSites };
}

export async function applyRestore(plan: RestorePlan, onPhoto: (done: number, total: number) => void) {
  const siteIds = new Set(plan.newSites.map((s) => s.id));
  const photos = plan.json.photos.filter((ph) => siteIds.has(ph.siteId));
  let findings = 0;
  for (const site of plan.newSites) {
    const siteFindings = plan.json.findings.filter((f) => f.siteId === site.id);
    await restoreSiteRecords(site, siteFindings);
    findings += siteFindings.length;
  }
  onPhoto(0, photos.length);
  let restored = 0;
  for (let i = 0; i < photos.length; i++) {
    const { file, mime, ...meta } = photos[i];
    const data = plan.entries.get(file);
    if (data) {
      // copied into memory as its own Blob, independent of the backup file
      await restorePhoto({ ...meta, blob: new Blob([await data.arrayBuffer()], { type: mime }) });
      restored++;
    }
    onPhoto(i + 1, photos.length);
  }
  return { sites: plan.newSites.length, findings, photos: restored, skipped: plan.existingSites.length };
}
