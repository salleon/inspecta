import type { Finding, FlowTest, Photo, Site, SiteReport, StairTest } from "../db/types";

// Bringing a site from a backup together with the copy already on this
// phone (Restore → Merge), or in beside it as a separate site (Keep both).
// Pure: works out what to write; lib/backup and db do the writing.
//
// Merge never deletes anything on this phone:
// - a finding, photo or test only in the backup is added; one only on the
//   phone is kept;
// - one on both that differs: the phone's last backup is taken as the
//   point the two copies parted. Changed on one side only since then, that
//   side's copy is kept. Changed on both: for a finding the later edit is
//   kept; for a test (whose readings would otherwise be lost) both are
//   kept, the backup's as an extra test marked "From backup";
// - a photo's mark-up follows its finding: when the backup's copy of the
//   finding is taken, so is the backup's mark-up;
// - the site's name, address and stair setup come from whichever copy
//   changed later; customised reports are merged one by one.
// Running the same merge again changes nothing, so a merge that stopped
// part way is finished by running it again.

export type PhotoMeta = Omit<Photo, "blob" | "marked">;

export interface SiteRecords {
  site: Site;
  findings: Finding[];
  flowTests: FlowTest[];
  stairTests: StairTest[];
  photos: PhotoMeta[];
}

export interface MergePlan {
  // the site as it will be (restoreIncomplete and backedUpAt are left to db)
  site: Site;
  // findings and tests to write: added, updated, or the backup's copy kept beside the phone's
  findings: Finding[];
  flowTests: FlowTest[];
  stairTests: StairTest[];
  // the backup's photos to add (order moved on if it's taken on the phone)
  addPhotos: PhotoMeta[];
  // the backup's photos whose mark-up replaces the phone's
  replacePhotos: PhotoMeta[];
  counts: {
    findingsAdded: number;
    findingsUpdated: number;
    testsAdded: number;
    testsUpdated: number;
    // tests changed on both: the backup's copy added beside the phone's
    testsKeptBoth: number;
    photosAdded: number;
    photosUpdated: number;
    detailsUpdated: boolean;
    reportsUpdated: number;
    // what's only on this phone, kept as it is
    phoneOnlyFindings: number;
    phoneOnlyPhotos: number;
    phoneOnlyTests: number;
  };
}

