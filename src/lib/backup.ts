import type { Finding, FlowTest, Photo, Site, StairTest } from "../db/types";
import { backupRecords, finishSiteRestore, getSite, photoBlob, photoExists, restorePhoto, restoreSiteRecords } from "../db/db";
import { photoExtension, photoFiles, siteChangedAt, siteFolders } from "./backupNames";
import { readZip, ZipWriter, type ZipEntry } from "./zip";

// Backup: the chosen sites (all of them, some, or the ones new or changed
// since their last backup) in one .zip, one folder per site:
//
//   README.txt                       what this file is
//   backup.json                      when, what kind, which site folders
//   Harbour Tower - 1 Harbour St/
//     site.json                      the site, its findings and tests, and
//                                    which photo file is which photo
//     photos/F01 Level 2 - Exit sign out (1).jpg   the originals, as taken
//
// Each folder stands on its own: Restore reads every site folder it finds,
// so folders can be copied between backups, or one deleted, on OneDrive or
// a computer. Version 1 backups (one backup.json with every site, photos
// by id) still restore.
//
// Restore adds what isn't on the phone yet. A site that's already here is
// left as it is, unless the backup's copy is newer (changed later) and the
// person says to replace it.
//
// Each site goes in as a unit: its records, then its photos, and only then
// is it an ordinary site. Until then it's marked restoreIncomplete, so if
// the restore stops part way (phone full, app closed) restoring the same
// backup again finishes that site instead of skipping it as "already here".
//
// Not included: settings, name, admin PIN and keyword changes — they
// belong to the phone and person, not the inspections.

const TYPE = "inspecta-backup";
const SITE_TYPE = "inspecta-site";
const VERSION = 2;

export type BackupKind = "full" | "chosen" | "since";

type PhotoMeta = Omit<Photo, "blob" | "marked">;

// backup.json in a version 2 backup: just what's in the file
interface IndexJson {
  type: typeof TYPE;
  version: number;
  createdAt: string;
  kind: BackupKind;
  sites: { id: string; name: string; folder: string }[];
}

// <site folder>/site.json
interface SiteJson {
  type: typeof SITE_TYPE;
  version: number;
  site: Site;
  findings: Finding[];
  flowTests: FlowTest[];
  stairTests: StairTest[];
  // file: the photo's path inside the site's folder
  photos: (PhotoMeta & { file: string; mime: string })[];
}

// a version 1 backup.json: every site's records in one file
interface V1Json {
  type: typeof TYPE;
  version: number;
  sites: Site[];
  findings: Finding[];
  flowTests?: FlowTest[];
  stairTests?: StairTest[];
  photos: (PhotoMeta & { file: string; mime: string })[];
}

export function backupFileName(kind: BackupKind, sites: number, since?: number): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const what =
    kind === "full"
      ? "full"
      : kind === "chosen"
        ? `${sites} site${sites === 1 ? "" : "s"}`
        : since
          ? `since ${new Date(since).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`
          : "new";
  return `inspecta-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} (${what}).zip`;
}

const README = (kind: BackupKind, when: Date, folders: string[]) =>
  [
    "Inspecta backup",
    "",
    `Made ${when.toLocaleString("en-AU")}. ${kind === "full" ? "Every site on the phone." : kind === "chosen" ? "Chosen sites." : "Sites new or changed since their last backup."}`,
    "",
    "Each folder is one site: its photos are in the photos folder, named after",
    "their finding, and site.json holds the site's findings and tests.",
    "",
    "To put sites back on a phone: Inspecta > Settings > Restore from backup,",
    "and pick this .zip file. Site folders can be copied in from another",
    "backup, or deleted, and Restore reads whichever are here.",
    "",
    ...folders.map((f) => `  ${f}/`),
    "",
  ].join("\r\n");

