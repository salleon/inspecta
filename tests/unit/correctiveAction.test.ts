// Pre-filled corrective action: a note that's clearly one of the common
// defects, filed under that defect's ESR category, gets its Report Wording;
// anything unclear stays blank (a wrong one is worse than none).
import { test } from "node:test";
import assert from "node:assert/strict";
import { commonDefectFor, suggestionFor } from "../../src/lib/correctiveAction";
import { COMMON_DEFECTS } from "../../src/lib/commonDefects";

const id = (note: string, category?: string) => commonDefectFor(note, category)?.id;

test("common notes under their category find their defect", () => {
  const cases: [string, string, string][] = [
    ["Fire door held open with a wedge", "1.6", "CI-02"],
    ["Stair 2 fire door not latching", "1.6", "CI-06"],
    ["Pipe penetration through wall unsealed", "1.4", "CI-01"],
    ["Exit sign not illuminated at level 3 lobby", "3.1", "CI-30"],
    ["Exit sign pointing wrong direction", "3.1", "CI-31"],
    ["Storage within 500mm of sprinkler heads", "5.6", "CI-49"],
    ["Sprinkler bulb painted over", "5.6", "CI-53"],
    ["Hose reel cupboard used for storage of cleaning equipment", "5.4", "CI-45"],
    ["Fire extinguisher missing from bracket", "5.5", "CI-47"],
    ["Boxes stored in fire stair obstructing path of travel", "2.2", "CI-12"],
    ["Automatic sliding doors didn't open during fire trip", "2.5", "CI-20"],
    ["Fan isolator missing 003 lock", "6.1", "CI-61"],
    ["Evacuation diagram outdated", "12", "CI-65"],
  ];
  for (const [note, category, want] of cases) assert.equal(id(note, category), want, note);
});

test("no ESR category, or the wrong one: nothing", () => {
  assert.equal(id("Fire door held open with a wedge"), undefined);
  assert.equal(id("Fire door held open with a wedge", "5.6"), undefined);
  assert.equal(id("Exit sign not illuminated", "5.5"), undefined);
});

test("the category can stand in for the subject, never for the specific words", () => {
  assert.equal(id("held open with a wedge", "1.6"), "CI-02");
  assert.equal(id("not illuminated", "3.1"), "CI-30");
  assert.equal(id("Electric sprinkler pump noisy", "5.6"), undefined, "not the spare sprinkler box");
});

test("no guessing at typos", () => {
  assert.equal(id("Sprinkler booster points has no stortz installed", "5.1"), undefined, "point is not paint");
  assert.equal(id("sprinkler head point", "5.6"), undefined);
});

// A real report (Coles Turramurra) with the engineer's verdicts: the ones
// marked wrong must not come back, the ones marked right must stay.
test("real report: the wrong ones are gone, the right ones stay", () => {
  const rows: [string, string, string | undefined][] = [
    // marked correct
    ["POT obstructed \nFinal egress", "2.4", "CI-12"],
    ["Final egress Door obstructed \n2.1.3", "2.4", "CI-12"],
    ["EEL not lit", "3.1", "CI-30"],
    ["3.3.1 \nSignage required on final egress Door", "3.3", "CI-04"],
    ["5.6.2\nStorage stacked above limit", "5.6", "CI-49"],
    // marked wrong (painted sprinkler, spare box, discharge pattern)
    ["Sprinkler booster points has no stortz installed ", "5.1", undefined],
    ["Can't access sprinkler booster point ", "5.1", undefined],
    ["Electric sprinkler pump noisy\n5.1.3", "5.6", undefined],
    ["Sprinkler Block Plan", "5.6", undefined],
    // marked wrong: the awning wording EnFact supplied instead
    ["Awning overhang approx 2.4m overhang \nSprinkler coverage req?", "5.6", "EF-01"],
    // left blank, and still should be
    ["2.1m overhang awning", "5.6", undefined],
    ["Plastic fasteners on fire collars", "1.4", undefined],
    ["Hydrant Block plan", "5.2", undefined],
    ["Not 100mm clearance landing Valve to wall", "5.2", undefined],
    ["OWS amp unplugged on arrival \nReconnected during test ", "8.2", undefined],
  ];
  for (const [note, category, want] of rows) assert.equal(id(note, category), want, note);
});

