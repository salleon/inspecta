import { test } from "node:test";
import assert from "node:assert/strict";
import { flowOf, newFlowTest, sectionVerdicts, summary, verdict, chartSvg, renumber, nameOptions, SUPPLY_KINDS, blankRows, nextReading, hasData, isReference, lineShown, graphLines } from "../../src/lib/flowTest";
import type { FlowTest } from "../../src/db/types";

const make = (over: Partial<FlowTest>): FlowTest => ({ ...newFlowTest("s1", "sprinkler"), id: "t", order: 0, createdAt: 0, updatedAt: 0, ...over });
const rows = (pairs: [number, number][]) => pairs.map(([hg, dis]) => ({ hg: String(hg), flow: "", dis: String(dis), suc: "" }));

test("flow comes from \" Hg × 534.15 unless typed (L/s typed flows count ×60)", () => {
  const t = make({});
  assert.equal(flowOf(t, { hg: "2", flow: "", dis: "", suc: "" }), 755.4);
  assert.equal(flowOf(t, { hg: "2", flow: "900", dis: "", suc: "" }), 900);
  assert.equal(flowOf(t, { hg: "", flow: "4.5", flowUnit: "sec", dis: "", suc: "" }), 270);
  // hydrants have no " Hg flow: typed only
  assert.equal(flowOf(make({ k: 0 }), { hg: "2", flow: "", dis: "", suc: "" }), null);
});

test("combined systems use their sheet's 3440.5", () => {
  const t = { ...newFlowTest("s1", "combined"), id: "t", order: 0, createdAt: 0, updatedAt: 0 } as FlowTest;
  assert.equal(flowOf(t, { hg: "5", flow: "", dis: "", suc: "" }), 7693.2);
  assert.deepEqual(t.sections.map((s) => s.name), ["", ""], "pumps start unnamed");
});

test("verdict: pass when the curve clears every demand point, read between readings", () => {
  const t = make({ demand: [{ flow: "1100", kpa: "270" }, { flow: "1350", kpa: "240" }] });
  const town = rows([[0, 460], [2, 250], [4, 240], [6, 205], [8, 180]]);
  const pump = rows([[0, 980], [2, 750], [4, 670], [6, 430], [8, 250]]);
  assert.equal(verdict(t, town).pass, false);
  assert.match(verdict(t, town).text, /Below demand at 1350 L\/min \(-40 kPa\)/);
  assert.equal(verdict(t, pump).pass, true);
  assert.equal(verdict(t, rows([[0, 500], [2, 400]])).pass, null); // doesn't reach 1100
});

test("untested supplies and the town main (a reference) stay out of the results; the list line names who's below", () => {
  const t = make({
    demand: [{ flow: "900", kpa: "270" }],
    sections: [
      { name: "Town main", rows: rows([[0, 460], [2, 250], [4, 200]]) },
      { name: "Booster pump", rows: rows([[0, 470], [2, 260], [4, 210]]) },
      { name: "Electric pump", rows: rows([[0, 980], [2, 750], [4, 670]]) },
      { name: "Diesel pump", rows: rows([[0, NaN]]).map((r) => ({ ...r, dis: "" })) },
    ],
  });
  assert.equal(isReference(t, 0), true);
  assert.equal(isReference(t, 1), false);
  assert.deepEqual(sectionVerdicts(t).map((v) => v.name), ["Booster pump", "Electric pump"]);
  assert.equal(summary(t).text, "Booster pump below demand");
});

test("the town main is graphed, dashed, but never passed or failed", () => {
  const t = make({ demand: [{ flow: "900", kpa: "270" }], sections: [{ name: "Town main", rows: rows([[0, 460], [2, 250], [4, 200]]) }] });
  assert.deepEqual(sectionVerdicts(t), []);
  assert.equal(summary(t).pass, null);
  assert.match(chartSvg(t, 300, 200), /<polyline[^>]*stroke-dasharray/);
});

