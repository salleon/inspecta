import Dexie, { type Table } from "dexie";
import type { Site, Finding, Photo, SiteKind } from "./types";

class InspectaDB extends Dexie {
  sites!: Table<Site, string>;
  findings!: Table<Finding, string>;
  photos!: Table<Photo, string>;

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

async function touchSite(siteId: string) {
  await db.sites.update(siteId, { updatedAt: Date.now() });
}

export async function deleteSite(siteId: string) {
  const findings = await db.findings.where("siteId").equals(siteId).toArray();
  const photos = await db.photos.where("siteId").equals(siteId).toArray();
  await db.photos.bulkDelete(photos.map((p) => p.id));
  await db.findings.bulkDelete(findings.map((f) => f.id));
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
  changes: Partial<Pick<Finding, "note" | "location" | "defectType" | "level">>,
) {
  await db.findings.update(findingId, { ...changes, updatedAt: Date.now() });
}

// Moves a finding to a new manual sort position. `order` is typically the
// midpoint between its new neighbours' own order values (fractional
// indexing), so a reorder only ever writes the one row that moved.
export async function reorderFinding(findingId: string, order: number) {
  await db.findings.update(findingId, { order });
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

export async function addPhoto(findingId: string, siteId: string, blob: Blob) {
  const existing = await db.photos.where("findingId").equals(findingId).count();
  const photo: Photo = {
    id: uid(),
    findingId,
    siteId,
    blob,
    takenAt: Date.now(),
    order: existing,
  };
  await db.photos.add(photo);
  await db.findings.update(findingId, { updatedAt: Date.now() });
  return photo;
}

export async function listPhotos(findingId: string) {
  const photos = await db.photos.where("findingId").equals(findingId).toArray();
  return photos.sort((a, b) => a.order - b.order);
}

export async function deletePhoto(photoId: string) {
  await db.photos.delete(photoId);
}
