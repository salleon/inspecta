import { test } from "node:test";
import assert from "node:assert/strict";
import { levelsRead, renameDoorLevels } from "../../src/lib/stairTest";
import { doorFails, doorMarginal, kindsFor, latestDoor, newRun, stairDoors, stairLabel } from "../../src/lib/stairTest";
import { adjacentDoor, doorsOpen, doorStats, isCustomLevel, joinLevel, levelChanges, levelChip, levelName, levelsEdited, limits, onceStatus, sectionsFor, splitLevel, stairLevels, stairTestHasData, stairTestSummary, typeFor } from "../../src/lib/stairTest";
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
  assert.deepEqual(doorStats(t, s.stairs[0], "vel", s), { done: 2, fails: 1, marginal: 0, total: 4 });
  assert.deepEqual(doorStats(t, s.stairs[0], "force", s), { done: 1, fails: 1, marginal: 0, total: 4 });
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
  assert.equal(page.subtitle, "SPF-1 · Front");
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

test("car parks, typed level names and a reviewed layout", () => {
  assert.deepEqual(stairLevels({ from: "P2", to: "2", extra: [] }), ["2", "1", "G", "P1", "P2"], "below ground as the bottom end is");
  assert.deepEqual(splitLevel("P3"), { type: "P", num: "3" });
  assert.equal(levelName("P1"), "Car park 1");
  assert.equal(levelName("Plant room"), "Plant room");
  assert.ok(isCustomLevel("Plant room") && !isCustomLevel("B2") && !isCustomLevel("26"));
  assert.equal(levelChip("Plant room"), "PR");
  assert.equal(levelChip("Podium"), "POD");
  assert.equal(levelChip("12A"), "12A");
  const stair = { from: "G", to: "3", extra: [], levels: ["Plant room", "3", "1", "G"] };
  assert.deepEqual(stairLevels(stair), ["Plant room", "3", "1", "G"], "the reviewed layout");
  assert.deepEqual(levelChanges(stair), ["no 2", "added Plant room"]);
  assert.ok(levelsEdited(stair));
  assert.ok(!levelsEdited({ from: "G", to: "3", levels: ["3", "2", "1", "G"] }));
});

test("a level has one door unless more are set: on every level, or added at one", () => {
  const st = { from: "P3", to: "P1", extra: [] };
  assert.deepEqual(stairDoors(st).map((d) => d.label), ["P1", "P2", "P3"]);
  assert.deepEqual(stairDoors({ ...st, more: { P2: 1 } }).map((d) => d.label), ["P1", "P2 A", "P2 B", "P3"]);
  const two = stairDoors({ ...st, doors: 2, more: { P3: 1 } });
  assert.deepEqual(two.map((d) => d.label), ["P1 A", "P1 B", "P2 A", "P2 B", "P3 A", "P3 B", "P3 C"]);
  // the first door keeps the level as its key, so old readings stay where they were
  assert.deepEqual(two.slice(0, 2).map((d) => d.key), ["P1", "P1\tB"]);
});

test("stairs are named by their name, else their fan", () => {
  const st = (id: string, fan: string, name = "") => ({ id, name, from: "G", to: "1", extra: [], fan });
  assert.equal(stairLabel(st("a", "SPF 2")), "SPF 2");
  assert.equal(stairLabel(st("a", "SPF 2", "East stairwell")), "SPF 2 · East stairwell");
  assert.equal(stairLabel(st("a", "SPF-")), "No fan name");
});

test("a pass within 0.1 m/s or 5 N of the limit is marginal; below the meter fails", () => {
  const s = sys("2015");
  const m = (vel: string) => [doorFails("vel", { vel }, s), doorMarginal("vel", { vel }, s)];
  assert.deepEqual(m("0.99"), [true, false]);
  assert.deepEqual(m("1"), [false, true]);
  assert.deepEqual(m("1.1"), [false, true]);
  assert.deepEqual(m("1.11"), [false, false]);
  assert.deepEqual(m("<0.25"), [true, false]);
  assert.equal(doorMarginal("force", { force: "104" }, s), false);
  assert.equal(doorMarginal("force", { force: "105" }, s), true);
  assert.equal(doorMarginal("force", { force: "110" }, s), true);
  assert.equal(doorFails("force", { force: "111" }, s), true);
});

