import { test } from "node:test";
import assert from "node:assert/strict";
import { setFlowMode } from "../../src/lib/settings";
import { flowOf, newFlowTest, sectionVerdicts, summary, verdict, chartSvg, renumber, nameOptions, SUPPLY_KINDS, blankRows, nextReading, hasData, flowUnitFor, pumpColumns, sectionHeading, isReference, lineShown, graphLines } from "../../src/lib/flowTest";
import type { FlowTest } from "../../src/db/types";

const make = (over: Partial<FlowTest>): FlowTest => ({ ...newFlowTest("s1", "sprinkler"), id: "t", order: 0, createdAt: 0, updatedAt: 0, ...over });
// the flows as an inspector would type them (534.15 × √" Hg on the rig these came from)
const rows = (pairs: [number, number][]) => pairs.map(([hg, dis]) => ({ hg: String(hg), flow: String(Math.round(534.15 * Math.sqrt(hg) * 10) / 10), dis: String(dis), suc: "" }));

test("flow is only what's typed: never worked out from \" Hg (that depends on the rig)", () => {
  const t = make({});
  assert.equal(t.k, 0);
  assert.equal(flowOf(t, { hg: "2", flow: "", dis: "", suc: "" }), null);
  assert.equal(flowOf({ k: 534.15 }, { hg: "2", flow: "", dis: "", suc: "" }), null, "even an older test with a factor saved");
  assert.equal(flowOf(t, { hg: "2", flow: "900", dis: "", suc: "" }), 900);
  assert.equal(flowOf(t, { hg: "", flow: "4.5", flowUnit: "sec", dis: "", suc: "" }), 270);
});

test("combined systems start with two unnamed pumps and no factor", () => {
  const t = { ...newFlowTest("s1", "combined"), id: "t", order: 0, createdAt: 0, updatedAt: 0 } as FlowTest;
  assert.equal(t.k, 0);
  assert.equal(flowOf(t, { hg: "5", flow: "", dis: "", suc: "" }), null);
  assert.deepEqual(t.sections.map((s) => s.name), ["", ""], "pumps start unnamed");
});

