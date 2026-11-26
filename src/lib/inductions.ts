// Site inductions (Settings → Site inductions): the induction numbers the
// inspector has been given for the sites they visit, with when each runs
// out. A group (e.g. Mirvac) can hold one code for all its sites, or stand
// on its own with just that code; a site in it can still have its own.
// Kept on the phone (db inductions / inductionGroups) and in backups.

export interface InductionGroup {
  id: string;
  name: string;
  colour: string;
  // the group's shared induction number ("" for none)
  code: string;
  // yyyy-mm-dd; undefined for no expiry
  expires?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Induction {
  id: string;
  // the site's name, as the inspector knows it
  name: string;
  groupId?: string;
  // uses the group's code (when the group has one) instead of its own
  useGroup: boolean;
  code: string;
  expires?: string;
  createdAt: number;
  updatedAt: number;
}

export const GROUP_COLOURS = ["#5aa9ff", "#c792ea", "#7bd88f", "#ff8fb1", "#f7b977", "#6fd3f0"];

// The colour a due date shows as it gets closer.
export type DueStage = "far" | "60" | "30" | "7" | "gone" | "none";

export const DUE_COLOURS: Record<DueStage, string> = {
  far: "#2ec4b6",
  "60": "#b6d96a",
  "30": "#f7b977",
  "7": "#ff8f5a",
  gone: "#ff6b6b",
  none: "#8ba0b5",
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86400000;

export function dayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function formatDay(s: string): string {
  const d = parseDay(s);
  return d ? `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` : s;
}

// whole days from today until the date (negative once it's passed)
export function daysLeft(expires: string, now: Date = new Date()): number {
  const d = parseDay(expires);
  if (!d) return Infinity;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / DAY);
}

// more than 60 days, 31–60, 8–30, 1–7, due today or expired
export function dueStage(expires: string | undefined, now: Date = new Date()): DueStage {
  if (!expires) return "none";
  const n = daysLeft(expires, now);
  if (n > 60) return "far";
  if (n > 30) return "60";
  if (n > 7) return "30";
  if (n > 0) return "7";
  return "gone";
}

export function dueText(expires: string | undefined, now: Date = new Date()): string {
  if (!expires) return "No expiry";
  const n = daysLeft(expires, now);
  if (n > 60) return `Until ${formatDay(expires)}`;
  if (n > 1) return `${n} days left`;
  if (n === 1) return "Tomorrow";
  if (n === 0) return "Due today";
  return `Expired ${-n} day${n === -1 ? "" : "s"} ago`;
}

// a site uses its group's code when it's set to and the group has one
export function usesGroup(site: Induction, groups: InductionGroup[]): InductionGroup | undefined {
  if (!site.useGroup || !site.groupId) return undefined;
  const g = groups.find((x) => x.id === site.groupId);
  return g?.code ? g : undefined;
}

// every code that can run out: each group's, and each site's own
export function expiries(groups: InductionGroup[], sites: Induction[]): string[] {
  return [...groups.filter((g) => g.code && g.expires).map((g) => g.expires!), ...sites.filter((s) => !usesGroup(s, groups) && s.code && s.expires).map((s) => s.expires!)];
}

// the Settings row's hint: "4 sites · 1 expired"
export function inductionsHint(groups: InductionGroup[], sites: Induction[], now: Date = new Date()): { text: string; expired: number } {
  const standalone = groups.filter((g) => g.code && !sites.some((s) => s.groupId === g.id)).length;
  const n = sites.length + standalone;
  if (!n) return { text: "None yet", expired: 0 };
  const left = expiries(groups, sites).map((e) => daysLeft(e, now));
  const expired = left.filter((d) => d < 0).length;
  const soon = left.filter((d) => d >= 0 && d <= 30).length;
  const what = `${n} ${n === 1 ? "induction" : "inductions"}`;
  if (expired) return { text: `${what} · ${expired} expired`, expired };
  if (soon) return { text: `${what} · ${soon} due within 30 days`, expired: 0 };
  return { text: what, expired: 0 };
}

// soonest first; no expiry last
export function bySoonest<T>(list: T[], expires: (x: T) => string | undefined, now: Date = new Date()): T[] {
  const key = (x: T) => {
    const e = expires(x);
    return e ? daysLeft(e, now) : Infinity;
  };
  return [...list].sort((a, b) => key(a) - key(b));
}

// a group's soonest date: its own code's, or any of its sites' own
export function groupSoonest(group: InductionGroup, sites: Induction[], groups: InductionGroup[], now: Date = new Date()): number {
  const days = [
    group.code && group.expires ? daysLeft(group.expires, now) : Infinity,
    ...sites.filter((s) => s.groupId === group.id && !usesGroup(s, groups) && s.expires).map((s) => daysLeft(s.expires!, now)),
  ];
  return Math.min(...days);
}

// Restore: records from a backup merged into the phone's by id; the later
// edit of one on both wins. Returns what to write and how many changed.
export function mergeInductions<T extends { id: string; updatedAt: number }>(mine: T[], theirs: T[]): { write: T[]; changed: number } {
  const byId = new Map(mine.map((x) => [x.id, x]));
  const write = theirs.filter((x) => {
    const here = byId.get(x.id);
    return !here || x.updatedAt > here.updatedAt;
  });
  return { write, changed: write.length };
}
