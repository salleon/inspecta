import type { DemandPoint, FlowKind, FlowReading, FlowTest, FlowUnit } from "../db/types";
import { getFlowMode } from "./settings";

// Flow tests, as mocked up on the design canvas (FlowTest board): readings
// of " Hg, flow, discharge and suction per supply or pump, the demand
// points, and a graph and a pass line that follow them as they're typed.
// Everything is kept as typed; the sums here work in L/min.

// Flows are always typed. Working them out from " Hg depends on the test
// equipment, so it waits for each rig's figures (FlowTest.k stays 0).

export const SECTION_COLOURS = ["#2ec4b6", "#f5a55c", "#b48cff", "#5ab0ff", "#ff7ab8", "#e8d44d"];
export const sectionColour = (i: number) => SECTION_COLOURS[i % SECTION_COLOURS.length];

export const PASS_COLOUR = "#2bd47a";
export const FAIL_COLOUR = "#ff5a4a";
export const NEUTRAL_COLOUR = "#6a8098";
export const REFERENCE_COLOUR = "#8ba0b5"; // town main, drawn dashed

export function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

// a typed flow in L/min, whichever unit it was typed in
export function lmin(val: string, unit: FlowUnit | undefined): number | null {
  const n = num(val);
  return n === null ? null : unit === "sec" ? n * 60 : n;
}

// the flow for a reading (L/min): typed, or from " Hg × k
export function flowOf(_test: Pick<FlowTest, "k">, r: FlowReading): number | null {
  return r.flow !== "" && num(r.flow) !== null ? lmin(r.flow, r.flowUnit) : null;
}

export interface Point {
  x: number;
  y: number;
}

// (flow, pressure) points of one section, lowest flow first
export function points(test: Pick<FlowTest, "k">, rows: FlowReading[], key: "dis" | "suc"): Point[] {
  return rows
    .map((r) => ({ x: flowOf(test, r), y: num(r[key]) }))
    .filter((p): p is Point => p.x !== null && p.y !== null)
    .sort((a, b) => a.x - b.x);
}

export function demandPoints(demand: DemandPoint[]): Point[] {
  return demand.map((d) => ({ x: lmin(d.flow, d.flowUnit), y: num(d.kpa) })).filter((p): p is Point => p.x !== null && p.y !== null);
}

