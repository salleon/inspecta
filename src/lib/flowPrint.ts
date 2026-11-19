import type { FlowTest, Site } from "../db/types";
import { demandPoints, extraHeading, fit, flowOf, flowUnitFor, hasData, sectionHeading, isReference, isTested, KIND_LABEL, lineShown, points, sectionName, verdict, type Point } from "./flowTest";
import { numericDate, reportFileName } from "./dates";

// What a flow test looks like printed (design canvas FlowExports): one page
// per test with its title, the site details and demand, a table per supply
// with PASS / FAIL, the graph (legend in a box on its right) and comments.
// The export screen's preview (SVG) and the PDF (lib/flowPdf) both draw
// from these, so they match.

const PRINT_COLOURS = ["#1f6fb2", "#e07b25", "#7b4fc9", "#2a9d5b", "#c2185b", "#8d6e00"];
const PRINT_TOWN = "#7d8a96";
export const PRINT_DEMAND = "#d33030";

const TITLE: Record<FlowTest["kind"], string> = {
  sprinkler: "SPRINKLER FLOW TEST RESULTS",
  hydrant: "HYDRANT FLOW TEST RESULTS",
  combined: "COMBINED SYSTEM FLOW TEST RESULTS",
  blank: "",
};

export function printTitle(test: FlowTest): string {
  return test.kind === "blank" ? (test.name || "Flow test").toUpperCase() : TITLE[test.kind];
}

// the test's own name, when it says more than the title does
export function printSubtitle(test: FlowTest): string {
  const n = test.name.trim();
  return test.kind === "blank" || !n || n === KIND_LABEL[test.kind] ? "" : n;
}

const printDate = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

// as the app shows them: hydrants and combined systems in L/s, sprinklers in L/min
export const printUnit = (test: FlowTest) => (flowUnitFor(test) === "sec" ? "L/s" : "L/min");
const div = (test: FlowTest) => (flowUnitFor(test) === "sec" ? 60 : 1);
const r1 = (n: number) => String(Math.round(n * 10) / 10);

export function printDetails(test: FlowTest, site: Pick<Site, "name" | "address">): { label: string; value: string }[] {
  return [
    { label: "Location", value: [site.name, site.address].filter((x) => x?.trim()).join(", ") },
    { label: "Date", value: printDate(test.testedAt) },
    { label: "Equipment", value: test.equipment?.trim() ?? "" },
    { label: "Tested by", value: test.testedBy?.trim() ?? "" },
    // optional on every flow test, printed when filled in
    ...(test.yearInstalled?.trim() ? [{ label: "Year installed", value: test.yearInstalled.trim() }] : []),
  ];
}

export function printDemand(test: FlowTest): string[] {
  // a combined system's first point is its pump duty
  return demandPoints(test.demand).map((p, i) => `${test.kind === "combined" && i === 0 ? "Pump duty: " : ""}${r1(p.x / div(test))} ${printUnit(test)} @ ${r1(p.y)} kPa`);
}

export interface PrintTable {
  name: string;
  result: "PASS" | "FAIL" | null;
  // the badge on the table: a pump's PASS / FAIL, the town main's MEETS /
  // BELOW DEMAND, each with its kPa margin at the closest demand point
  badge: { text: string; tone: Tone } | null;
  head: string[];
  rows: string[][];
}

// pass green, fail red, the town main blue (meets demand) or red (below)
export type Tone = "pass" | "fail" | "meets" | "below";

