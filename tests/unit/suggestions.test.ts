import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestCategories, learnCategory, unlearnCategory, learnedKeywords } from "../../src/lib/esrSuggest";

const top = (note: string, location = "") => {
  const s = suggestCategories(note, location);
  return s[0]?.matched ? s[0].code : undefined;
};

test("realistic notes suggest the right category first", () => {
  const cases: [string, string, string | undefined][] = [
    ["Fire door closer not self-closing, door held open with wedge", "Fire stair lobby", "1.6"],
    ["Extinguisher missing from bracket, no service tag", "Carpark ramp", "5.5"],
    ["Extingusher overdue for service", "", "5.5"], // typo
    ["Exit sign not illuminated", "Main entry", "3.1"],
    ["Emergency light failed discharge test", "", "4"],
    ["Unsealed cable penetration through fire rated wall", "Riser", "1.4"],
    ["Fire dampers access panel missing", "", "6.3.4"],
    ["Hose reel nozzle missing", "", "5.4"],
    ["FHR hose kinked", "", "5.4"],
    ["Sprinkler head painted over", "", "5.6"],
    ["Storage obstructing path of travel to exit", "Corridor", "2.4"],
    ["Evacuation diagram out of date", "Lift lobby", "12"],
    ["Smoke alarm chirping", "Unit 4", "7.1"],
    ["Fire indicator panel in fault", "", "7.2"],
    ["Booster block plan faded", "", "5.1"],
    ["Hydrant landing valve leaking", "", "5.2"],
    ["Stair pressurization fan not running", "", "6.4"],
    ["WIP handset missing", "", "8.1"],
    ["Re-entry sign missing on fire door", "Fire stair", "3.3"],
    ["Handrail loose", "Fire stair B", "2.2"],
    ["Exit door deadlocked, no thumb turn", "", "2.5"],
    ["Grease trap lid cracked", "Kitchen", undefined], // nothing matches
  ];
  for (const [note, location, want] of cases) assert.equal(top(note, location), want, note);
});

test("shorthand the inspector uses", () => {
  assert.equal(top("HR cabinet obstructed"), "5.4");
  assert.equal(top("FHR nozzle missing"), "5.4");
  assert.equal(top("EEL failed test"), "4");
  assert.equal(top("Decal missing from exit sign"), "3.1");
  assert.equal(top("AC not in fire mode"), "6.3.1");
});

test("sprinkler notes favour 5.6 over wall wetting 1.10", () => {
  assert.equal(top("Bulb broken"), "5.6");
  assert.equal(top("Sprinkler head corroded"), "5.6");
  assert.equal(top("Wall wetting sprinkler obstructed"), "1.10");
});

test("6.3 is a heading, never suggested itself", () => {
  const codes = suggestCategories("fire mode hvac air conditioning mechanical ventilation", "").map((s) => s.code);
  assert.ok(!codes.includes("6.3"), codes.join(","));
});

test("an old report number names the category", () => {
  assert.equal(top("1.8.1 still present"), "1.8");
  assert.equal(top("6.3.4.2 rectified"), "6.3.4");
  assert.equal(top("13.2 rectified"), "13");
});

test("learning from picks, and taking back a mis-tap", () => {
  learnCategory("Sump pump float stuck", "13");
  assert.equal(top("sump pump"), "13");
  unlearnCategory("Sump pump float stuck", "13");
  learnCategory("Sump pump float stuck", "5.1");
  assert.ok(learnedKeywords().every((k) => k.code !== "13"), "13 was unlearnt");
  assert.ok(learnedKeywords().some((k) => k.word === "sump" && k.code === "5.1"));
});
