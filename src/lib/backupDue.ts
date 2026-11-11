import type { Site } from "../db/types";
import { siteBackupState } from "./backupNames";

// When to nudge for a backup: the Settings cog gets an amber dot once a
// site has something not in any backup and hasn't been backed up for a
// month (or, never backed up, was added over a month ago).
export const LAST_BACKUP_KEY = "inspecta.lastBackup";
export const BACKUP_INTERVAL = 30 * 24 * 60 * 60 * 1000;

export function backupDue(sites: Pick<Site, "createdAt" | "updatedAt" | "changedAt" | "backedUpAt">[], now: number): boolean {
  return sites.some((site) => siteBackupState(site) !== "saved" && now - (site.backedUpAt || site.createdAt) > BACKUP_INTERVAL);
}

// when the last backup of any kind was made on this phone (not whether
// the file was kept), for Settings
export function lastBackupAt(): number {
  try {
    return Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0;
  } catch {
    return 0;
  }
}