// pressure at a flow, read off the curve (straight between readings)
function at(pts: Point[], x: number): number | null {
  for (let i = 1; i < pts.length; i++) {
    if (x >= pts[i - 1].x && x <= pts[i].x) {
      const a = pts[i - 1];
      const b = pts[i];
      return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
  }
  return null;
}

// a flow in L/min as shown: L/min, or L/s (unit "sec")
export function showFlow(v: number | null, unit: FlowUnit): string {
  if (v === null) return "";
  return unit === "sec" ? String(Math.round(v / 6) / 10) : String(r1(v));
}

export interface Verdict {
  text: string;
  colour: string;
  pass: boolean | null; // null: not enough to say
}

// Does a section's discharge curve clear every demand point? A test that
// can't be taken up to a demand point's flow fails (it isn't left open).
export function verdict(test: FlowTest, rows: FlowReading[], unit: FlowUnit = "min"): Verdict {
  const u = unit === "sec" ? " L/s" : " L/min";
  const pts = points(test, rows, "dis");
  const dem = demandPoints(test.demand);
  if (pts.length < 2 && rows.some((r) => r.dis.trim() !== "" && r.flow.trim() === "")) return { text: "Type the flow for each reading to graph it", colour: NEUTRAL_COLOUR, pass: null };
  if (pts.length < 2 || !dem.length) return { text: "Add readings and demand points to compare", colour: NEUTRAL_COLOUR, pass: null };
  const top = pts[pts.length - 1];
  const short = dem.filter((d) => d.x > top.x).sort((a, b) => b.x - a.x)[0];
  if (short) return { text: `Doesn't reach the demand of ${showFlow(short.x, unit)}${u} (readings stop at ${showFlow(top.x, unit)}${u})`, colour: FAIL_COLOUR, pass: false };
  let worst: { m: number; d: Point } | null = null;
  for (const d of dem) {
    // below the first reading's flow: its pressure (it only falls as flow rises)
    const y = d.x < pts[0].x ? pts[0].y : at(pts, d.x);
    if (y === null) continue;
    const m = y - d.y;
    if (!worst || m < worst.m) worst = { m, d };
  }
  return worst!.m >= 0
    ? { text: `Above all demand points (closest +${Math.round(worst!.m)} kPa at ${showFlow(worst!.d.x, unit)}${u})`, colour: PASS_COLOUR, pass: true }
    : { text: `Below demand at ${showFlow(worst!.d.x, unit)}${u} (${Math.round(worst!.m)} kPa)`, colour: FAIL_COLOUR, pass: false };
}

// A reading counts once something has been read on it: a row with only
// its " Hg or flow typed is left off the graph and the Excel.
export const hasData = (r: FlowReading) => [r.dis, r.suc, r.rpm ?? "", r.amps ?? "", r.temp ?? "", r.oil ?? "", ...(r.extra ?? [])].some((v) => v.trim() !== "");

// Has anything been read on the test (a reading, or a cell of a blank
// sheet)? Only these go into an AFSS / project Excel as tabs.
export const flowTestHasData = (test: Pick<FlowTest, "kind" | "sections" | "cells">) =>
  test.kind === "blank" ? (test.cells ?? []).some((r) => r.some((c) => c.trim() !== "")) : test.sections.some((s) => s.rows.some(hasData));

// an added column's heading, with its unit
export const extraHeading = (c: { name: string; unit?: string }) => (c.unit?.trim() ? `${c.name} (${c.unit.trim()})` : c.name);

// Town main is tested as a reference (is a failure down to the main?), so
// it's graphed but never passed or failed.
export function isReference(test: Pick<FlowTest, "kind" | "sections">, index: number): boolean {
  return test.kind !== "combined" && /^town main\b/i.test(test.sections[index]?.name.trim() ?? "");
}

// A section counts once it has a discharge reading (a combined system's
// pumps always do): empty ones stay off the graph, the result and the Excel.
export function isTested(test: FlowTest, index: number): boolean {
  return test.kind === "combined" || test.sections[index].rows.some((r) => r.dis.trim() !== "");
}

export interface SectionVerdict extends Verdict {
  index: number;
  name: string;
}

export function sectionVerdicts(test: FlowTest, unit: FlowUnit = "min"): SectionVerdict[] {
  return test.sections
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => isTested(test, i) && !isReference(test, i))
    .map(({ s, i }) => ({ index: i, name: sectionName(test, i), ...verdict(test, s.rows, unit) }));
}

export function sectionName(test: FlowTest, i: number): string {
  return test.sections[i].name.trim() || (test.kind === "combined" ? `Pump ${i + 1}` : `Supply ${i + 1}`);
}

// one line for the list
export function summary(test: FlowTest): Verdict {
  if (test.kind === "blank") return { text: "Blank sheet", colour: "#8ba0b5", pass: null };
  const vs = sectionVerdicts(test);
  const failing = vs.filter((v) => v.pass === false);
  if (failing.length) return { text: `${failing.map((v) => v.name).join(" & ")} below demand`, colour: FAIL_COLOUR, pass: false };
  if (vs.length && vs.every((v) => v.pass)) {
    const who = vs.length === 1 ? vs[0].name : test.kind === "combined" ? `All ${vs.length} pumps` : vs.map((v) => v.name).join(" & ");
    return { text: `${who} above all demand points`, colour: PASS_COLOUR, pass: true };
  }
  return { text: "Add readings and demand points to compare", colour: NEUTRAL_COLOUR, pass: null };
}

export function readingCount(test: FlowTest): number {
  return test.sections.reduce((n, s) => n + s.rows.filter((r) => r.dis.trim() !== "").length, 0);
}

// ---- new tests ----

export const KIND_LABEL: Record<FlowKind, string> = {
  sprinkler: "Sprinkler",
  hydrant: "Hydrant",
  combined: "Combined system",
  blank: "Blank sheet",
};

export const KIND_HINT: Record<FlowKind, string> = {
  sprinkler: "One tab per supply (town main, electric, diesel…); + adds more",
  hydrant: "One tab per supply (town main, electric, diesel…); + adds more",
  combined: "Pumps on one graph against the pump duty, e.g. Diesel pump 1 and 2",
  blank: "Your own columns and rows, all editable, for anything that doesn't fit",
};