test("new tests come prefilled: sprinkler \" Hg 0-10, hydrant 0-20 L/s; + Add reading carries on the steps", () => {
  assert.deepEqual(blankRows("sprinkler").map((r) => r.hg), ["0", "2", "4", "6", "8", "10"]);
  const h = blankRows("hydrant");
  assert.deepEqual(h.map((r) => [r.flow, r.flowUnit]), [["0", "sec"], ["5", "sec"], ["10", "sec"], ["15", "sec"], ["20", "sec"]]);
  const ht = { ...newFlowTest("s1", "hydrant"), id: "h", order: 0, createdAt: 0, updatedAt: 0 } as FlowTest;
  assert.deepEqual([nextReading(ht, h).flow, nextReading(ht, h).flowUnit], ["25", "sec"]);
  assert.equal(nextReading(make({}), blankRows("sprinkler")).hg, "12");
  // a row holding only its step is still a prefill: off the graph
  assert.equal(hasData(h[0]), false);
  assert.equal(hasData({ ...h[0], dis: "640" }), true);
  const pre = make({ demand: [], sections: [{ name: "Electric pump", rows: blankRows("sprinkler") }] });
  assert.equal(chartSvg(pre, 300, 200).match(/<polyline/g), null);
});

test("the graph draws a curve per tested supply and the demand diamonds", () => {
  const t = make({
    demand: [{ flow: "1100", kpa: "270" }],
    sections: [
      { name: "A", rows: rows([[0, 460], [2, 250]]) },
      { name: "B", rows: rows([[0, 980], [2, 750]]) },
      { name: "C", rows: [] },
    ],
  });
  const svg = chartSvg(t, 300, 200);
  assert.equal(svg.match(/<polyline/g)?.length, 2);
  assert.equal(svg.match(/<path d="M/g)?.length, 1);
});

test("supply names: one of a kind is plain, several are numbered in tab order, never twice", () => {
  const secs = [{ name: "Electric pump 2" }, { name: "Electric pump 2" }, { name: "Fire pump 3" }];
  renumber(secs, SUPPLY_KINDS);
  assert.deepEqual(secs.map((s) => s.name), ["Electric pump 1", "Electric pump 2", "Fire pump 3"]);
  secs.splice(0, 1);
  renumber(secs, SUPPLY_KINDS);
  assert.deepEqual(secs.map((s) => s.name), ["Electric pump", "Fire pump 3"], "back to plain when one is left");
});

test("the name list says what a pick would be called and what it renames", () => {
  const t = make({ sections: [{ name: "Diesel pump", rows: [] }, { name: "", rows: [] }] });
  const diesel = nameOptions(t, 1).find((o) => o.base === "Diesel pump")!;
  assert.equal(diesel.name, "Diesel pump 2");
  assert.equal(diesel.note, '"Diesel pump" becomes "Diesel pump 1"');
  assert.equal(nameOptions(t, 1).find((o) => o.base === "Town main")!.note, "");
});

test("graph lines: discharge shown, suction hidden until ticked, per line", () => {
  const withSuc = (pairs: [number, number, number][]) => pairs.map(([hg, dis, suc]) => ({ hg: String(hg), flow: "", dis: String(dis), suc: String(suc) }));
  const t = make({
    demand: [],
    sections: [
      { name: "Town main", rows: rows([[0, 460], [2, 250]]) },
      { name: "Diesel pump 1", rows: withSuc([[0, 980, 60], [2, 750, 50]]) },
      { name: "Diesel pump 2", rows: withSuc([[0, 970, 80], [2, 740, 70]]) },
    ],
  });
  assert.deepEqual(graphLines(t, 0).map((l) => `${l.kind}:${l.index}`), ["dis:0", "dis:1", "dis:2", "suc:1", "suc:2"]);
  assert.equal(lineShown(t, "dis", 1), true);
  assert.equal(lineShown(t, "suc", 1), false);
  const dotted = (svg: string) => svg.match(/stroke-dasharray="2 3"/g)?.length ?? 0;
  assert.equal(dotted(chartSvg(t, 300, 200)), 0);
  t.graph = { "suc:2": true, "dis:0": false };
  const svg = chartSvg(t, 300, 200);
  assert.equal(dotted(svg), 1, "only Diesel 2's suction");
  assert.equal(svg.match(/stroke-dasharray="5 4"/g), null, "town main hidden");
});

test("flow testing exports are named after the site", async () => {
  const { flowFileName } = await import("../../src/lib/flowPrint");
  assert.match(flowFileName({ name: "Woolworths / Pymble" }, "pdf", new Date(2026, 9, 1).getTime()), /^Woolworths   Pymble – Flow tests – 1 Oct 2026\.pdf$/);
});
