import type { FlowTest, Site } from "../db/types";
import { demandPoints, extraHeading, fit, flowOf, hasData, isReference, isTested, KIND_LABEL, lineShown, points, sectionName, verdict, type Point } from "./flowTest";

// What a flow test looks like printed (design canvas FlowExports): one page
// per test with its title, the site details and demand, a table per supply
// with PASS / FAIL, the graph (legend in a box on its right) and comments.
// The export screen's preview (SVG) and the PDF (lib/flowPdf) both draw
// from these, so they match.

export const PRINT_COLOURS = ["#1f6fb2", "#e07b25", "#7b4fc9", "#2a9d5b", "#c2185b", "#8d6e00"];
export const PRINT_TOWN = "#7d8a96";
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

export const printDate = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

// hydrants in L/s, the rest in L/min
export const printUnit = (test: FlowTest) => (test.kind === "hydrant" ? "L/s" : "L/min");
const div = (test: FlowTest) => (test.kind === "hydrant" ? 60 : 1);
const r1 = (n: number) => String(Math.round(n * 10) / 10);

export function printDetails(test: FlowTest, site: Pick<Site, "name" | "address">): { label: string; value: string }[] {
  return [
    { label: "Location", value: [site.name, site.address].filter((x) => x?.trim()).join(", ") },
    { label: "Date", value: printDate(test.testedAt) },
    { label: "Equipment", value: test.equipment?.trim() ?? "" },
    { label: "Tested by", value: test.testedBy?.trim() ?? "" },
  ];
}

export function printDemand(test: FlowTest): string[] {
  return demandPoints(test.demand).map((p) => `${r1(p.x / div(test))} ${printUnit(test)} @ ${r1(p.y)} kPa`);
}

export interface PrintTable {
  name: string;
  result: "PASS" | "FAIL" | null;
  head: string[];
  rows: string[][];
}

// a table per tested supply, with only the readings actually taken
export function printTables(test: FlowTest): PrintTable[] {
  if (test.kind === "blank") return [{ name: "", result: null, head: test.columns ?? [], rows: test.cells ?? [] }];
  const year = new Date(test.testedAt).getFullYear();
  const all = test.sections.flatMap((s) => s.rows.filter(hasData));
  const anyHg = all.some((r) => r.hg.trim() !== "");
  const anyRpm = all.some((r) => (r.rpm ?? "").trim() !== "");
  const anyAmps = all.some((r) => (r.amps ?? "").trim() !== "");
  const extras = test.extraCols ?? [];
  const hyd = test.kind === "hydrant";
  const head = [
    ...(hyd ? [`Flow ${printUnit(test)}`] : []),
    ...(!hyd || anyHg ? ['" Hg'] : []),
    ...(hyd ? [] : [`Flow ${printUnit(test)}`]),
    "Discharge kPa",
    "Suction kPa",
    ...(anyRpm ? ["RPM"] : []),
    ...(anyAmps ? ["Amps"] : []),
    ...extras.map(extraHeading),
  ];
  return test.sections
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => isTested(test, i))
    .map(({ s, i }) => {
      const v = isReference(test, i) ? null : verdict(test, s.rows).pass;
      const rows = s.rows.filter(hasData).map((r) => {
        const f = flowOf(test, r);
        const flow = f === null ? "" : r1(f / div(test));
        return [
          ...(hyd ? [flow] : []),
          ...(!hyd || anyHg ? [r.hg] : []),
          ...(hyd ? [] : [flow]),
          r.dis,
          r.suc,
          ...(anyRpm ? [r.rpm ?? ""] : []),
          ...(anyAmps ? [r.amps ?? ""] : []),
          ...extras.map((_, j) => r.extra?.[j] ?? ""),
        ];
      });
      return { name: `${sectionName(test, i)} – ${year}`, result: v === true ? "PASS" : v === false ? "FAIL" : null, head, rows };
    });
}

// ---- the graph, as shapes, for SVG or PDF ----

