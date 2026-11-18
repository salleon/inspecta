import { test } from "node:test";
import assert from "node:assert/strict";
import { modeStats, newFan, newFfcpTest, seriesNames, testSummary } from "../../src/lib/ffcp";

test("names a series with at least two digits", () => {
  assert.deepEqual(seriesNames("SPF-", 1, 4), ["SPF-01", "SPF-02", "SPF-03", "SPF-04"]);
  assert.deepEqual(seriesNames("SAF-", 99, 100), ["SAF-099", "SAF-100"]);
  assert.deepEqual(seriesNames("KEF-", 3, 3), ["KEF-03"]);
});

test("counts each mode, and fails without a note", () => {
  const t = newFfcpTest();
  const a = newFan("SPF-01");
  a.marks = { "normal.run": "y", "normal.fault": "n", "fire.off": "n" };
  a.notes = { "fire.off": "Fan didn't stop" };
  t.fans = [a, newFan("SPF-02")];
  assert.deepEqual(modeStats(t, "normal"), { done: 2, total: 10, fails: 1, noNote: 1 });
  assert.deepEqual(modeStats(t, "fire"), { done: 1, total: 10, fails: 1, noNote: 0 });
  assert.deepEqual(testSummary(t), { text: "2 fans · 2 fails · 17 to do", tone: "fail" });
});

test("says when everything passed", () => {
  const t = newFfcpTest();
  const f = newFan("SEF-01");
  for (const m of ["normal", "fire"]) for (const k of ["run", "stop", "fault", "on", "off"]) f.marks[`${m}.${k}`] = "y";
  t.fans = [f];
  assert.deepEqual(testSummary(t), { text: "1 fan · all passed", tone: "pass" });
});
