import type { Finding, FlowTest, Photo, Site, StairTest } from "../db/types";
import { backupRecords, finishSiteRestore, photoBlob, photoExists, restorePhoto, restoreSiteRecords, siteRestoreState } from "../db/db";
import { readZip, ZipWriter, type ZipEntry } from "./zip";

// Backup: every site, finding, flow test, stair test and photo on this phone in one .zip —
// backup.json (the records) plus photos/<id>.jpg (the original photos, as
// taken). Shared like the other exports, e.g. saved to OneDrive.
//
// Restore adds what isn't on the phone yet and never overwrites: a site
// that's already here (same site, e.g. restoring the same backup twice)
// is left exactly as it is. So it works for moving to a new phone, and for
// handing a site to a coworker, without risk to what's already there.
//
// Each site goes in as a unit: its records, then its photos, and only then
// is it an ordinary site. Until then it's marked restoreIncomplete, so if
// the restore stops part way (phone full, app closed) restoring the same
// backup again finishes that site instead of skipping it as "already here".
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
  // added with flow tests; older backups don't have it
  flowTests?: FlowTest[];
  // added with stair tests
  stairTests?: StairTest[];
  photos: (Omit<Photo, "blob" | "marked"> & { file: string; mime: string })[];
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
  const { sites, findings, flowTests, stairTests, photos } = await backupRecords();
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
  const json: BackupJson = { type: TYPE, version: VERSION, createdAt: now.toISOString(), sites, findings, flowTests, stairTests, photos: listed };
  await zip.addFile("backup.json", new TextEncoder().encode(JSON.stringify(json)), now);
  await zip.finish();
}

// ---- reading ----

export interface RestorePlan {
  json: BackupJson;
  entries: Map<string, ZipEntry>;
  // the folder backup.json is in, if the zip was re-made with a folder
  prefix: string;
  newSites: Site[];
  // added by an earlier restore that stopped before all their photos were
  // in: this restore adds the photos still missing
  unfinishedSites: Site[];
  existingSites: Site[];
}

// Checks the file and works out what it would add, without changing
// anything yet.
export async function readBackup(file: Blob): Promise<RestorePlan> {
  const entries = await readZip(file);
  const jsonName = [...entries.keys()].find((n) => (n === "backup.json" || n.endsWith("/backup.json")) && !n.startsWith("__MACOSX/"));
  if (!jsonName) throw new Error("There's no backup.json in this zip, so it isn't an Inspecta backup.");
  const prefix = jsonName.slice(0, -"backup.json".length);
  let json: BackupJson;
  try {
    json = JSON.parse(await (await entries.get(jsonName)!()).text()) as BackupJson;
  } catch {
    throw new Error("This backup's backup.json can't be read. The file may be damaged.");
  }
  if (json?.type !== TYPE || !Array.isArray(json.sites) || !Array.isArray(json.findings) || !Array.isArray(json.photos)) {
    throw new Error("This zip has a backup.json, but it isn't an Inspecta backup.");
  }
  if (json.version > VERSION) throw new Error("This backup is from a newer version of Inspecta. Update the app, then restore it.");
  const newSites: Site[] = [];
  const unfinishedSites: Site[] = [];
  const existingSites: Site[] = [];
  for (const site of json.sites) {
    const state = await siteRestoreState(site.id);
    (state === "new" ? newSites : state === "unfinished" ? unfinishedSites : existingSites).push(site);
  }
  return { json, entries, prefix, newSites, unfinishedSites, existingSites };
}

// One site at a time, records then photos, then the site is marked done.
// A photo that can't be read from the backup (missing or damaged entry) is
// counted and passed over, as restoring again wouldn't bring it back either;
// anything else (phone full, say) stops the restore with the site still
// marked unfinished.
export async function applyRestore(plan: RestorePlan, onPhoto: (done: number, total: number) => void) {
  const sites = [...plan.newSites.map((site) => ({ site, isNew: true })), ...plan.unfinishedSites.map((site) => ({ site, isNew: false }))];
  const siteIds = new Set(sites.map(({ site }) => site.id));
  const total = plan.json.photos.filter((ph) => siteIds.has(ph.siteId)).length;
  let findings = 0;
  let restored = 0;
  let unreadable = 0;
  let done = 0;
  onPhoto(0, total);
  for (const { site, isNew } of sites) {
    if (isNew) {
      const siteFindings = plan.json.findings.filter((f) => f.siteId === site.id);
      await restoreSiteRecords(
        site,
        siteFindings,
        (plan.json.flowTests ?? []).filter((t) => t.siteId === site.id),
        (plan.json.stairTests ?? []).filter((t) => t.siteId === site.id),
      );
      findings += siteFindings.length;
    }
    for (const { file, mime, ...meta } of plan.json.photos.filter((ph) => ph.siteId === site.id)) {
      if (isNew || !(await photoExists(meta.id))) {
        let blob: Blob | undefined;
        try {
          const entry = plan.entries.get(plan.prefix + file);
          // copied into memory as its own Blob, independent of the backup file
          if (entry) blob = new Blob([await (await entry()).arrayBuffer()], { type: mime });
        } catch (err) {
          console.error("backup photo can't be read", file, err);
        }
        if (blob) {
          await restorePhoto({ ...meta, blob });
          restored++;
        } else {
          unreadable++;
        }
      }
      onPhoto(++done, total);
    }
    await finishSiteRestore(site.id);
  }
  return { sites: plan.newSites.length, finished: plan.unfinishedSites.length, findings, photos: restored, unreadable, skipped: plan.existingSites.length };
}