test("general system testing: velocities plus what's added, runs, and each door's latest reading", () => {
  assert.deepEqual(sectionsFor("general"), ["vel"]);
  assert.deepEqual(sectionsFor("general", ["noise", "force"]), ["vel", "force", "noise"]);
  assert.deepEqual(kindsFor("enfact"), ["general", "annual", "custom"]);
  assert.deepEqual(kindsFor("contractor"), ["general", "annual", "comm", "quick", "custom"]);
  const s = sys("2015");
  const t = test0({ kind: "general", sections: ["vel"], doors: { s1: { "3": { vel: "0.4" }, "2": { vel: "1.5" } } }, runs: [{ ...newRun(" damper shut "), doors: { s1: { "3": { vel: "1.2" } } } }] });
  assert.equal(t.runs![0].change, "damper shut");
  assert.equal(latestDoor(t, "s1", "3", "vel")?.vel, "1.2");
  assert.equal(latestDoor(t, "s1", "3", "vel", 0)?.vel, "0.4", "as it was before run 2");
  assert.equal(latestDoor(t, "s1", "2", "vel")?.vel, "1.5", "not read again: run 1's stands");
  assert.deepEqual(doorStats(t, s.stairs[0], "vel", s), { done: 2, fails: 0, marginal: 0, total: 4 });
  assert.equal(stairTestSummary(t, s).text, "2 of 4 doors · all pass");
  assert.ok(stairTestHasData(test0({ kind: "general", runs: [{ at: 0, change: "", doors: { s1: { "1": { vel: "1" } } } }] })));
  // the report: a table for each run, only the stairs read in it
  const [page] = stairPages(t, s, { name: "Site", address: "" });
  assert.equal(page.subtitle, "All stairs");
  assert.deepEqual(page.tables!.map((x) => x.title.replace(/\d\d:\d\d/, "T")), ["Run 1 · T · As found · Average velocity m/s (min 1)", "Run 2 · T · damper shut · Average velocity m/s (min 1)"]);
  assert.deepEqual(page.tables![1].head, ["Level", "SPF-1\nFront"]);
  assert.deepEqual(page.tables![1].rows[0], { cells: ["3", "1.2"], fails: [false, false], warns: [false, false] });
  assert.deepEqual(page.tables![0].rows[0].fails, [false, true]);
});

test("a level with two doors has a report row for each", () => {
  const s = sys("1998");
  s.stairs[0].more = { "2": 1 };
  const [page] = stairPages(test0({ doors: { s1: { "2": { vel: "1.05" }, "2\tB": { vel: "0.5" } } } }), s, { name: "Site", address: "" });
  assert.deepEqual(page.rows.map((r) => r.cells[0]), ["3", "2 A", "2 B", "1", "G"]);
  assert.deepEqual([page.rows[1].cells[2], page.rows[1].warns![2], page.rows[2].cells[2], page.rows[2].fails[2]], ["1.05", true, "0.5", true]);
});

test("a renamed level takes its readings with it: every door, every run", () => {
  const t = test0({ kind: "general", doors: { s1: { P1: { vel: "1.2" }, "P1\tB": { vel: "0.9" }, P2: { vel: "1" } }, s2: { P1: { vel: "2" } } }, runs: [{ at: 0, change: "", doors: { s1: { P1: { vel: "1.4" } } } }] });
  assert.deepEqual([...levelsRead([t], "s1")].sort(), ["P1", "P2"]);
  const next = renameDoorLevels(t, "s1", { P1: "B1" })!;
  assert.deepEqual(Object.keys(next.doors.s1).sort(), ["B1", "B1\tB", "P2"]);
  assert.equal(next.runs![0].doors.s1.B1.vel, "1.4");
  assert.deepEqual(next.doors.s2, { P1: { vel: "2" } }, "other stairs are left alone");
  assert.equal(renameDoorLevels(t, "s1", { P9: "B9" }), null, "nothing to move");
  // a name that already has readings keeps its own
  assert.equal(renameDoorLevels(t, "s1", { P1: "P2" }), null);
});