test("verdict: pass when the curve clears every demand point, read between readings", () => {
  const t = make({ demand: [{ flow: "1100", kpa: "270" }, { flow: "1350", kpa: "240" }] });
  const town = rows([[0, 460], [2, 250], [4, 240], [6, 205], [8, 180]]);
  const pump = rows([[0, 980], [2, 750], [4, 670], [6, 430], [8, 250]]);
  assert.equal(verdict(t, town).pass, false);
  assert.match(verdict(t, town).text, /Below demand at 1350 L\/min \(-40 kPa\)/);
  assert.equal(verdict(t, pump).pass, true);
  // a test that can't be taken up to the demand fails, not left open
  const short = verdict(t, rows([[0, 500], [2, 400]]));
  assert.equal(short.pass, false);
  assert.match(short.text, /Doesn't reach the demand of 1350 L\/min \(readings stop at 755.4 L\/min\)/);
  assert.equal(verdict(t, rows([[0, 500]])).pass, null, "one reading: nothing to compare yet");
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

test("new tests start empty, with no suggested steps; + Add reading adds an empty row", () => {
  assert.deepEqual(blankRows("sprinkler").map((r) => [r.hg, r.flow]), Array(6).fill(["", ""]));
  const h = blankRows("hydrant");
  assert.deepEqual(h.map((r) => [r.flow, r.flowUnit]), Array(5).fill(["", "sec"]));
  const ht = { ...newFlowTest("s1", "hydrant"), id: "h", order: 0, createdAt: 0, updatedAt: 0 } as FlowTest;
  assert.deepEqual([nextReading(ht).flow, nextReading(ht).flowUnit], ["", "sec"]);
  assert.equal(nextReading(make({})).hg, "");
  assert.equal(flowUnitFor(ht), "sec");
  assert.equal(flowUnitFor(make({})), "min");
  assert.equal(flowUnitFor({ kind: "combined" }), "sec", "combined systems in L/s, like hydrants");
  // a row with only its " Hg or flow typed isn't a reading: off the graph
  assert.equal(hasData({ ...h[0], flow: "5" }), false);
  assert.equal(hasData({ ...h[0], flow: "5", dis: "640" }), true);
  const pre = make({ demand: [], sections: [{ name: "Electric pump", rows: blankRows("sprinkler").map((r, n) => ({ ...r, hg: String(n * 2) })) }] });
  assert.equal(chartSvg(pre, 300, 200).match(/<polyline/g), null);
});

test("RPM for a diesel pump, Amps for an electric pump, neither for town main (unless already read)", () => {
  const t = make({
    sections: [
      { name: "Town main", rows: [] },
      { name: "Electric pump", rows: [] },
      { name: "Diesel pump 2", rows: [] },
      { name: "Booster pump", rows: [{ hg: "", flow: "", dis: "", suc: "", amps: "12" }] },
    ],
  });
  assert.deepEqual([0, 1, 2, 3].map((i) => pumpColumns(t, i)), [
    { rpm: false, amps: false },
    { rpm: false, amps: true },
    { rpm: true, amps: false },
    { rpm: false, amps: true },
  ]);
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

test("graph lines (Contractor mode): discharge shown, suction hidden until ticked, per line", () => {
  setFlowMode("contractor");
  const withSuc = (pairs: [number, number, number][]) => pairs.map(([hg, dis, suc]) => ({ hg: String(hg), flow: String(Math.round(534.15 * Math.sqrt(hg) * 10) / 10), dis: String(dis), suc: String(suc) }));
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
  // EnFact mode: always every discharge and town main, never suction
  setFlowMode("enfact");
  const enfact = chartSvg(t, 300, 200);
  assert.equal(dotted(enfact), 0);
  assert.equal(enfact.match(/stroke-dasharray="5 4"/g)?.length, 1, "town main drawn");
});

test("supply names: EnFact mode offers Town main, Electric and Diesel; Contractor every kind", () => {
  const t = make({ sections: [{ name: "Booster pump", rows: [] }, { name: "", rows: [] }] });
  setFlowMode("enfact");
  assert.deepEqual(nameOptions(t, 1).map((o) => o.name), ["Town main", "Electric pump", "Diesel pump"]);
  setFlowMode("contractor");
  assert.deepEqual(nameOptions(t, 1).map((o) => o.name), ["Town main", "Electric pump", "Diesel pump", "Booster pump 2", "Jockey pump"]);
  setFlowMode("enfact");
});

test("flow testing exports are named after the site", async () => {
  const { flowFileName } = await import("../../src/lib/flowPrint");
  assert.match(flowFileName({ name: "Woolworths / Pymble" }, "pdf", new Date(2026, 9, 1).getTime()), /^Woolworths   Pymble – Flow tests – 1 Oct 2026\.pdf$/);
});

test("combined systems: L/s to start, the pump duty's unit when switched; headings say where suction comes from; the pump duty is a filled diamond", () => {
  assert.equal(flowUnitFor({ kind: "combined" }), "sec");
  assert.equal(flowUnitFor({ kind: "combined", unit: "min" }), "min");
  assert.equal(flowUnitFor({ kind: "hydrant", unit: "min" }), "sec", "only combined systems switch");
  const t = make({
    kind: "combined",
    sections: [
      { name: "Diesel pump 1", suction: "tank", rows: rows([[0, 1120], [5, 1080], [10, 1010]]) },
      { name: "Diesel pump 2", suction: "town", rows: rows([[0, 1070], [5, 1020]]) },
      { name: "", rows: [] },
    ],
    demand: [{ flow: "7535", kpa: "961" }, { flow: "9000", kpa: "585" }],
  });
  assert.deepEqual([0, 1, 2].map((i) => sectionHeading(t, i)), ["Diesel pump 1 - TANK", "Diesel pump 2 - TOWN MAIN", "Pump 3"]);
  assert.equal(chartSvg(t, 300, 200).match(/fill="#ff5a4a"/g)?.length, 1, "one filled diamond: the pump duty");
});

test("the in-app graph's axes are labelled: Flow in the test's unit, Pressure (kPa)", () => {
  const sprinkler = { ...newFlowTest("s1", "sprinkler"), id: "a", order: 0, createdAt: 0, updatedAt: 0 } as FlowTest;
  const hydrant = { ...newFlowTest("s1", "hydrant"), id: "b", order: 0, createdAt: 0, updatedAt: 0 } as FlowTest;
  assert.match(chartSvg(sprinkler, 300, 230, { unit: "min" }), /Flow \(L\/min\)/);
  assert.match(chartSvg(hydrant, 300, 230, { unit: "sec" }), /Flow \(L\/s\)/);
  assert.match(chartSvg(hydrant, 300, 230, { unit: "sec" }), /Pressure \(kPa\)/);
  assert.doesNotMatch(chartSvg(sprinkler, 72, 52, { small: true }), /Pressure/, "not on the small list pictures");
});