// New readings start empty, ready for whatever the inspector types (no
// suggested steps): six rows for a sprinkler pump, five otherwise. A
// hydrant's flows are in L/s.
export function blankRows(kind: FlowKind): FlowReading[] {
  const n = kind === "sprinkler" ? 6 : 5;
  return Array.from({ length: n }, () => blankReading(kind));
}

const blankReading = (kind: FlowKind): FlowReading => (kind === "hydrant" ? { hg: "", flow: "", flowUnit: "sec", dis: "", suc: "" } : { hg: "", flow: "", dis: "", suc: "" });

// The flow unit a test is read in: L/s for hydrants, L/min for sprinklers;
// a combined system starts in L/s and follows its pump duty's unit switch
// (FlowTest.unit). Sums are done in L/min either way.
export const flowUnitFor = (test: Pick<FlowTest, "kind" | "unit">): FlowUnit =>
  test.kind === "combined" ? (test.unit ?? "sec") : test.kind === "hydrant" ? "sec" : "min";

// A section's heading in the Excel / PDF, with where its suction comes
// from: "Diesel pump 1 - TANK"
export function sectionHeading(test: FlowTest, i: number): string {
  const s = test.sections[i]?.suction;
  return sectionName(test, i) + (s === "tank" ? " - TANK" : s === "town" ? " - TOWN MAIN" : "");
}

// The pump column a supply has: RPM for a diesel pump, Amps for an electric
// (or jockey) pump, neither for town main or anything else. A column that
// already holds readings stays, whatever the supply is called.
export function pumpColumns(test: Pick<FlowTest, "kind" | "sections">, index: number): { rpm: boolean; amps: boolean } {
  const s = test.sections[index];
  const name = s?.name ?? "";
  const rows = s?.rows ?? [];
  return {
    rpm: /diesel/i.test(name) || rows.some((r) => (r.rpm ?? "").trim() !== ""),
    amps: /electric|jockey/i.test(name) || rows.some((r) => (r.amps ?? "").trim() !== ""),
  };
}

export function newFlowTest(siteId: string, kind: FlowKind): Omit<FlowTest, "id" | "order" | "createdAt" | "updatedAt"> {
  const base = { siteId, kind, name: KIND_LABEL[kind], testedAt: Date.now(), demand: [{ flow: "", kpa: "" }] };
  if (kind === "blank") {
    return {
      ...base,
      k: 0,
      demand: [],
      sections: [],
      columns: ['" Hg', "Flow (L/min)", "Discharge (kPa)", "Suction (kPa)"],
      cells: [0, 1, 2, 3, 4].map(() => ["", "", "", ""]),
    };
  }
  // names start blank, picked from the tab's list (see nameOptions)
  const names = kind === "combined" ? ["", ""] : [""];
  return {
    ...base,
    k: 0,
    sections: names.map((name) => ({ name, rows: blankRows(kind) })),
  };
}

// ---- supply / pump names ----

// What a tab's name list offers. A kind used once keeps the plain name
// ("Diesel pump"); two or more are numbered 1, 2, 3… in tab order, so
// there's only ever one of each number (see renumber).
export const SUPPLY_KINDS = ["Town main", "Electric pump", "Diesel pump", "Booster pump", "Jockey pump"];
export const PUMP_KINDS = ["Diesel pump", "Electric pump"];
export const nameKinds = (test: Pick<FlowTest, "kind">) => (test.kind === "combined" ? PUMP_KINDS : SUPPLY_KINDS);
// what a supply tab's list offers: in EnFact mode (Admin) just these three
// (Custom… covers anything else); numbering still goes by every kind
export const ENFACT_SUPPLY_KINDS = ["Town main", "Electric pump", "Diesel pump"];
export const offeredKinds = (test: Pick<FlowTest, "kind">) => (test.kind !== "combined" && getFlowMode() === "enfact" ? ENFACT_SUPPLY_KINDS : nameKinds(test));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ofKind = (name: string, base: string) => name === base || new RegExp(`^${escapeRe(base)} \\d+$`).test(name);

