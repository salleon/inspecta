// Pre-filled corrective action: a note that's clearly one of the common
// defects gets its Report Wording; anything unclear stays blank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commonDefectFor } from "../../src/lib/correctiveAction";
import { COMMON_DEFECTS } from "../../src/lib/commonDefects";

const id = (note: string, category?: string) => commonDefectFor(note, category)?.id;

test("common notes find their defect", () => {
  const cases: [string, string][] = [
    ["Fire door held open with a wedge", "CI-02"],
    ["Stair 2 fire door not latching", "CI-06"],
    ["Pipe penetration through wall unsealed", "CI-01"],
    ["Exit sign not illuminated at level 3 lobby", "CI-30"],
    ["No exit sign above exit door to stair 1", "CI-27"],
    ["Exit sign pointing wrong direction", "CI-31"],
    ["Storage within 500mm of sprinkler heads", "CI-49"],
    ["Sprinkler bulb painted over", "CI-53"],
    ["Hose reel cupboard used for storage of cleaning equipment", "CI-45"],
    ["Fire extinguisher missing from bracket", "CI-47"],
    ["Boxes stored in fire stair obstructing path of travel", "CI-12"],
    ["EP&A notice screwed on the fire door", "CI-18"],
    ["Automatic sliding doors didn't open during fire trip", "CI-20"],
    ["Fan isolator missing 003 lock", "CI-61"],
    ["Evacuation diagram outdated", "CI-65"],
  ];
  for (const [note, want] of cases) assert.equal(id(note), want, note);
});

test("the ESR category can stand in for the subject", () => {
  assert.equal(id("held open with a wedge"), undefined);
  assert.equal(id("held open with a wedge", "1.6"), "CI-02");
  assert.equal(id("not illuminated", "3.1"), "CI-30");
});

test("unclear or uncommon notes stay blank", () => {
  for (const note of ["Cracked tile in bathroom", "Emergency light not working", "Door handle loose", "Gap under fire door exceeds 10mm", "", "   "]) {
    assert.equal(id(note), undefined, note);
  }
});

test("every defect in the table has wording and match words", () => {
  assert.equal(COMMON_DEFECTS.length, 65);
  for (const d of COMMON_DEFECTS) {
    assert.ok(d.wording.trim(), d.id);
    assert.ok(d.match.length && d.match.every((g) => g.length), d.id);
  }
});
