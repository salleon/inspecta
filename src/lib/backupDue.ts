// When to nudge for a backup: the Settings cog gets an amber dot once there's
// something worth keeping and nothing has been backed up for two weeks.
export const LAST_BACKUP_KEY = "inspecta.lastBackup";
const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

// lastBackup: when the last backup was made (0 = never).
// oldestSite: when the oldest site was added (0 = no sites).
export function backupDue(lastBackup: number, oldestSite: number, now: number): boolean {
  if (!oldestSite) return false;
  return now - (lastBackup || oldestSite) > TWO_WEEKS;
}

export function lastBackupAt(): number {
  try {
    return Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0;
  } catch {
    return 0;
  }
}