// Renames every section of a kind: one keeps the plain name, several are
// numbered in tab order. Run after any name change or removal.
export function renumber(sections: { name: string }[], kinds: string[]) {
  for (const base of kinds) {
    const idx = sections.map((s, i) => (ofKind(s.name, base) ? i : -1)).filter((i) => i >= 0);
    idx.forEach((i, n) => (sections[i].name = idx.length === 1 ? base : `${base} ${n + 1}`));
  }
}

export interface NameOption {
  base: string;
  name: string; // what this tab would be called
  note: string; // what it would rename on the other tabs
}

// Each kind for tab `index`, named as it would end up, and what picking it
// would rename on the other tabs.
export function nameOptions(test: FlowTest, index: number): NameOption[] {
  const kinds = nameKinds(test);
  return offeredKinds(test).map((base) => {
    const sim = test.sections.map((s) => ({ name: s.name }));
    sim[index].name = base;
    renumber(sim, kinds);
    const note = sim
      .map((s, i) => (i !== index && s.name !== test.sections[i].name ? `"${test.sections[i].name}" becomes "${s.name}"` : ""))
      .filter(Boolean)
      .join(", ");
    return { base, name: sim[index].name, note };
  });
}

// + Add reading: an empty row
export const nextReading = (test: Pick<FlowTest, "kind">): FlowReading => blankReading(test.kind);

// ---- the graph ----

// ---- what's drawn ----

export type LineKind = "dis" | "suc";

// Is a section's discharge / suction line on the graph? Discharge (town
// main included) starts shown, suction hidden; in Contractor mode (Admin)
// the inspector can change either per line (FlowTest.graph). In EnFact mode
// it's always discharge and town main, never suction.
export function lineShown(test: Pick<FlowTest, "graph">, kind: LineKind, index: number): boolean {
  if (getFlowMode() === "enfact") return kind === "dis";
  return test.graph?.[`${kind}:${index}`] ?? kind === "dis";
}

// the lines that can be drawn: discharge for each tested supply (and the
// one being looked at), suction for each that has some typed
export function graphLines(test: FlowTest, current: number): { kind: LineKind; index: number }[] {
  const idx = test.sections.map((_, i) => i);
  return [
    ...idx.filter((i) => (isTested(test, i) || i === current) && points(test, test.sections[i].rows, "dis").length).map((index) => ({ kind: "dis" as const, index })),
    ...idx.filter((i) => points(test, test.sections[i].rows, "suc").length).map((index) => ({ kind: "suc" as const, index })),
  ];
}

// Round axis steps (1, 2, 2.5, 5 × 10^n) giving 4-7 gridlines, a little
// headroom past the largest value, and pressure starting at 0 unless
// everything sits high up (then just below the lowest).
function nice(raw: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}
export function fit(lo: number, hi: number) {
  let best: { min: number; max: number; step: number } | null = null;
  for (let n = 4; n <= 7; n++) {
    const step = nice((hi * 1.04 - lo) / n);
    const a = Math.floor(lo / step) * step;
    const b = Math.ceil((hi * 1.04) / step) * step;
    if (!best || b - a < best.max - best.min) best = { min: a, max: b, step };
  }
  return best!;
}