export interface ChartModel {
  w: number;
  h: number;
  plot: { x: number; y: number; w: number; h: number };
  grid: { x1: number; y1: number; x2: number; y2: number }[];
  ticks: { x: number; y: number; text: string; anchor: "middle" | "end" }[];
  xLabel: { x: number; y: number; text: string };
  yLabel: { x: number; y: number; text: string };
  lines: { pts: Point[]; colour: string; dash: number[]; width: number; dots: boolean }[];
  demand: Point[];
  legend: { x: number; y: number; w: number; h: number; items: { label: string; colour: string; dash: number[]; diamond?: boolean }[] };
}

// In a box w × h: the discharge (and ticked suction) lines as on the app's
// graph, the demand points, and the legend in a box on the right.
export function chartModel(test: FlowTest, w: number, h: number, font = 8): ChartModel {
  const d = div(test);
  const series: ChartModel["lines"] = [];
  const legendItems: ChartModel["legend"]["items"] = [];
  test.sections.forEach((s, i) => {
    if (!isTested(test, i)) return;
    const ref = isReference(test, i);
    const colour = ref ? PRINT_TOWN : PRINT_COLOURS[i % PRINT_COLOURS.length];
    if (lineShown(test, "dis", i)) {
      const pts = points(test, s.rows, "dis").map((p) => ({ x: p.x / d, y: p.y }));
      if (pts.length) {
        series.push({ pts, colour, dash: ref ? [5, 3] : [], width: 1.6, dots: true });
        legendItems.push({ label: sectionName(test, i), colour, dash: ref ? [5, 3] : [] });
      }
    }
    if (lineShown(test, "suc", i)) {
      const pts = points(test, s.rows, "suc").map((p) => ({ x: p.x / d, y: p.y }));
      if (pts.length) {
        series.push({ pts, colour, dash: [1.5, 2], width: 1.2, dots: false });
        legendItems.push({ label: `${sectionName(test, i)} suction`, colour, dash: [1.5, 2] });
      }
    }
  });
  const demand = demandPoints(test.demand).map((p) => ({ x: p.x / d, y: p.y }));
  if (demand.length) legendItems.push({ label: "Demand", colour: PRINT_DEMAND, dash: [], diamond: true });

  const longest = Math.max(6, ...legendItems.map((it) => it.label.length));
  const legendW = Math.min(w * 0.36, longest * font * 0.55 + 30);
  const L = 34;
  const T = 8;
  const B = 28;
  const plot = { x: L, y: T, w: w - L - legendW - 14, h: h - T - B };
  const all = [...series.flatMap((s) => s.pts), ...demand];
  const hiX = Math.max(0, ...all.map((p) => p.x)) || (d === 60 ? 25 : 1500);
  const hiY = Math.max(0, ...all.map((p) => p.y)) || 500;
  const ax = fit(0, hiX);
  const ay = fit(0, hiY);
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
    xLabel: { x: plot.x + plot.w / 2, y: h - 3, text: `Flow (${printUnit(test)})` },
    yLabel: { x: 9, y: plot.y + plot.h / 2, text: "Pressure (kPa)" },
    lines: series.map((s) => ({ ...s, pts: s.pts.map((p) => ({ x: X(p.x), y: Y(p.y) })) })),
    demand: demand.map((p) => ({ x: X(p.x), y: Y(p.y) })),
    legend: { x: w - legendW, y: plot.y + Math.max(0, (plot.h - legendH) / 2), w: legendW, h: legendH, items: legendItems },
  };
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
  for (const p of m.demand) s += `<path d="M${p.x} ${p.y - 4} l4 4 l-4 4 l-4 -4 z" fill="none" stroke="${PRINT_DEMAND}" stroke-width="1.3"/>`;
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
  `${(site.name || "Site").replace(/[\\/:*?"<>|]/g, " ").trim()} – Flow tests – ${new Date(at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.${ext}`;

