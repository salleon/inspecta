import type { SpfEdition, SpfStair, SpfSystem, SpfType, StairDoor, StairOnce, StairSection, StairTest, StairTestKind, Tick } from "../db/types";

// Stair pressurisation testing (design canvas StairTestSimple, StairTestRules).
// The system is set once per site: the AS 1668.1 edition it was built to and
// its type decide the doors open and the pass limits, whatever the test.
// Servicing follows AS 1851-2012. A test is a list of sections, only the
// readings it needs: three at every door down the stair, the rest once a
// stair. Anything not tested is left blank on the report.

export const EDITIONS: SpfEdition[] = ["1979", "1991", "1998", "2015"];

// the system types each edition has
export const TYPES: Record<SpfEdition, SpfType[]> = {
  "1979": ["One test"],
  "1991": ["Purge", "Zone"],
  "1998": ["Purge", "Shutdown", "Zone"],
  "2015": ["Zone", "Purge", "Shutdown"],
};

// the edition's word for a level
const WORD: Record<SpfEdition, string> = { "1979": "storey", "1991": "floor", "1998": "compartment", "2015": "compartment" };

export const defaultSystem = (): SpfSystem => ({ edition: "1998", type: "Purge", stairs: [], notes: "" });

export const newStair = (): SpfStair => ({ id: crypto.randomUUID(), name: "", from: "", to: "", extra: [], fan: "" });

// a type the edition has (the first, if it's changed to one that hasn't)
export const typeFor = (edition: SpfEdition, type: SpfType): SpfType => (TYPES[edition].includes(type) ? type : TYPES[edition][0]);

// ---- levels ----

// "G" 0, "B2" -2, "12" 12; null if it isn't one of those
export function levelNumber(label: string): number | null {
  const t = label.trim().toUpperCase();
  if (/^(G|GF|GROUND)$/.test(t)) return 0;
  const b = /^B(\d+)$/.exec(t);
  if (b) return -Number(b[1]);
  const l = /^L?(\d+)$/.exec(t);
  return l ? Number(l[1]) : null;
}

export const levelLabel = (n: number) => (n === 0 ? "G" : n < 0 ? `B${-n}` : String(n));

// a stair's doors, top to bottom: its extra doors (plant room, roof…)
// first, then each level from the top down to the bottom
export function stairLevels(stair: Pick<SpfStair, "from" | "to" | "extra">): string[] {
  const extra = stair.extra.map((e) => e.trim()).filter(Boolean);
  const a = levelNumber(stair.from);
  const b = levelNumber(stair.to);
  let levels: string[];
  if (a !== null && b !== null) {
    const top = Math.max(a, b);
    const bottom = Math.min(a, b);
    levels = [];
    for (let n = top; n >= bottom && levels.length < 300; n--) levels.push(levelLabel(n));
  } else levels = [stair.to.trim(), stair.from.trim()].filter(Boolean);
  return [...extra.filter((e) => !levels.includes(e)), ...levels];
}

export const stairName = (stair: SpfStair, i: number) => `Stair ${i + 1}${stair.name.trim() ? ` · ${stair.name.trim()}` : ""}`;
export const stairRange = (stair: SpfStair) => {
  const levels = stairLevels(stair);
  return levels.length ? `${stair.from.trim() || levels[levels.length - 1]}–${stair.to.trim() || levels[0]}` : "No levels yet";
};

// ---- the rules (StairTestRules board) ----

// zone systems open only the fire level and the discharge doors
const noAdjacent = (sys: Pick<SpfSystem, "type">) => sys.type === "Zone";

// the other door open with a level's, for its velocity: the one above, or
// for the top door the one below; none for a zone system
export function adjacentDoor(levels: string[], i: number, sys: Pick<SpfSystem, "type">): string {
  if (noAdjacent(sys) || levels.length < 2) return "";
  return i > 0 ? levels[i - 1] : levels[1];
}

