import Dexie, { type Table } from "dexie";
import type { Site, Finding, Photo, SiteKind, Thumbnail, ExportCopy, StampedPhoto, FlowTest, SiteReport } from "./types";
import { makeThumbnail } from "../lib/thumbnail";
import { makeExportCopy } from "../lib/exportCopy";
import { RENAMED_CODES } from "../lib/esrCategories";
import { isExportBusy } from "../lib/exportBusy";

class InspectaDB extends Dexie {
  sites!: Table<Site, string>;
  findings!: Table<Finding, string>;
  photos!: Table<Photo, string>;
  thumbnails!: Table<Thumbnail, string>;
  exportCopies!: Table<ExportCopy, string>;
  flowTests!: Table<FlowTest, string>;

  constructor() {
    super("inspecta");
    this.version(1).stores({
      sites: "id, updatedAt",
      findings: "id, siteId, createdAt",
      photos: "id, findingId, siteId, order",
    });
    this.version(2)
      .stores({
        sites: "id, updatedAt, kind",
        findings: "id, siteId, createdAt",
        photos: "id, findingId, siteId, order",
      })
      .upgrade((tx) => tx.table("sites").toCollection().modify((s) => {
        if (!s.kind) s.kind = "project";
      }));
    this.version(3)
      .stores({
        sites: "id, updatedAt, kind",
        findings: "id, siteId, createdAt, order",
        photos: "id, findingId, siteId, order",
      })
      .upgrade((tx) => tx.table("findings").toCollection().modify((f) => {
        // seed manual order from the existing newest-first display order —
        // negative createdAt sorts ascending exactly the way createdAt
        // descending used to, so the list looks identical until someone
        // actually drags a row.
        if (f.order === undefined) f.order = -f.createdAt;
      }));
    // v4: small list thumbnails, kept apart from the photos so reading them
    // never touches the full-size images. Additive only — nothing existing
    // changes; thumbnails for older photos are made on first view.
    this.version(4).stores({
      sites: "id, updatedAt, kind",
      findings: "id, siteId, createdAt, order",
      photos: "id, findingId, siteId, order",
      thumbnails: "photoId, siteId",
    });
    // v5: ESR item codes that were removed (4.1 General → 4 Emergency
    // Lighting) move to what replaced them. Schema unchanged.
    this.version(5)
      .stores({
        sites: "id, updatedAt, kind",
        findings: "id, siteId, createdAt, order",
        photos: "id, findingId, siteId, order",
        thumbnails: "photoId, siteId",
      })
      .upgrade((tx) => tx.table("findings").toCollection().modify((f) => {
        if (f.esrCategory && RENAMED_CODES[f.esrCategory]) f.esrCategory = RENAMED_CODES[f.esrCategory];
      }));
    // v6: the smaller copies the exports work from (see lib/exportCopy).
    // Additive only; copies for older photos are made when first needed.
    this.version(6).stores({
      sites: "id, updatedAt, kind",
      findings: "id, siteId, createdAt, order",
      photos: "id, findingId, siteId, order",
      thumbnails: "photoId, siteId",
      exportCopies: "photoId, siteId",
    });
    // v7: flow tests (the Flow tests tab on a site). Additive only.
    this.version(7).stores({
      sites: "id, updatedAt, kind",
      findings: "id, siteId, createdAt, order",
      photos: "id, findingId, siteId, order",
      thumbnails: "photoId, siteId",
      exportCopies: "photoId, siteId",
      flowTests: "id, siteId",
    });
  }
}

const db = new InspectaDB();

// ---- helpers ----

const uid = () => crypto.randomUUID();

export async function createSite(name: string, address: string, kind: SiteKind) {
  const now = Date.now();
  const site: Site = {
    id: uid(),
    name,
    address,
    kind,
    createdAt: now,
    updatedAt: now,
  };
  await db.sites.add(site);
  return site;
}

