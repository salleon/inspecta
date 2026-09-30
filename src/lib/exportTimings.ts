// How long each stage of the last PDF / Excel / photos export took on this
// phone, shown in Admin, so a slow export on someone's phone can be
// pinned down to the stage that's slow. Kept in this phone's storage only.

const KEY = "inspecta.lastExportTimings";

export interface ExportTimings {
  at: number;
  kind: string;
  photos: number;
  copiesReady: number; // photos whose export copy was already made
  stages: { name: string; ms: number }[];
  totalMs: number;
}

export function startExportTimer(kind: string, photos: number, copiesReady: number) {
  const start = performance.now();
  let last = start;
  const stages: { name: string; ms: number }[] = [];
  return {
    // the stage that has just finished
    mark(name: string) {
      const now = performance.now();
      stages.push({ name, ms: Math.round(now - last) });
      last = now;
    },
    finish() {
      const timings: ExportTimings = { at: Date.now(), kind, photos, copiesReady, stages, totalMs: Math.round(performance.now() - start) };
      try {
        localStorage.setItem(KEY, JSON.stringify(timings));
      } catch {
        // storage unavailable: just not recorded
      }
    },
  };
}

export function lastExportTimings(): ExportTimings | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ExportTimings) : null;
  } catch {
    return null;
  }
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

// e.g. "Excel · 40 photos (40 ready) · 12.3 s: photos 8.1 s, building 2.0 s, saving 2.2 s"
export function describeTimings(t: ExportTimings): string {
  return `${t.kind} · ${t.photos} photo${t.photos === 1 ? "" : "s"} (${t.copiesReady} ready) · ${secs(t.totalMs)}: ${t.stages.map((s) => `${s.name} ${secs(s.ms)}`).join(", ")}`;
}