// the doors open for the velocity tests, as dot points
export function doorsOpen(sys: Pick<SpfSystem, "edition" | "type">): string[] {
  const w = WORD[sys.edition];
  const W = w[0].toUpperCase() + w.slice(1);
  if (sys.edition === "1979") return ["This storey", "The storey above (top level: the one below)", "Discharge doors"];
  if (sys.type === "Zone") return [`Fire ${w} only`, "Discharge doors", `Door force: with the ${w} above open`];
  if (sys.edition === "2015") return ["Fire compartment", "One adjoining: above, below or adjacent (the app picks above)", "Discharge doors", "Every stair serving it, at once"];
  return [`Fire ${w}`, `${W} above (top level: the one below)`, "Discharge doors"];
}

export interface Limits {
  vel: number; // m/s, at least
  force: number; // N, at most
  rest: number; // s, at most
  noiseStair: number; // dB(A), at most
  noiseOcc: number | null; // dB(A), at most (1998 on)
  pa: number | null; // Pa, at most (1979 only); otherwise just recorded
}

export const limits = (sys: Pick<SpfSystem, "edition">): Limits => ({
  vel: 1,
  force: 110,
  rest: sys.edition === "1979" ? 60 : 10,
  noiseStair: 80,
  noiseOcc: sys.edition === "1979" || sys.edition === "1991" ? null : 65,
  pa: sys.edition === "1979" ? 50 : null,
});

// the six limits as tiles: [value, label, applies]
export function limitTiles(sys: Pick<SpfSystem, "edition">): [string, string, boolean][] {
  const l = limits(sys);
  return [
    [`≥ ${l.vel} m/s`, "Velocity", true],
    [`≤ ${l.force} N`, "Door force", true],
    [`≤ ${l.rest} s`, sys.edition === "1979" ? "Restoration (15 s best)" : "Restoration", true],
    [`≤ ${l.noiseStair} dB(A)`, "Noise, stair", true],
    l.noiseOcc === null ? ["—", "Noise, occupied", false] : [`≤ ${l.noiseOcc} dB(A)`, "Noise, occupied", true],
    l.pa === null ? ["Recorded", "Stair, doors closed", false] : [`≤ ${l.pa} Pa`, "Stair, doors closed", true],
  ];
}

export const systemLine = (sys: SpfSystem | undefined) =>
  !sys ? "Not set up yet" : `${sys.type === "One test" ? "" : `${sys.type} · `}built to AS 1668.1-${sys.edition} · ${sys.stairs.length} stair${sys.stairs.length === 1 ? "" : "s"}`;

// ---- the tests ----

export const KIND_LABEL: Record<StairTestKind, string> = { quick: "Three-monthly check", annual: "Annual Testing", comm: "Commissioning", custom: "Custom" };
export const KIND_HINT: Record<StairTestKind, string> = {
  quick: "AS 1851 three-monthly: start it from the fire panel and tick it works. No gauges.",
  annual: "AS 1851 annual: every door's velocity, force and latching; noise and restoration once; fan checks.",
  comm: "AS 1668.1 in full, to the edition it's built to: every reading.",
  custom: "Pick only what you're doing today, e.g. velocities after a fan repair.",
};
export const KINDS: StairTestKind[] = ["quick", "annual", "comm", "custom"];
export const KIND_SECTIONS: Record<Exclude<StairTestKind, "custom">, StairSection[]> = {
  quick: ["quick"],
  annual: ["vel", "force", "latch", "noise", "rest", "fan"],
  comm: ["vel", "force", "latch", "noise", "rest", "pa", "fan"],
};
// the order sections are listed in, and the ones Custom can pick
export const ALL_SECTIONS: StairSection[] = ["vel", "force", "latch", "noise", "rest", "pa", "fan", "quick"];
export const CUSTOM_SECTIONS: StairSection[] = ["vel", "force", "latch", "noise", "rest", "pa", "fan"];