// a record's content, whatever order its keys were written in, without
// the fields that only say when it was saved or where it's filed
function content(value: unknown, skip: string[] = []): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object" && !(v instanceof Blob)) {
      return Object.fromEntries(
        Object.keys(v)
          .filter((k) => !skip.includes(k) && (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

const sameRecord = (a: object, b: object) => content(a, ["updatedAt"]) === content(b, ["updatedAt"]);

// "phone", "backup" or "both": which copy to keep of a record that's on
// both and differs. base: when the phone was last backed up (or restored),
// taken as when the two copies parted.
function pick(phone: { updatedAt: number }, backup: { updatedAt: number }, base: number): "phone" | "backup" | "both" {
  const here = phone.updatedAt > base;
  const there = backup.updatedAt > base;
  if (here && there) return "both";
  if (here) return "phone";
  if (there) return "backup";
  return backup.updatedAt > phone.updatedAt ? "backup" : "phone";
}

// the id of the backup's copy of a test kept beside the phone's: the same
// each time for the same backup copy, so merging again doesn't add another
export const keptCopyId = (testId: string, backupUpdatedAt: number) => `${testId}_b${backupUpdatedAt}`;

const later = (phone: { updatedAt: number }, backup: { updatedAt: number }) => backup.updatedAt > phone.updatedAt;

const siteDetails = (s: Site) => ({ name: s.name, address: s.address, kind: s.kind, spf: s.spf });

function mergeTests<T extends FlowTest | StairTest>(
  phone: T[],
  backup: T[],
  base: number,
  copy: (t: T) => T,
  counts: MergePlan["counts"],
): T[] {
  const here = new Map(phone.map((t) => [t.id, t]));
  const there = new Set(backup.map((t) => t.id));
  const out: T[] = [];
  for (const b of backup) {
    const p = here.get(b.id);
    if (!p) {
      out.push(b);
      counts.testsAdded++;
      continue;
    }
    if (sameRecord(p, b)) continue;
    const which = pick(p, b, base);
    if (which === "backup") {
      out.push(b);
      counts.testsUpdated++;
    } else if (which === "both" && !here.has(keptCopyId(b.id, b.updatedAt))) {
      out.push(copy(b));
      counts.testsKeptBoth++;
    }
  }
  counts.phoneOnlyTests += phone.filter((t) => !there.has(t.id) && !/_b\d+$/.test(t.id)).length;
  return out;
}

export function planMerge(phone: SiteRecords, backup: SiteRecords, now = Date.now()): MergePlan {
  const base = phone.site.backedUpAt ?? 0;
  const counts: MergePlan["counts"] = {
    findingsAdded: 0,
    findingsUpdated: 0,
    testsAdded: 0,
    testsUpdated: 0,
    testsKeptBoth: 0,
    photosAdded: 0,
    photosUpdated: 0,
    detailsUpdated: false,
    reportsUpdated: 0,
    phoneOnlyFindings: 0,
    phoneOnlyPhotos: 0,
    phoneOnlyTests: 0,
  };

  // findings: changed on both, the later edit is kept
  const phoneFindings = new Map(phone.findings.map((f) => [f.id, f]));
  const backupFindingIds = new Set(backup.findings.map((f) => f.id));
  const findings: Finding[] = [];
  // the findings whose backup copy is taken (its photos' mark-up comes too)
  const takenFromBackup = new Set<string>();
  for (const b of backup.findings) {
    const p = phoneFindings.get(b.id);
    if (!p) {
      findings.push({ ...b, siteId: phone.site.id });
      counts.findingsAdded++;
      takenFromBackup.add(b.id);
    } else if (!sameRecord(p, b)) {
      const which = pick(p, b, base);
      if (which === "backup" || (which === "both" && later(p, b))) {
        findings.push({ ...b, siteId: phone.site.id });
        counts.findingsUpdated++;
        takenFromBackup.add(b.id);
      }
    }
  }
  counts.phoneOnlyFindings = phone.findings.filter((f) => !backupFindingIds.has(f.id)).length;

  // photos: the backup's that aren't here are added, after the finding's
  // own photos if their place is taken
  const phonePhotos = new Map(phone.photos.map((p) => [p.id, p]));
  const backupPhotoIds = new Set(backup.photos.map((p) => p.id));
  const knownFindings = new Set([...phone.findings.map((f) => f.id), ...findings.map((f) => f.id)]);
  const orders = new Map<string, Set<number>>();
  for (const p of phone.photos) {
    if (!orders.has(p.findingId)) orders.set(p.findingId, new Set());
    orders.get(p.findingId)!.add(p.order);
  }
  const addPhotos: PhotoMeta[] = [];
  const replacePhotos: PhotoMeta[] = [];
  for (const b of [...backup.photos].sort((x, y) => x.order - y.order)) {
    const p = phonePhotos.get(b.id);
    if (!p) {
      if (!knownFindings.has(b.findingId)) continue;
      const taken = orders.get(b.findingId) ?? new Set<number>();
      orders.set(b.findingId, taken);
      const order = taken.has(b.order) ? Math.max(...taken) + 1 : b.order;
      taken.add(order);
      addPhotos.push({ ...b, siteId: phone.site.id, order });
      counts.photosAdded++;
    } else if (takenFromBackup.has(b.findingId) && content(p.marks ?? []) !== content(b.marks ?? [])) {
      replacePhotos.push({ ...b, siteId: phone.site.id, order: p.order });
      counts.photosUpdated++;
    }
  }
  counts.phoneOnlyPhotos = phone.photos.filter((p) => !backupPhotoIds.has(p.id)).length;

  // tests: changed on both, the backup's copy is kept beside the phone's
  const flowTests = mergeTests(
    phone.flowTests,
    backup.flowTests.map((t) => ({ ...t, siteId: phone.site.id })),
    base,
    (t) => ({ ...t, id: keptCopyId(t.id, t.updatedAt), fromBackup: now }),
    counts,
  );
  const stairTests = mergeTests(
    phone.stairTests,
    backup.stairTests.map((t) => ({ ...t, siteId: phone.site.id })),
    base,
    (t) => ({ ...t, id: keptCopyId(t.id, t.updatedAt), fromBackup: now }),
    counts,
  );

  // the site: details from whichever changed later, reports one by one
  const changedAt = (s: Site) => s.changedAt ?? s.updatedAt;
  let site: Site = { ...phone.site };
  if (content(siteDetails(phone.site)) !== content(siteDetails(backup.site)) && changedAt(backup.site) > changedAt(phone.site)) {
    site = { ...site, ...siteDetails(backup.site) };
    if (backup.site.spf === undefined) delete site.spf;
    counts.detailsUpdated = true;
  }
  const reports = new Map<string, SiteReport>((phone.site.reports ?? []).map((r) => [r.id, r]));
  for (const r of backup.site.reports ?? []) {
    const p = reports.get(r.id);
    if (!p || (!sameRecord(p, r) && r.updatedAt > p.updatedAt)) {
      reports.set(r.id, r);
      counts.reportsUpdated++;
    }
  }
  if (counts.reportsUpdated) site.reports = [...reports.values()];

  const changes =
    findings.length + flowTests.length + stairTests.length + addPhotos.length + replacePhotos.length + counts.reportsUpdated + (counts.detailsUpdated ? 1 : 0);
  if (changes) {
    // a merged site counts as changed: what's on the phone now isn't in any one backup
    site.changedAt = now;
    site.updatedAt = Math.max(phone.site.updatedAt, backup.site.updatedAt);
  }
  return { site, findings, flowTests, stairTests, addPhotos, replacePhotos, counts };
}

// the merge would change something on this phone
export const mergeChangesAnything = (m: MergePlan) =>
  m.findings.length + m.flowTests.length + m.stairTests.length + m.addPhotos.length + m.replacePhotos.length + m.counts.reportsUpdated > 0 || m.counts.detailsUpdated;

// ---- Keep both ----

// The id something from the backup gets in its separate copy of the site:
// worked out from the copy's id, so a copy that stopped part way can be
// finished from the same backup.
export const copiedId = (copySiteId: string, id: string) => `${copySiteId}_${id}`;

export const COPY_SUFFIX = " (from backup)";

// The backup's copy of a site as a site of its own, beside the phone's:
// everything with new ids, so nothing on the phone is touched.
export function copyRecords(backup: SiteRecords, copySiteId: string, now = Date.now()): SiteRecords {
  const id = (x: string) => copiedId(copySiteId, x);
  const { backedUpAt: _b, restoreIncomplete: _r, ...site } = backup.site;
  return {
    site: {
      ...site,
      id: copySiteId,
      name: `${backup.site.name || "Untitled"}${COPY_SUFFIX}`,
      copyOf: backup.site.id,
      createdAt: now,
      updatedAt: now,
      changedAt: now,
      reports: backup.site.reports?.map((r) => ({ ...r, id: id(r.id), findingIds: r.findingIds.map(id) })),
    },
    findings: backup.findings.map((f) => ({ ...f, id: id(f.id), siteId: copySiteId })),
    flowTests: backup.flowTests.map((t) => ({ ...t, id: id(t.id), siteId: copySiteId })),
    stairTests: backup.stairTests.map((t) => ({ ...t, id: id(t.id), siteId: copySiteId })),
    photos: backup.photos.map((p) => ({ ...p, id: id(p.id), findingId: id(p.findingId), siteId: copySiteId })),
  };
}
