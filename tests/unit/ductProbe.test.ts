import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_SECTIONS, GENERAL_SECTIONS, onceStatus, probeLatest, probeLine, probeName, probeResult, probeZone, sectionsFor, stairTestHasData } from "../../src/lib/stairTest";
import { stairPages } from "../../src/lib/stairPrint";
import type { SpfSystem, StairTest } from "../../src/db/types";

const sys: SpfSystem = { edition: "1998", type: "Purge", notes: "", stairs: [{ id: "s1", name: "Front", from: "G", to: "3", extra: [], fan: "SPF-1" }] };
const test0 = (over: Partial<StairTest> = {}): StairTest => ({ id: "t", siteId: "x", kind: "annual", sections: sectionsFor("annual"), testedAt: 0, doors: {}, once: {}, notes: [], order: 0, createdAt: 0, updatedAt: 0, ...over });

test("duct probe: an extra test for General and Annual, not a default", () => {
  assert.ok(GENERAL_SECTIONS.includes("probe"));
  assert.deepEqual(ALL_SECTIONS.slice(-3), ["fan", "probe", "quick"]);
  assert.ok(!sectionsFor("annual").includes("probe"));
  assert.ok(!sectionsFor("comm").includes("probe"));
});

test("duct probe: 60 to 90 s passes; 5 s either side is a marginal fail, the rest a plain fail", () => {
  assert.equal(probeZone(60), "pass");
  assert.equal(probeZone(90), "pass");
  assert.equal(probeZone(55), "marginal");
  assert.equal(probeZone(59.9), "marginal");
  assert.equal(probeZone(95), "marginal");
  assert.equal(probeZone(54.9), "fail");
  assert.equal(probeZone(95.1), "fail");
  assert.equal(probeZone(10), "fail");
});

test("duct probe: a go's result needs a time, or a fail ticked", () => {
  assert.equal(probeResult({}), null);
  assert.equal(probeResult({ started: 1 }), null, "still timing");
  assert.equal(probeResult({ time: 74 }), "pass");
  assert.equal(probeResult({ noStop: true }), "fail", "the equipment didn't stop: no time needed");
  assert.equal(probeResult({ noStop: true, time: 74 }), "fail");
  assert.equal(probeResult({ failed: true }), "fail", "didn't restart");
  assert.equal(probeResult({ time: 92 }), "marginal");
});

test("duct probe: named after the fan until typed over; a retest stands over the test", () => {
  assert.equal(probeName({}, "SPF-1", 0), "SPF-1 duct probe");
  assert.equal(probeName({}, "SPF-1", 2), "SPF-1 duct probe · retest 2");
  assert.equal(probeName({ name: "DP-1 L4" }, "SPF-1", 0), "DP-1 L4");
  assert.equal(probeName({ name: "  " }, "SPF-1", 0), "SPF-1 duct probe");
  const list = [{ time: 104 }, { time: 78 }, {}];
  assert.equal(probeLatest(list)?.n, 1);
  assert.equal(probeLatest(list)?.result, "pass");
  assert.deepEqual(onceStatus("probe", { probe: list }, sys), { done: true, text: "78 s ✓", fail: false });
  assert.deepEqual(onceStatus("probe", { probe: [{ failed: true }] }, sys), { done: true, text: "No restart ✗", fail: true });
  assert.deepEqual(onceStatus("probe", { probe: [{}] }, sys), { done: false, text: "", fail: false });
  // marginal still fails, flagged so it shows yellow
  assert.deepEqual(onceStatus("probe", { probe: [{ time: 92 }] }, sys), { done: true, text: "92 s · marginal ✗", fail: true, marginal: true });
  assert.equal(probeLine({ time: 57 }, "SPF-1", 0), "SPF-1 duct probe · equipment shut down · restarted after 57 s · Fail (marginal)");
});

test("duct probe: counts as data, and prints as a tile, the latest go with the earlier ones under it", () => {
  assert.equal(stairTestHasData(test0({ once: { s1: { probe: [{}] } } })), false);
  assert.equal(stairTestHasData(test0({ once: { s1: { probe: [{ notes: "access via plant room" }] } } })), true);
  const t = test0({ sections: [...sectionsFor("annual"), "probe"], once: { s1: { probe: [{ time: 104 }, { time: 78.4, notes: "reset at FIP" }] } } });
  const page = stairPages(t, sys, { name: "Site", address: "" })[0];
  const tile = page.tiles.find((x) => x.label === "Duct probe · fan SPF-1")!;
  assert.equal(tile.value, "78 s ✓");
  assert.deepEqual(tile.lines, ["Equipment shut down", "Earlier: SPF-1 duct probe · equipment shut down · restarted after 104 s · Fail", "reset at FIP"]);
  assert.equal(tile.fail, false);
  assert.equal(probeLine({ failed: true }, "SPF-2", 0), "SPF-2 duct probe · equipment shut down · failed to restart · Fail");
  assert.equal(probeLine({ noStop: true }, "SPF-2", 0), "SPF-2 duct probe · failed to stop equipment · Fail");
  assert.deepEqual(onceStatus("probe", { probe: [{ noStop: true }] }, sys), { done: true, text: "Didn't stop ✗", fail: true });
  // not on a test that isn't doing it
  assert.equal(stairPages(test0(), sys, { name: "Site", address: "" })[0].tiles.some((x) => x.label.startsWith("Duct probe")), false, "not tested: no tile");
});