export interface SectionInfo {
  name: string;
  every: boolean; // a reading at every door
  unit?: string;
  once?: string; // what "once" means for it
  column?: string; // the report's column heading
}
export const SECTION: Record<StairSection, SectionInfo> = {
  vel: { name: "Velocity", every: true, unit: "m/s", column: "Average velocity m/s (min 1)" },
  force: { name: "Door force", every: true, unit: "N", column: "Door opening force N (max 110)" },
  latch: { name: "Door closes & latches", every: true, column: "Door closes and latches" },
  noise: { name: "Noise", every: false, once: "the noisiest doors" },
  rest: { name: "Pressure restoration", every: false, once: "the slowest door" },
  pa: { name: "Stair pressure, doors closed", every: false, once: "once" },
  fan: { name: "Fan checks", every: false, once: "per fan" },
  quick: { name: "Three-monthly check", every: false, once: "ticks only" },
};

// AS 1851-2012 functionality record (Figure I4.3) and annual items
export const FAN_CHECKS: [string, string][] = [
  ["off", "Normally off"],
  ["trip", "Runs on fire trip (from a detector)"],
  ["smoke", "Stops with smoke in the airstream"],
  ["reset", "Resets when the smoke clears"],
  ["panel", "Fire fan panel override works"],
  ["brigade", "Fire brigade switch starts and stops it"],
  ["lamps", "Indicator lamps change"],
  ["relief", "Air relief works"],
];
// AS 1851-2012 Table 13.4.2.2
export const QUICK_CHECKS: [string, string][] = [
  ["fire", "Fans, dampers and lamps go to fire mode (from the fire panel)"],
  ["noise", "No excessive noise"],
  ["doors", "Doors open easily"],
  ["air", "Air moves out through a selected door (ribbon)"],
  ["normal", "Back to normal afterwards"],
];

export function sectionsFor(kind: StairTestKind, picked: StairSection[] = []): StairSection[] {
  const list = kind === "custom" ? picked : KIND_SECTIONS[kind];
  return ALL_SECTIONS.filter((s) => list.includes(s));
}

export function newStairTest(siteId: string, kind: StairTestKind, sections: StairSection[], testedBy = ""): Omit<StairTest, "id" | "order" | "createdAt" | "updatedAt"> {
  return { siteId, kind, sections: sectionsFor(kind, sections), testedAt: Date.now(), testedBy, doors: {}, once: {}, notes: [] };
}