// A second real report (Strawberry Hills Hotel), finished by the engineer:
// each note should get the defect whose wording matches what was written.
test("real report: Strawberry Hills Hotel", () => {
  const rows: [string, string, string | undefined][] = [
    ["Electrical cupboards on path of travel to an egress require to be fitted with smoke seal and be non conbustable.", "1.7", "EF-11"],
    ["Final egress doors can all be deadbolted shut", "2.4", "CI-11"],
    ["Padlock on final egress door into alley", "2.4", "CI-11"],
    ["Final egress Door obstructed. A person must not place anything that may obstruct the free passsage of persons in a fire exit area for a building.", "2.4", "CI-12"],
    ["Final egress auto door does not drive open in  fire trip", "2.5", "CI-20"],
    ["A lack of exit signage fails to indicate the exit down corridor", "3.1", "CI-32"],
    ["Exit Sign not illuminated", "3.1", "CI-30"],
    ["Sign above bar does not indicate towards egress Door", "3.1", "CI-31"],
    ["Our inspection identified possible deficiencies in regards to the installed emergency lighting located near changes of level and within stairs used for the purpose of egress.", "4", "EF-13"],
    ["No signage indicating the sprinkler valve box location", "5.1", "EF-03"],
    ["Extinguisher obstructed", "5.5", "EF-02"],
    ["Annual Sprinkler System Flow Test not undertaken at SIT", "5.6", "EF-05"],
    ["24 yearly Sprinkler head test compliance", "5.6", "EF-06"],
    ["Sprinkler booster not maintained since 2025", "5.6", "EF-04"],
    ["Plant room used as a storage room with combustible material (ie Furniture, gas cans & etc…)", "6.1", "EF-07"],
    ["Mechanical equipment did not shut down in Wet or Dry trip- as required by AS1668", "6.3.1", "CI-60"],
    ["Sound level of BOW is low in some areas.", "8.2", "CI-37"],
    ["Provide evidence of 5 yearly Sound Pressure Level test results.", "8.2", "EF-12"],
    ["Outside gong does not function in alarm", "8.2", "EF-09"],
    ["Evac plan out of date \nExpired 2020, due for replacement 2025", "12", "CI-65"],
    ["Hazardous materials stored in plantroom", "13", "EF-08"],
    ["AFSS from 2022 on display. Must be updated to current year (2026)", "13", "EF-10"],
    // one-off, site-specific: left for the engineer
    ["No safety record of basement exit routes acknowledgements, as specified in the FER.", "13", undefined],
  ];
  for (const [note, category, want] of rows) assert.equal(id(note, category), want, note);
});

test("unclear or uncommon notes stay blank", () => {
  for (const [note, c] of [["Cracked tile in bathroom", "13"], ["Door handle loose", "1.6"], ["Gap under fire door exceeds 10mm", "1.6"], ["", "1.6"]]) {
    assert.equal(id(note, c), undefined, note);
  }
});

test("every defect in the table has wording, match words and categories", () => {
  assert.equal(COMMON_DEFECTS.length, 78);
  for (const d of COMMON_DEFECTS) {
    assert.ok(d.wording.trim(), d.id);
    assert.ok(d.match.length && d.match.every((g) => g.length), d.id);
    assert.ok(d.categories.length, d.id);
  }
});

test("confidence: High with the problem and subject in the note, Low when the category supplies the subject", () => {
  assert.equal(suggestionFor("Fire door held open with a wedge", "1.6")?.confidence, "High");
  assert.equal(suggestionFor("POT obstructed", "2.4")?.confidence, "High");
  assert.equal(suggestionFor("held open with a wedge", "1.6")?.confidence, "Low");
  assert.equal(suggestionFor("5.6.2\nStorage stacked above limit", "5.6")?.confidence, "Low");
});
