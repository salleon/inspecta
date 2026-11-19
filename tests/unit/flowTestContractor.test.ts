// Flow tests in the Contractor app (lib/edition): the graph's lines are the
// inspector's to choose, and every supply kind is offered. (Its own file:
// which app it is is settled when lib/edition loads.)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FlowTest } from "../../src/db/types";

(globalThis as { __EDITION__?: string }).__EDITION__ = "contractor";
const { newFlowTest, chartSvg, nameOptions, lineShown, graphLines } = await import("../../src/lib/flowTest");

const make = (over: Partial<FlowTest>): FlowTest => ({ ...newFlowTest("s1", "sprinkler"), id: "t", order: 0, createdAt: 0, updatedAt: 0, ...over });
const rows = (pairs: [number, number, number?][]) => pairs.map(([hg, dis, suc]) => ({ hg: String(hg), flow: String(Math.round(534.15 * Math.sqrt(hg) * 10) / 10), dis: String(dis), suc: suc === undefined ? "" : String(suc) }));

test("graph lines: discharge shown, suction hidden until ticked, per line", () => {
  const t = make({
    demand: [],
    sections: [
      { name: "Town main", rows: rows([[0, 460], [2, 250]]) },
      { name: "Diesel pump 1", rows: rows([[0, 980, 60], [2, 750, 50]]) },
      { name: "Diesel pump 2", rows: rows([[0, 970, 80], [2, 740, 70]]) },
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

test("supply names: every kind", () => {
  const t = make({ sections: [{ name: "Booster pump", rows: [] }, { name: "", rows: [] }] });
  assert.deepEqual(nameOptions(t, 1).map((o) => o.name), ["Town main", "Electric pump", "Diesel pump", "Booster pump 2", "Jockey pump"]);
});