const num = (v: string | undefined) => {
  const t = (v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// does a reading fail? null when there's nothing to judge
export function doorFails(section: "vel" | "force" | "latch", door: StairDoor | undefined, sys: Pick<SpfSystem, "edition">): boolean | null {
  const l = limits(sys);
  if (section === "latch") return door?.latch ? door.latch === "n" : null;
  const n = num(door?.[section]);
  if (n === null) return null;
  return section === "vel" ? n < l.vel : n > l.force;
}

export const doorValue = (section: "vel" | "force" | "latch", door: StairDoor | undefined): string =>
  section === "latch" ? (door?.latch === "y" ? "Yes" : door?.latch === "n" ? "No" : "") : (door?.[section] ?? "").trim();

// a stair's doors done, and failing, for one reading
export function doorStats(test: StairTest, stair: SpfStair, section: "vel" | "force" | "latch", sys: Pick<SpfSystem, "edition">) {
  const levels = stairLevels(stair);
  const doors = test.doors[stair.id] ?? {};
  let done = 0;
  let fails = 0;
  for (const l of levels) {
    if (!doorValue(section, doors[l])) continue;
    done++;
    if (doorFails(section, doors[l], sys)) fails++;
  }
  return { done, fails, total: levels.length };
}

export const tickCount = (ticks: Record<string, Tick> | undefined) => Object.values(ticks ?? {}).filter(Boolean).length;

// a stair's once-off section: done, and its result in a few words
export function onceStatus(section: StairSection, once: StairOnce | undefined, sys: Pick<SpfSystem, "edition">): { done: boolean; text: string; fail: boolean } {
  const l = limits(sys);
  const o = once ?? {};
  if (section === "noise") {
    const s = num(o.noiseStair);
    const occ = num(o.noiseOcc);
    if (s === null && occ === null) return { done: false, text: "", fail: false };
    const fail = (s !== null && s > l.noiseStair) || (occ !== null && l.noiseOcc !== null && occ > l.noiseOcc);
    return { done: s !== null, text: `${s ?? occ} dB(A) ${fail ? "✗" : "✓"}`, fail };
  }
  if (section === "rest") {
    const t = num(o.restTime);
    if (t === null) return { done: false, text: "", fail: false };
    return { done: true, text: `${t} s ${t > l.rest ? "✗" : "✓"}`, fail: t > l.rest };
  }
  if (section === "pa") {
    const p = num(o.pa);
    if (p === null) return { done: false, text: "", fail: false };
    const fail = l.pa !== null && p > l.pa;
    return { done: true, text: `${p} Pa${l.pa === null ? "" : fail ? " ✗" : " ✓"}`, fail };
  }
  const checks = section === "fan" ? FAN_CHECKS : QUICK_CHECKS;
  const ticks = (section === "fan" ? o.fan : o.quick) ?? {};
  const n = tickCount(ticks);
  if (!n) return { done: false, text: "", fail: false };
  const no = Object.values(ticks).filter((t) => t === "n").length;
  return { done: n === checks.length, text: no ? `${no} failed` : `${n} of ${checks.length} ✓`, fail: no > 0 };
}

// the stair test's line on the tests list: doors done and fails, or ticks
export function stairTestSummary(test: StairTest, sys: SpfSystem | undefined): { text: string; fail: boolean } {
  if (!sys || !sys.stairs.length) return { text: "Set up the system to start", fail: false };
  const every = test.sections.filter((s): s is "vel" | "force" | "latch" => SECTION[s].every);
  if (every.length) {
    let done = 0;
    let total = 0;
    let fails = 0;
    for (const stair of sys.stairs) {
      const levels = stairLevels(stair);
      const doors = test.doors[stair.id] ?? {};
      total += levels.length;
      for (const l of levels) {
        const d = doors[l];
        if (every.some((s) => doorValue(s, d))) done++;
        if (every.some((s) => doorFails(s, d, sys))) fails++;
      }
    }
    if (!done) return { text: "No readings yet", fail: false };
    return { text: `${done} of ${total} doors${fails ? ` · ${fails} fail${fails === 1 ? "" : "s"}` : " · all pass"}`, fail: fails > 0 };
  }
  const statuses = sys.stairs.flatMap((st) => test.sections.map((s) => onceStatus(s, test.once[st.id], sys)));
  if (!statuses.some((s) => s.text)) return { text: "No readings yet", fail: false };
  const fail = statuses.some((s) => s.fail);
  return { text: fail ? "Something failed" : statuses.every((s) => s.done) ? "All ticked · passed" : "Started", fail };
}

// has anything been entered (the empty ones stay off the site's report)
export function stairTestHasData(test: StairTest): boolean {
  const anyDoor = Object.values(test.doors).some((byLevel) => Object.values(byLevel).some((d) => !!(d.vel?.trim() || d.force?.trim() || d.latch)));
  const anyOnce = Object.values(test.once).some(
    (o) => !!(o.noiseStair?.trim() || o.noiseOcc?.trim() || o.restTime?.trim() || o.pa?.trim() || tickCount(o.fan) || tickCount(o.quick)),
  );
  return anyDoor || anyOnce || test.notes.some((n) => n.text.trim());
}

export const stairFileName = (site: { name: string }, ext: "pdf" | "xlsx", at = Date.now()) =>
  `${(site.name || "Site").replace(/[\\/:*?"<>|]/g, " ").trim()} – Stair pressurisation – ${new Date(at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.${ext}`;

export const testsFileName = (site: { name: string }, ext: "pdf" | "xlsx", at = Date.now()) =>
  `${(site.name || "Site").replace(/[\\/:*?"<>|]/g, " ").trim()} – Tests – ${new Date(at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.${ext}`;
