import type { Finding } from "../db/types";

// Location suggestions for the finding screen: the locations already typed
// on other findings of the SAME site, so "Plant room" only has to be typed
// once per site. Built from the findings themselves (no separate list to
// manage), so fixing or deleting a finding updates them automatically.

const MAX_SUGGESTIONS = 3;

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// Distinct locations, most recently used first. "Plant room", "plant room"
// and "Plant Room " count as one, keeping the most recent spelling.
export function siteLocations(findings: Finding[], excludeFindingId?: string): string[] {
  const latest = new Map<string, { text: string; at: number }>();
  for (const f of findings) {
    if (f.id === excludeFindingId) continue;
    const text = f.location.trim().replace(/\s+/g, " ");
    if (!text) continue;
    const key = norm(text);
    const seen = latest.get(key);
    if (!seen || f.updatedAt > seen.at) latest.set(key, { text, at: f.updatedAt });
  }
  return [...latest.values()].sort((a, b) => b.at - a.at).map((l) => l.text);
}

export interface Suggestion {
  text: string;
  // where the typed text matches, for highlighting (-1: nothing typed yet)
  matchAt: number;
  matchLength: number;
}

// Up to MAX_SUGGESTIONS for what's been typed so far: nothing typed shows
// the most recent; otherwise locations that start with it come first, then
// ones that contain it, each most recent first. An exact match is left out
// (it's already in the box).
export function suggestLocations(locations: string[], typed: string, max = MAX_SUGGESTIONS): Suggestion[] {
  const q = norm(typed);
  if (!q) return locations.slice(0, max).map((text) => ({ text, matchAt: -1, matchLength: 0 }));
  const starts: Suggestion[] = [];
  const contains: Suggestion[] = [];
  for (const text of locations) {
    const t = text.toLowerCase();
    if (t === q) continue;
    const at = t.indexOf(q);
    if (at === 0) starts.push({ text, matchAt: 0, matchLength: q.length });
    else if (at > 0) contains.push({ text, matchAt: at, matchLength: q.length });
  }
  return [...starts, ...contains].slice(0, max);
}