export async function listSites() {
  const sites = await db.sites.toArray();
  return sites.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSite(siteId: string) {
  return db.sites.get(siteId);
}

export async function updateSite(
  siteId: string,
  changes: Partial<Pick<Site, "name" | "address">>,
) {
  await db.sites.update(siteId, changes);
}

// the site's customised reports, all at once (not a change to the site
// itself, so its place on the home page stays put)
export async function saveSiteReports(siteId: string, reports: SiteReport[]) {
  await db.sites.update(siteId, { reports });
}

async function touchSite(siteId: string) {
  await db.sites.update(siteId, { updatedAt: Date.now() });
}

export async function deleteSite(siteId: string) {
  // keys only — no need to read every photo just to delete it
  await db.thumbnails.where("siteId").equals(siteId).delete();
  await db.exportCopies.where("siteId").equals(siteId).delete();
  await db.photos.where("siteId").equals(siteId).delete();
  await db.findings.where("siteId").equals(siteId).delete();
  await db.flowTests.where("siteId").equals(siteId).delete();
  await db.sites.delete(siteId);
}

export async function createFinding(siteId: string, carried: Partial<Pick<Finding, "level">> = {}) {
  const now = Date.now();
  const finding: Finding = {
    id: uid(),
    siteId,
    note: "",
    location: "",
    ...carried,
    // negative timestamp so a new finding sorts before every existing one
    // (matches the old "newest first" default) until it's dragged.
    order: -now,
    createdAt: now,
    updatedAt: now,
  };
  await db.findings.add(finding);
  await touchSite(siteId);
  return finding;
}

export async function updateFinding(
  findingId: string,
  changes: Partial<Pick<Finding, "note" | "location" | "defectType" | "level" | "esrCategory">>,
) {
  await db.findings.update(findingId, { ...changes, updatedAt: Date.now() });
}

// Moves a finding to a new manual sort position. `order` is typically the
// midpoint between its new neighbours' own order values (fractional
// indexing), so a reorder only ever writes the one row that moved.
export async function reorderFinding(findingId: string, order: number) {
  await db.findings.update(findingId, { order });
}

// A finding with its photos and their thumbnails / export copies.
export async function deleteFinding(findingId: string) {
  const photoIds = await db.photos.where("findingId").equals(findingId).primaryKeys();
  await db.thumbnails.bulkDelete(photoIds);
  await db.exportCopies.bulkDelete(photoIds);
  await db.photos.bulkDelete(photoIds);
  const finding = await db.findings.get(findingId);
  await db.findings.delete(findingId);
  if (finding) await touchSite(finding.siteId);
}

// The site's cover photo for the dashboard: the first photo of its first
// finding (in the list's order), or of the first finding that has one.
export async function firstSitePhoto(siteId: string): Promise<Photo | undefined> {
  for (const finding of await listFindings(siteId)) {
    const [first] = await listPhotos(finding.id);
    if (first) return first;
  }
  return undefined;
}

export async function listFindings(siteId: string) {
  const findings = await db.findings.where("siteId").equals(siteId).toArray();
  return findings.sort((a, b) => a.order - b.order);
}

export async function getFinding(findingId: string) {
  return db.findings.get(findingId);
}

export async function findingCount(siteId: string) {
  return db.findings.where("siteId").equals(siteId).count();
}

// takenAt: when a photo from the gallery was taken (defaults to now)
export async function addPhoto(findingId: string, siteId: string, blob: Blob, takenAt = Date.now()) {
  const existing = await db.photos.where("findingId").equals(findingId).count();
  const photo: Photo = {
    id: uid(),
    findingId,
    siteId,
    blob,
    takenAt,
    order: existing,
  };
  await db.photos.add(photo);
  await db.findings.update(findingId, { updatedAt: Date.now() });
  // make its thumbnail now, in the background, so lists never wait on it;
  // then the copy the exports use, so exporting doesn't have to
  void getThumbnail(photo)
    .catch(() => {})
    .then(() => getExportCopy(photo))
    .catch(() => {});
  return photo;
}

export async function listPhotos(findingId: string) {
  const photos = await db.photos.where("findingId").equals(findingId).toArray();
  return photos.sort((a, b) => a.order - b.order);
}

export async function deletePhoto(photoId: string) {
  await db.photos.delete(photoId);
  await db.thumbnails.delete(photoId);
  await db.exportCopies.delete(photoId);
}

// A photo's small list thumbnail, made (and saved) the first time it's
// asked for. Concurrent requests for the same photo share one job.
const thumbnailJobs = new Map<string, Promise<Blob>>();
export function getThumbnail(photo: Photo): Promise<Blob> {
  let job = thumbnailJobs.get(photo.id);
  if (!job) {
    job = (async () => {
      const saved = await db.thumbnails.get(photo.id);
      if (saved) return saved.blob;
      const blob = await makeThumbnail(photo.blob);
      // only keep it if the photo still exists (it may have been deleted
      // or retaken while the thumbnail was being made)
      await db.transaction("rw", db.photos, db.thumbnails, async () => {
        if (await db.photos.get(photo.id)) await db.thumbnails.put({ photoId: photo.id, siteId: photo.siteId, blob });
      });
      return blob;
    })().finally(() => thumbnailJobs.delete(photo.id));
    thumbnailJobs.set(photo.id, job);
  }
  return job;
}

// Photos with no export copy yet (taken before copies existed), most
// recently worked-on sites first. Keys only, so no photo is read.
export async function photoIdsWithoutExportCopy(): Promise<string[]> {
  const have = new Set(await db.exportCopies.toCollection().primaryKeys());
  const ids: string[] = [];
  for (const siteId of await db.sites.orderBy("updatedAt").reverse().primaryKeys()) {
    for (const id of await db.photos.where("siteId").equals(siteId).primaryKeys()) if (!have.has(id)) ids.push(id);
  }
  return ids;
}

export async function getPhoto(photoId: string) {
  return db.photos.get(photoId);
}

// how many of these photos already have their export copy made
export async function countExportCopies(photoIds: string[]): Promise<number> {
  return (await db.exportCopies.bulkGet(photoIds)).filter(Boolean).length;
}

// The smaller copy of a photo that the PDF / Excel exports work from (see
// lib/exportCopy), made (and saved) the first time it's asked for. One is
// made at a time, however many are asked for, so a slow phone never holds
// two full-size photos in memory at once; the same photo shares one job.
const exportCopyJobs = new Map<string, Promise<Blob>>();
let exportCopyQueue: Promise<unknown> = Promise.resolve();
export function getExportCopy(photo: Photo): Promise<Blob> {
  let job = exportCopyJobs.get(photo.id);
  if (!job) {
    job = (async () => {
      const saved = await db.exportCopies.get(photo.id);
      if (saved) return saved.blob;
      const made = exportCopyQueue.then(async () => {
        // not while an export runs: it doesn't need the copy (see getStamped)
        while (isExportBusy()) await new Promise((r) => setTimeout(r, 500));
        return makeExportCopy(photo.blob);
      });
      exportCopyQueue = made.catch(() => {});
      const blob = await made;
      // only keep it if the photo still exists
      await db.transaction("rw", db.photos, db.exportCopies, async () => {
        if (await db.photos.get(photo.id)) await db.exportCopies.put({ photoId: photo.id, siteId: photo.siteId, blob });
      });
      return blob;
    })().finally(() => exportCopyJobs.delete(photo.id));
    exportCopyJobs.set(photo.id, job);
  }
  return job;
}

// A photo stamped for the Excel or the PDF. Failsafe, so an export is never
// slower than before copies existed:
// - stamped already (same `key`: stamp style, crop, date): reused as is;
// - its 1200 px copy is ready: stamped from that, and kept with the copy
//   for next time;
// - no copy yet (it's still to be made in the background): stamped
//   straight from the original in one pass, the way exports always did,
//   without waiting for or making a copy. Nothing is kept; the copy comes
//   later, and the next export gets the quick way.
export async function getStamped(
  photo: Photo,
  kind: "excel" | "pdf",
  key: string,
  make: (source: Blob) => Promise<Omit<StampedPhoto, "key">>,
): Promise<Omit<StampedPhoto, "key">> {
  const copy = await db.exportCopies.get(photo.id);
  const saved = copy?.[kind];
  if (saved?.key === key) return saved;
  if (!copy) return make(photo.blob);
  const made = await make(copy.blob);
  await db.exportCopies.update(photo.id, { [kind]: { key, ...made } });
  return made;
}

// ---- flow tests ----

export async function listFlowTests(siteId: string) {
  const tests = await db.flowTests.where("siteId").equals(siteId).toArray();
  return tests.sort((a, b) => a.order - b.order);
}

export async function flowTestCount(siteId: string) {
  return db.flowTests.where("siteId").equals(siteId).count();
}

export async function getFlowTest(testId: string) {
  return db.flowTests.get(testId);
}

// `test` is a new one from lib/flowTest's newFlowTest
export async function addFlowTest(test: Omit<FlowTest, "id" | "order" | "createdAt" | "updatedAt">) {
  const now = Date.now();
  const saved: FlowTest = { ...test, id: uid(), order: now, createdAt: now, updatedAt: now };
  await db.flowTests.add(saved);
  await touchSite(test.siteId);
  return saved;
}

export async function saveFlowTest(test: FlowTest) {
  await db.flowTests.put({ ...test, updatedAt: Date.now() });
}

export async function deleteFlowTest(testId: string) {
  const test = await db.flowTests.get(testId);
  await db.flowTests.delete(testId);
  if (test) await touchSite(test.siteId);
}

// ---- backup / restore (see lib/backup.ts) ----

// Everything except the photo files themselves, which are read one at a
// time with photoBlob() so a backup never holds them all in memory.
export async function backupRecords() {
  const sites = await db.sites.toArray();
  const findings = await db.findings.toArray();
  const flowTests = await db.flowTests.toArray();
  const photos: Omit<Photo, "blob">[] = [];
  await db.photos.each(({ blob: _blob, ...meta }) => {
    photos.push(meta);
  });
  return { sites, findings, flowTests, photos };
}

export async function photoBlob(photoId: string): Promise<Blob | undefined> {
  return (await db.photos.get(photoId))?.blob;
}

export async function siteExists(siteId: string): Promise<boolean> {
  return (await db.sites.get(siteId)) !== undefined;
}

// A restored site and its findings (photos follow one at a time).
export async function restoreSiteRecords(site: Site, findings: Finding[], flowTests: FlowTest[] = []) {
  await db.transaction("rw", db.sites, db.findings, db.flowTests, async () => {
    await db.sites.add(site);
    await db.findings.bulkAdd(findings);
    await db.flowTests.bulkAdd(flowTests);
  });
}

export async function restorePhoto(photo: Photo) {
  await db.photos.add(photo);
}
