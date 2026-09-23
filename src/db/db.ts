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
  }
}

export const db = new InspectaDB();

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

export async function touchSite(siteId: string) {
  await db.sites.update(siteId, { updatedAt: Date.now() });
}

export async function createFinding(siteId: string) {
  const now = Date.now();
  const finding: Finding = {
    id: uid(),
    siteId,
    note: "",
    location: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.findings.add(finding);
  await touchSite(siteId);
  return finding;
}

export async function updateFinding(
  findingId: string,
  changes: Partial<Pick<Finding, "note" | "location">>,
) {
  await db.findings.update(findingId, { ...changes, updatedAt: Date.now() });
}

export async function deleteFinding(findingId: string) {
  const photos = await db.photos.where("findingId").equals(findingId).toArray();
  await db.photos.bulkDelete(photos.map((p) => p.id));
  await db.findings.delete(findingId);
}

export async function listFindings(siteId: string) {
  const findings = await db.findings.where("siteId").equals(siteId).toArray();
  return findings.sort((a, b) => b.createdAt - a.createdAt);
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

export async function lastPhoto(findingId: string) {
  const photos = await listPhotos(findingId);
  return photos[photos.length - 1];
}

export async function photoCount(findingId: string) {
  return db.photos.where("findingId").equals(findingId).count();
}
