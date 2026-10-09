import { test } from "node:test";
import assert from "node:assert/strict";
import { adjacentDoor, doorsOpen, doorStats, joinLevel, levelName, limits, onceStatus, sectionsFor, splitLevel, stairLevels, stairTestHasData, stairTestSummary, typeFor } from "../../src/lib/stairTest";
import { stairPages } from "../../src/lib/stairPrint";
import type { SpfSystem, StairTest } from "../../src/db/types";

const sys = (edition: SpfSystem["edition"], type: SpfSystem["type"] = "Purge"): SpfSystem => ({
  edition,
  type,
  notes: "",
  stairs: [{ id: "s1", name: "Front", from: "G", to: "3", extra: [], fan: "SPF-1" }],
});
const test0 = (over: Partial<StairTest> = {}): StairTest => ({
  id: "t",
  siteId: "x",
  kind: "annual",
  sections: sectionsFor("annual"),
  testedAt: 0,
  doors: {},
  once: {},
  notes: [],
  order: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

test("a stair's doors run from the top down, extra doors first", () => {
  assert.deepEqual(stairLevels({ from: "G", to: "3", extra: [] }), ["3", "2", "1", "G"]);
  assert.deepEqual(stairLevels({ from: "B2", to: "1", extra: ["Plant room"] }), ["Plant room", "1", "G", "B1", "B2"]);
  assert.deepEqual(stairLevels({ from: "3", to: "1", extra: [] }), ["3", "2", "1"], "either way round");
});

test("the other door open: the level above, the top one below; none for zone", () => {
  const levels = ["3", "2", "1", "G"];
  assert.equal(adjacentDoor(levels, 0, { type: "Purge" }), "2");
  assert.equal(adjacentDoor(levels, 2, { type: "Purge" }), "2");
  assert.equal(adjacentDoor(levels, 2, { type: "Zone" }), "");
});

test("the edition sets the limits", () => {
  assert.deepEqual(limits({ edition: "1979" }), { vel: 1, force: 110, rest: 60, noiseStair: 80, noiseOcc: null, pa: 50 });
  assert.equal(limits({ edition: "1991" }).noiseOcc, null);
  assert.equal(limits({ edition: "1998" }).noiseOcc, 65);
  assert.equal(limits({ edition: "2015" }).pa, null);
});

test("the edition's types and doors open", () => {
  assert.equal(typeFor("1979", "Purge"), "One test");
  assert.equal(typeFor("2015", "Shutdown"), "Shutdown");
  assert.equal(typeFor("1991", "Shutdown"), "Purge");
  assert.match(doorsOpen({ edition: "1998", type: "Purge" }).join(" "), /Compartment above/);
  assert.match(doorsOpen({ edition: "1991", type: "Zone" }).join(" "), /Fire floor only/);
  assert.match(doorsOpen({ edition: "2015", type: "Purge" }).join(" "), /Every stair serving it/);
});

test("doors done and failing; once-a-stair results", () => {
  const s = sys("1998");
  const t = test0({ doors: { s1: { "3": { vel: "0.8", force: "120", latch: "y" }, "2": { vel: "1.2" } } }, once: { s1: { restTime: "12", fan: { off: "y", relief: "n" } } } });
  assert.deepEqual(doorStats(t, s.stairs[0], "vel", s), { done: 2, fails: 1, total: 4 });
  assert.deepEqual(doorStats(t, s.stairs[0], "force", s), { done: 1, fails: 1, total: 4 });
  assert.deepEqual(onceStatus("rest", t.once.s1, s), { done: true, text: "12 s ✗", fail: true });
  assert.equal(onceStatus("fan", t.once.s1, s).text, "1 failed");
  assert.deepEqual(stairTestSummary(t, s), { text: "2 of 4 doors · 1 fail", fail: true });
  assert.ok(stairTestHasData(t));
  assert.ok(!stairTestHasData(test0()));
});

test("the report keeps every column; anything not tested is blank", () => {
  const s = sys("1998");
  // custom: velocities only
  const t = test0({ kind: "custom", sections: ["vel"], doors: { s1: { "3": { vel: "0.9", force: "200" } } } });
  const [page] = stairPages(t, s, { name: "Site", address: "" });
  assert.equal(page.head.length, 5);
  assert.deepEqual(page.rows[0].cells, ["3", "2", "0.9", "", ""], "force isn't in this test, so it stays blank");
  assert.deepEqual(page.rows[0].fails, [false, false, true, false, false]);
  assert.ok(page.boxes.every((b) => b.value === ""));
  assert.equal(page.subtitle, "Stair 1 (Front)");
});

test("levels are a type and a number; ground in any range across it, the others only at the ends", () => {
  assert.deepEqual(stairLevels({ from: "B2", to: "3", extra: [] }), ["3", "2", "1", "G", "B1", "B2"]);
  assert.deepEqual(stairLevels({ from: "LG", to: "2", extra: [] }), ["2", "1", "G", "LG"]);
  assert.deepEqual(stairLevels({ from: "G", to: "UG", extra: [] }), ["UG", "G"]);
  assert.deepEqual(stairLevels({ from: "B1", to: "M", extra: [] }), ["M", "G", "B1"]);
  assert.deepEqual(splitLevel("B2"), { type: "B", num: "2" });
  assert.deepEqual(splitLevel("26"), { type: "", num: "26" });
  assert.equal(joinLevel("B", "3"), "B3");
  assert.equal(joinLevel("G", "4"), "G", "ground has no number");
  assert.equal(levelName("B2"), "Basement 2");
  assert.equal(levelName("R"), "Roof");
});
