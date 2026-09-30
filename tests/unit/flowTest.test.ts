import { test } from "node:test";
import assert from "node:assert/strict";
import { flowOf, newFlowTest, sectionVerdicts, summary, verdict, chartSvg, renumber, nameOptions, SUPPLY_KINDS } from "../../src/lib/flowTest";
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

test("untested supplies stay out of the results; the list line names who's below", () => {
  const t = make({
    demand: [{ flow: "900", kpa: "270" }],
    sections: [
      { name: "Town main", rows: rows([[0, 460], [2, 250], [4, 200]]) },
      { name: "Electric pump", rows: rows([[0, 980], [2, 750], [4, 670]]) },
      { name: "Diesel pump", rows: rows([[0, NaN]]).map((r) => ({ ...r, dis: "" })) },
    ],
  });
  assert.deepEqual(sectionVerdicts(t).map((v) => v.name), ["Town main", "Electric pump"]);
  assert.equal(summary(t).text, "Town main below demand");
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