// The graph as SVG markup: each tested section's discharge curve in its
// colour (town main grey, dashed), suction dotted in its section's colour
// where ticked (see lineShown), and the demand points as red diamonds.
// `small`: the list thumbnail.
export function chartSvg(test: FlowTest, w: number, h: number, opts: { small?: boolean; unit?: FlowUnit; current?: number } = {}): string {
  const { small = false, unit = "min", current = 0 } = opts;
  const div = unit === "sec" ? 60 : 1;
  const pad = small ? { l: 4, r: 4, t: 4, b: 4 } : { l: 38, r: 10, t: 10, b: 26 };
  const sc = (p: Point) => ({ x: p.x / div, y: p.y });
  const series = test.sections
    .map((s, i) => ({ pts: (isTested(test, i) || i === current) && lineShown(test, "dis", i) ? points(test, s.rows, "dis").map(sc) : [], colour: isReference(test, i) ? REFERENCE_COLOUR : sectionColour(i), ref: isReference(test, i) }))
    .filter((s) => s.pts.length);
  const sucs = test.sections
    .map((s, i) => ({ pts: lineShown(test, "suc", i) ? points(test, s.rows, "suc").map(sc) : [], colour: isReference(test, i) ? REFERENCE_COLOUR : sectionColour(i) }))
    .filter((s) => s.pts.length);
  const suc = sucs.flatMap((s) => s.pts);
  const dem = demandPoints(test.demand).map(sc);
  const all = [...suc, ...dem, ...series.flatMap((s) => s.pts)];
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  let hiX = xs.length ? Math.max(...xs) : 0;
  let hiY = ys.length ? Math.max(...ys) : 0;
  const loY = ys.length ? Math.min(...ys) : 0;
  hiX = hiX > 0 ? hiX : div === 60 ? 25 : 1500;
  hiY = hiY > 0 ? hiY : 500;
  const ax = fit(0, hiX);
  const ay = fit(loY > hiY * 0.55 ? loY - (hiY - loY) * 0.15 : 0, hiY);
  const minX = ax.min;
  const maxX = ax.max;
  const minY = Math.max(0, ay.min);
  const maxY = ay.max;
  const X = (x: number) => pad.l + ((w - pad.l - pad.r) * (x - minX)) / (maxX - minX);
  const Y = (y: number) => h - pad.b - ((h - pad.t - pad.b) * (y - minY)) / (maxY - minY);
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">`;
  if (!small) {
    for (let gx = minX; gx <= maxX + 1e-9; gx += ax.step) {
      s += `<line x1="${X(gx)}" y1="${pad.t}" x2="${X(gx)}" y2="${h - pad.b}" stroke="#163a5a"/><text x="${X(gx)}" y="${h - 8}" text-anchor="middle" font-size="10" font-weight="700" fill="#6a8098">${+gx.toFixed(2)}</text>`;
    }
    for (let gy = minY; gy <= maxY + 1e-9; gy += ay.step) {
      s += `<line x1="${pad.l}" y1="${Y(gy)}" x2="${w - pad.r}" y2="${Y(gy)}" stroke="#163a5a"/><text x="${pad.l - 5}" y="${Y(gy) + 3}" text-anchor="end" font-size="10" font-weight="700" fill="#6a8098">${+gy.toFixed(2)}</text>`;
    }
  }
  const line = (pts: Point[], colour: string, dash: string, width: number) =>
    pts.length < 2
      ? ""
      : `<polyline points="${pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}" fill="none" stroke="${colour}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linejoin="round"/>`;
  for (const sl of sucs) s += line(sl.pts, sl.colour, "2 3", small ? 1.2 : 1.8);
  for (const sr of series) {
    s += line(sr.pts, sr.colour, sr.ref ? "5 4" : "", sr.ref ? (small ? 1.5 : 2) : small ? 2 : 2.5);
    if (!small) for (const p of sr.pts) s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3.5" fill="#071b2c" stroke="${sr.colour}" stroke-width="2"/>`;
  }
  const r = small ? 3 : 5;
  // a combined system's first demand point is its pump duty: filled
  dem.forEach((p, i) => {
    const duty = test.kind === "combined" && i === 0;
    s += `<path d="M${X(p.x)} ${Y(p.y) - r} l${r} ${r} l${-r} ${r} l${-r} ${-r} z" fill="${duty ? "#ff5a4a" : "none"}" stroke="#ff5a4a" stroke-width="2"/>`;
  });
  return `${s}</svg>`;
}

// a small grid picture for a blank sheet's list row
export function blankThumbSvg(w: number, h: number): string {
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 72 52"><rect width="72" height="52" rx="8" fill="#071b2c"/>`;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) s += `<rect x="${8 + c * 19}" y="${8 + r * 10}" width="16" height="7" rx="2" fill="${r ? "#163a5a" : "#1c4468"}"/>`;
  return `${s}</svg>`;
}

// readings with a pressure typed but no flow: they can't go on the graph
export function missingFlows(test: FlowTest): number {
  if (test.kind === "blank") return 0;
  return test.sections.reduce((n, sec) => n + sec.rows.filter((r) => (r.dis.trim() !== "" || r.suc.trim() !== "") && r.flow.trim() === "").length, 0);
}