// a plain hyphen for minus: the PDF's own font has no "−"
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${Math.abs(n)}`;

// how a supply did: a pump passes or fails, the town main (the reference)
// meets the demand or is below it; with the margin and where, when known
export function supplyResult(test: FlowTest, i: number): { tone: Tone; word: string; margin: string; at: string; text: string } | null {
  const s = test.sections[i];
  if (!s || !isTested(test, i)) return null;
  const v = verdict(test, s.rows);
  if (v.pass === null) return null;
  const ref = isReference(test, i);
  const tone: Tone = ref ? (v.pass ? "meets" : "below") : v.pass ? "pass" : "fail";
  const word = ref ? (v.pass ? "Meets demand" : "Below demand") : v.pass ? "PASS" : "FAIL";
  const margin = v.margin === undefined ? "" : `${signed(v.margin)} kPa`;
  const at = v.at === undefined ? "" : `${r1(v.at / div(test))} ${printUnit(test)}`;
  return { tone, word, margin, at, text: v.text };
}

// the Result row: a tile per supply, not tested ones too
export interface ResultTile {
  name: string; // "Town main · reference", "Electric pump"
  tone: Tone | null; // null: not tested, or not enough to say
  value: string; // "PASS", "Below demand", "Not tested"
  margin: string; // "+153 kPa"
  line: string; // "closest to the demand at 1350 L/min"
}

export function printResults(test: FlowTest): ResultTile[] {
  if (test.kind === "blank") return [];
  return test.sections.map((_, i) => {
    const ref = isReference(test, i);
    const name = `${sectionName(test, i)}${ref ? " · reference" : ""}`;
    if (!isTested(test, i)) return { name, tone: null, value: "Not tested", margin: "", line: "" };
    const r = supplyResult(test, i);
    if (!r) return { name, tone: null, value: "No result", margin: "", line: "" };
    return { name, tone: r.tone, value: r.word, margin: r.margin, line: r.margin ? `${ref ? "against" : "closest to"} the demand at ${r.at}` : r.text };
  });
}

// the details strip: site, date, equipment, tested by, demand, year installed
export function printStrip(test: FlowTest, site: Pick<Site, "name" | "address">): { label: string; value: string }[] {
  return [
    { label: "Site", value: site.name.trim() },
    { label: "Date", value: numericDate(test.testedAt) },
    { label: "Equipment", value: test.equipment?.trim() ?? "" },
    { label: "Tested by", value: test.testedBy?.trim() ?? "" },
    ...(test.kind === "blank" ? [] : [{ label: "Demand", value: printDemand(test).join("\n") }]),
    ...(test.yearInstalled?.trim() ? [{ label: "Year installed", value: test.yearInstalled.trim() }] : []),
  ];
}

// a table per tested supply, with only the readings actually taken and,
// on each, only the columns filled in on it
export function printTables(test: FlowTest): PrintTable[] {
  if (test.kind === "blank") return [{ name: "", result: null, badge: null, head: test.columns ?? [], rows: test.cells ?? [] }];
  const year = new Date(test.testedAt).getFullYear();
  const extras = test.extraCols ?? [];
  const hyd = test.kind === "hydrant";
  return test.sections
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => isTested(test, i))
    .map(({ s, i }) => {
      const read = s.rows.filter(hasData);
      const any = (f: (r: (typeof read)[number]) => string | undefined) => read.some((r) => (f(r) ?? "").trim() !== "");
      const cols: { head: string; cell: (r: (typeof read)[number]) => string }[] = [];
      const flow = (r: (typeof read)[number]) => {
        const f = flowOf(test, r);
        return f === null ? "" : r1(f / div(test));
      };
      if (hyd) cols.push({ head: `Flow ${printUnit(test)}`, cell: flow });
      if (!hyd || any((r) => r.hg)) cols.push({ head: '" Hg', cell: (r) => r.hg });
      if (!hyd) cols.push({ head: `Flow ${printUnit(test)}`, cell: flow });
      cols.push({ head: "Discharge kPa", cell: (r) => r.dis });
      if (any((r) => r.suc)) cols.push({ head: "Suction kPa", cell: (r) => r.suc });
      if (any((r) => r.rpm)) cols.push({ head: "RPM", cell: (r) => r.rpm ?? "" });
      if (any((r) => r.amps)) cols.push({ head: "Amps", cell: (r) => r.amps ?? "" });
      if (any((r) => r.temp)) cols.push({ head: "Temp °C", cell: (r) => r.temp ?? "" });
      if (any((r) => r.oil)) cols.push({ head: "Oil pressure kPa", cell: (r) => r.oil ?? "" });
      extras.forEach((x, j) => {
        if (any((r) => r.extra?.[j])) cols.push({ head: extraHeading(x), cell: (r) => r.extra?.[j] ?? "" });
      });
      const r = supplyResult(test, i);
      const ref = isReference(test, i);
      const cutIn = s.cutIn?.trim();
      return {
        name: `${sectionHeading(test, i)}${cutIn ? ` (cut-in ${cutIn} kPa)` : ""} · ${year}`,
        result: ref || !r ? null : r.tone === "pass" ? "PASS" : "FAIL",
        badge: r ? { text: `${r.word.toUpperCase()}${r.margin ? ` ${r.margin}` : ""}`, tone: r.tone } : null,
        head: cols.map((c) => c.head),
        rows: read.map((row) => cols.map((c) => c.cell(row))),
      };
    });
}

// ---- the graph, as shapes, for SVG or PDF ----

interface ChartModel {
  w: number;
  h: number;
  plot: { x: number; y: number; w: number; h: number };
  grid: { x1: number; y1: number; x2: number; y2: number }[];
  ticks: { x: number; y: number; text: string; anchor: "middle" | "end" }[];
  xLabel: { x: number; y: number; text: string };
  yLabel: { x: number; y: number; text: string };
  lines: { pts: Point[]; colour: string; dash: number[]; width: number; dots: boolean }[];
  demand: (Point & { filled?: boolean })[]; // filled: a combined system's pump duty
  // the legend in a box on the right, or (below) in one line under the graph
  legend: { x: number; y: number; w: number; h: number; below?: boolean; items: { label: string; colour: string; dash: number[]; diamond?: boolean; x?: number }[] };
}

// The graph's lines and demand points in the test's flow unit, with their
// legend labels and colours: the preview, the PDF and the Excel chart all
// draw these, so they match.
export interface PrintSeries {
  label: string;
  colour: string;
  dash: number[]; // [] solid
  dots: boolean;
  width: number;
  pts: Point[];
}

export function chartSeries(test: FlowTest): { series: PrintSeries[]; demand: Point[] } {
  const d = div(test);
  const series: PrintSeries[] = [];
  test.sections.forEach((s, i) => {
    if (!isTested(test, i)) return;
    const ref = isReference(test, i);
    const colour = ref ? PRINT_TOWN : PRINT_COLOURS[i % PRINT_COLOURS.length];
    if (lineShown(test, "dis", i)) {
      const pts = points(test, s.rows, "dis").map((p) => ({ x: p.x / d, y: p.y }));
      if (pts.length) series.push({ label: sectionName(test, i), colour, dash: ref ? [5, 3] : [], dots: true, width: 1.6, pts });
    }
    if (lineShown(test, "suc", i)) {
      const pts = points(test, s.rows, "suc").map((p) => ({ x: p.x / d, y: p.y }));
      if (pts.length) series.push({ label: `${sectionName(test, i)} suction`, colour, dash: [1.5, 2], dots: false, width: 1.2, pts });
    }
  });
  return { series, demand: demandPoints(test.demand).map((p) => ({ x: p.x / d, y: p.y })) };
}

// the graph's axes: both from 0, to just past the highest point
export function chartAxes(test: FlowTest, all: Point[]) {
  const hiX = Math.max(0, ...all.map((p) => p.x)) || (div(test) === 60 ? 25 : 1500);
  const hiY = Math.max(0, ...all.map((p) => p.y)) || 500;
  return { ax: fit(0, hiX), ay: fit(0, hiY) };
}

// In a box w × h: the discharge (and ticked suction) lines as on the app's
// graph, the demand points, and the legend in a box on the right.
export function chartModel(test: FlowTest, w: number, h: number, font = 8, legendBelow = false): ChartModel {
  const { series: lines, demand } = chartSeries(test);
  const series: ChartModel["lines"] = lines.map((l) => ({ pts: l.pts, colour: l.colour, dash: l.dash, width: l.width, dots: l.dots }));
  const legendItems: ChartModel["legend"]["items"] = lines.map((l) => ({ label: l.label, colour: l.colour, dash: l.dash }));
  if (demand.length) legendItems.push({ label: "Demand", colour: PRINT_DEMAND, dash: [], diamond: true });

  const longest = Math.max(6, ...legendItems.map((it) => it.label.length));
  const legendW = legendBelow ? 0 : Math.min(w * 0.36, longest * font * 0.55 + 30);
  const L = 34;
  const T = 8;
  const B = legendBelow ? 28 + font + 10 : 28;
  const plot = { x: L, y: T, w: w - L - legendW - (legendBelow ? 6 : 14), h: h - T - B };
  const { ax, ay } = chartAxes(test, [...series.flatMap((s) => s.pts), ...demand]);
  const X = (x: number) => plot.x + (plot.w * (x - ax.min)) / (ax.max - ax.min);
  const Y = (y: number) => plot.y + plot.h - (plot.h * (y - ay.min)) / (ay.max - ay.min);
  const grid: ChartModel["grid"] = [];
  const ticks: ChartModel["ticks"] = [];
  for (let gy = ay.min; gy <= ay.max + 1e-9; gy += ay.step) {
    grid.push({ x1: plot.x, y1: Y(gy), x2: plot.x + plot.w, y2: Y(gy) });
    ticks.push({ x: plot.x - 4, y: Y(gy) + font * 0.35, text: String(+gy.toFixed(2)), anchor: "end" });
  }
  for (let gx = ax.min; gx <= ax.max + 1e-9; gx += ax.step) ticks.push({ x: X(gx), y: plot.y + plot.h + font + 3, text: String(+gx.toFixed(2)), anchor: "middle" });
  const lh = font + 7;
  const legendH = 8 + legendItems.length * lh;
  return {
    w,
    h,
    plot,
    grid,
    ticks,
    xLabel: { x: plot.x + plot.w / 2, y: legendBelow ? plot.y + plot.h + font * 2 + 7 : h - 3, text: `Flow (${printUnit(test)})` },
    yLabel: { x: 9, y: plot.y + plot.h / 2, text: "Pressure (kPa)" },
    lines: series.map((s) => ({ ...s, pts: s.pts.map((p) => ({ x: X(p.x), y: Y(p.y) })) })),
    demand: demand.map((p, i) => ({ x: X(p.x), y: Y(p.y), filled: test.kind === "combined" && i === 0 })),
    legend: legendBelow ? belowLegend(legendItems, w, h, font) : { x: w - legendW, y: plot.y + Math.max(0, (plot.h - legendH) / 2), w: legendW, h: legendH, items: legendItems },
  };
}

// the legend in one line, centred under the graph: each item's x is where its key starts
function belowLegend(items: ChartModel["legend"]["items"], w: number, h: number, font: number): ChartModel["legend"] {
  const widths = items.map((it) => 24 + it.label.length * font * 0.5);
  const total = widths.reduce((a, b) => a + b, 0) + (items.length - 1) * 12;
  let x = Math.max(0, (w - total) / 2);
  const placed = items.map((it, i) => {
    const out = { ...it, x };
    x += widths[i] + 12;
    return out;
  });
  return { x: 0, y: h - font - 4, w, h: font + 4, below: true, items: placed };
}

export function chartModelSvg(m: ChartModel, font = 8): string {
  const t = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let s = `<svg width="100%" viewBox="0 0 ${m.w} ${m.h}" style="display:block;background:#fff" font-family="Helvetica, Arial, sans-serif">`;
  for (const g of m.grid) s += `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="#e3e8ec" stroke-width="0.7"/>`;
  s += `<rect x="${m.plot.x}" y="${m.plot.y}" width="${m.plot.w}" height="${m.plot.h}" fill="none" stroke="#9aa6b1" stroke-width="0.8"/>`;
  for (const k of m.ticks) s += `<text x="${k.x}" y="${k.y}" font-size="${font}" text-anchor="${k.anchor}" fill="#55636f">${k.text}</text>`;
  s += `<text x="${m.xLabel.x}" y="${m.xLabel.y}" font-size="${font}" text-anchor="middle" fill="#3a4753">${t(m.xLabel.text)}</text>`;
  s += `<text x="${m.yLabel.x}" y="${m.yLabel.y}" font-size="${font}" text-anchor="middle" fill="#3a4753" transform="rotate(-90 ${m.yLabel.x} ${m.yLabel.y})">${t(m.yLabel.text)}</text>`;
  for (const l of m.lines) {
    if (l.pts.length > 1) s += `<polyline points="${l.pts.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${l.colour}" stroke-width="${l.width}"${l.dash.length ? ` stroke-dasharray="${l.dash.join(" ")}"` : ""}/>`;
    if (l.dots) for (const p of l.pts) s += `<circle cx="${p.x}" cy="${p.y}" r="2" fill="${l.colour}"/>`;
  }
  for (const p of m.demand) s += `<path d="M${p.x} ${p.y - 4} l4 4 l-4 4 l-4 -4 z" fill="${p.filled ? PRINT_DEMAND : "none"}" stroke="${PRINT_DEMAND}" stroke-width="1.3"/>`;
  const g = m.legend;
  if (g.items.length) {
    s += `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="2" fill="#fff" stroke="#b8c6d2" stroke-width="0.8"/>`;
    g.items.forEach((it, i) => {
      const y = g.y + 4 + (i + 0.5) * (font + 7);
      s += it.diamond
        ? `<path d="M${g.x + 12} ${y - 3.5} l3.5 3.5 l-3.5 3.5 l-3.5 -3.5 z" fill="none" stroke="${it.colour}" stroke-width="1.2"/>`
        : `<line x1="${g.x + 5}" y1="${y}" x2="${g.x + 19}" y2="${y}" stroke="${it.colour}" stroke-width="2"${it.dash.length ? ` stroke-dasharray="${it.dash.join(" ")}"` : ""}/>`;
      s += `<text x="${g.x + 24}" y="${y + font * 0.35}" font-size="${font}" fill="#1c2833">${t(it.label)}</text>`;
    });
  }
  return `${s}</svg>`;
}

export const flowFileName = (site: Pick<Site, "name">, ext: "pdf" | "xlsx", at = Date.now()) =>
  reportFileName(site.name, "Flow tests", ext, at);