// Writes the backup of these sites. Photos are written one at a time, so
// memory stays flat however many there are. Returns when it started: the
// sites count as backed up as of then.
export async function writeBackup(
  siteIds: string[],
  kind: BackupKind,
  write: (bytes: Uint8Array) => Promise<void>,
  onPhoto: (done: number, total: number) => void,
): Promise<number> {
  const startedAt = Date.now();
  const { sites, findings, flowTests, stairTests, photos } = await backupRecords(siteIds);
  sites.sort((a, b) => a.name.localeCompare(b.name));
  const folders = siteFolders(sites);
  const zip = new ZipWriter(write);
  const now = new Date(startedAt);
  await zip.addFile("README.txt", new TextEncoder().encode(README(kind, now, sites.map((s) => folders.get(s.id)!))), now);
  let done = 0;
  onPhoto(0, photos.length);
  for (const site of sites) {
    const folder = folders.get(site.id)!;
    const siteFindings = findings.filter((f) => f.siteId === site.id);
    const sitePhotos = photos.filter((p) => p.siteId === site.id);
    const names = photoFiles(siteFindings, sitePhotos);
    const listed: SiteJson["photos"] = [];
    for (const meta of sitePhotos) {
      const blob = await photoBlob(meta.id);
      if (blob) {
        const mime = blob.type || "image/jpeg";
        const file = `${names.get(meta.id)}.${photoExtension(mime)}`;
        await zip.addFile(`${folder}/${file}`, new Uint8Array(await blob.arrayBuffer()), new Date(meta.takenAt));
        listed.push({ ...meta, file, mime });
      }
      onPhoto(++done, photos.length);
    }
    const { backedUpAt: _b, restoreIncomplete: _r, ...record } = site;
    const json: SiteJson = {
      type: SITE_TYPE,
      version: VERSION,
      site: record,
      findings: siteFindings,
      flowTests: flowTests.filter((t) => t.siteId === site.id),
      stairTests: stairTests.filter((t) => t.siteId === site.id),
      photos: listed,
    };
    await zip.addFile(`${folder}/site.json`, new TextEncoder().encode(JSON.stringify(json, null, 1)), now);
  }
  const index: IndexJson = { type: TYPE, version: VERSION, createdAt: now.toISOString(), kind, sites: sites.map((s) => ({ id: s.id, name: s.name, folder: folders.get(s.id)! })) };
  await zip.addFile("backup.json", new TextEncoder().encode(JSON.stringify(index, null, 1)), now);
  await zip.finish();
  return startedAt;
}

// ---- reading ----

// One site in a backup, whichever version it came from. A photo's `entry`
// is its full path in the zip.
interface SiteUnit {
  site: Site;
  findings: Finding[];
  flowTests: FlowTest[];
  stairTests: StairTest[];
  photos: (PhotoMeta & { entry: string; mime: string })[];
}

export interface RestorePlan {
  entries: Map<string, ZipEntry>;
  units: Map<string, SiteUnit>;
  // not on this phone
  newSites: Site[];
  // added by an earlier restore that stopped before all their photos were
  // in: this restore adds the photos still missing
  unfinishedSites: Site[];
  // on this phone, but the backup's copy changed later: replaced only if
  // the person says so
  newerSites: Site[];
  // on this phone, as new as the backup's copy or newer: left as they are
  existingSites: Site[];
  // when the phone's copy of each newer site last changed
  phoneChangedAt: Map<string, number>;
}

const notMac = (n: string) => !n.startsWith("__MACOSX/") && !n.includes("/._");

async function readJson<T>(entries: Map<string, ZipEntry>, name: string): Promise<T> {
  try {
    return JSON.parse(await (await entries.get(name)!()).text()) as T;
  } catch {
    throw new Error(`This backup's ${name.split("/").pop()} can't be read. The file may be damaged.`);
  }
}

// Checks the file and works out what it would do, without changing
// anything yet.
export async function readBackup(file: Blob): Promise<RestorePlan> {
  const entries = await readZip(file);
  const names = [...entries.keys()].filter(notMac);
  const units = new Map<string, SiteUnit>();
  const add = (unit: SiteUnit) => {
    // the same site in two folders (merged backups): the later copy
    const had = units.get(unit.site.id);
    if (!had || siteChangedAt(unit.site) > siteChangedAt(had.site)) units.set(unit.site.id, unit);
  };

  let tooNew = false;
  for (const name of names.filter((n) => n === "site.json" || n.endsWith("/site.json"))) {
    const json = await readJson<SiteJson>(entries, name);
    if (json?.type !== SITE_TYPE || !json.site?.id || !Array.isArray(json.findings) || !Array.isArray(json.photos)) continue;
    if (json.version > VERSION) {
      tooNew = true;
      continue;
    }
    const folder = name.slice(0, -"site.json".length);
    add({
      site: json.site,
      findings: json.findings,
      flowTests: json.flowTests ?? [],
      stairTests: json.stairTests ?? [],
      photos: json.photos.map(({ file, mime, ...meta }) => ({ ...meta, entry: folder + file, mime })),
    });
  }

  // a version 1 backup: backup.json holds everything
  const indexName = names.find((n) => n === "backup.json" || n.endsWith("/backup.json"));
  if (indexName) {
    const json = await readJson<V1Json | IndexJson>(entries, indexName);
    if (json?.type !== TYPE) {
      if (!units.size) throw new Error("This zip has a backup.json, but it isn't an Inspecta backup.");
    } else if (json.version > VERSION) {
      tooNew = true;
    } else if (json.version === 1) {
      const v1 = json as V1Json;
      if (!Array.isArray(v1.sites) || !Array.isArray(v1.findings) || !Array.isArray(v1.photos)) throw new Error("This zip has a backup.json, but it isn't an Inspecta backup.");
      const prefix = indexName.slice(0, -"backup.json".length);
      for (const site of v1.sites) {
        add({
          site,
          findings: v1.findings.filter((f) => f.siteId === site.id),
          flowTests: (v1.flowTests ?? []).filter((t) => t.siteId === site.id),
          stairTests: (v1.stairTests ?? []).filter((t) => t.siteId === site.id),
          photos: v1.photos.filter((p) => p.siteId === site.id).map(({ file, mime, ...meta }) => ({ ...meta, entry: prefix + file, mime })),
        });
      }
    }
  }

  if (!units.size) {
    if (tooNew) throw new Error("This backup is from a newer version of Inspecta. Update the app, then restore it.");
    if (!indexName) throw new Error("There are no Inspecta sites in this zip, so it isn't an Inspecta backup.");
    throw new Error("This backup has no sites in it.");
  }

  const plan: RestorePlan = { entries, units, newSites: [], unfinishedSites: [], newerSites: [], existingSites: [], phoneChangedAt: new Map() };
  for (const { site } of [...units.values()].sort((a, b) => a.site.name.localeCompare(b.site.name))) {
    const here = await getSite(site.id);
    if (!here) plan.newSites.push(site);
    else if (here.restoreIncomplete) plan.unfinishedSites.push(site);
    else if (siteChangedAt(site) > siteChangedAt(here)) {
      plan.newerSites.push(site);
      plan.phoneChangedAt.set(site.id, siteChangedAt(here));
    }
    else plan.existingSites.push(site);
  }
  return plan;
}

// One site at a time, records then photos, then the site is marked done.
// New sites are added, unfinished ones get their missing photos, and the
// newer ones replace the phone's copy only with `replace`.
// A photo that can't be read from the backup (missing or damaged entry) is
// counted and passed over, as restoring again wouldn't bring it back either;
// anything else (phone full, say) stops the restore with the site still
// marked unfinished.
export async function applyRestore(plan: RestorePlan, replace: boolean, onPhoto: (done: number, total: number) => void) {
  const work = [
    ...plan.newSites.map((site) => ({ site, how: "add" as const })),
    ...plan.unfinishedSites.map((site) => ({ site, how: "finish" as const })),
    ...(replace ? plan.newerSites.map((site) => ({ site, how: "replace" as const })) : []),
  ];
  const total = work.reduce((n, { site }) => n + plan.units.get(site.id)!.photos.length, 0);
  let findings = 0;
  let restored = 0;
  let unreadable = 0;
  let done = 0;
  onPhoto(0, total);
  for (const { site, how } of work) {
    const unit = plan.units.get(site.id)!;
    if (how !== "finish") {
      await restoreSiteRecords(unit.site, unit.findings, unit.flowTests, unit.stairTests, how === "replace");
      findings += unit.findings.length;
    }
    for (const { entry: path, mime, ...meta } of unit.photos) {
      if (how !== "finish" || !(await photoExists(meta.id))) {
        let blob: Blob | undefined;
        try {
          const entry = plan.entries.get(path);
          // copied into memory as its own Blob, independent of the backup file
          if (entry) blob = new Blob([await (await entry()).arrayBuffer()], { type: mime });
        } catch (err) {
          console.error("backup photo can't be read", path, err);
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
  return {
    sites: plan.newSites.length,
    finished: plan.unfinishedSites.length,
    replaced: replace ? plan.newerSites.length : 0,
    findings,
    photos: restored,
    unreadable,
    skipped: plan.existingSites.length + (replace ? 0 : plan.newerSites.length),
  };
}
