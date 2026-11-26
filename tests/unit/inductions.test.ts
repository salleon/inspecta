import { test } from "node:test";
import assert from "node:assert/strict";
import { dueStage, dueText, inductionsHint, mergeInductions, usesGroup, groupSoonest, type Induction, type InductionGroup } from "../../src/lib/inductions";

const now = new Date(2026, 10, 26, 15, 30); // 26 Nov 2026, mid-afternoon


test("cut-offs: more than 60, 31–60, 8–30, 1–7, today or gone", () => {
  const on = (days: number) => {
    const d = new Date(2026, 10, 26 + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  assert.equal(dueStage(on(61), now), "far");
  assert.equal(dueStage(on(60), now), "60");
  assert.equal(dueStage(on(31), now), "60");
  assert.equal(dueStage(on(30), now), "30");
  assert.equal(dueStage(on(8), now), "30");
  assert.equal(dueStage(on(7), now), "7");
  assert.equal(dueStage(on(1), now), "7");
  assert.equal(dueStage(on(0), now), "gone");
  assert.equal(dueStage(on(-8), now), "gone");
  assert.equal(dueText(on(61), now), `Until ${new Date(2026, 10, 26 + 61).getDate()} Jan 2027`);
  assert.equal(dueText(on(48), now), "48 days left");
  assert.equal(dueText(on(1), now), "Tomorrow");
  assert.equal(dueText(on(0), now), "Due today");
  assert.equal(dueText(on(-1), now), "Expired 1 day ago");
  assert.equal(dueText(on(-8), now), "Expired 8 days ago");
  assert.equal(dueText(undefined, now), "No expiry");
});

const group = (id: string, code: string, expires?: string): InductionGroup => ({ id, name: id, colour: "#fff", code, expires, createdAt: 1, updatedAt: 1 });
const site = (id: string, o: Partial<Induction> = {}): Induction => ({ id, name: id, useGroup: false, code: "X", createdAt: 1, updatedAt: 1, ...o });

test("a site uses its group's code only when the group has one", () => {
  const groups = [group("mirvac", "MIR-1", "2027-01-01"), group("scentre", "")];
  assert.equal(usesGroup(site("a", { groupId: "mirvac", useGroup: true, code: "" }), groups)?.id, "mirvac");
  assert.equal(usesGroup(site("b", { groupId: "mirvac", useGroup: false }), groups), undefined);
  assert.equal(usesGroup(site("c", { groupId: "scentre", useGroup: true }), groups), undefined);
});

test("Settings hint counts sites and standalone group codes, and what's expired", () => {
  const groups = [group("mirvac", "MIR-1", "2026-11-20"), group("solo", "SOLO-1", "2027-06-01"), group("lend", "LL-1", "2027-06-01")];
  const sites = [site("a", { groupId: "mirvac", useGroup: true, code: "" }), site("b", { groupId: "lend", expires: "2026-12-10" }), site("c")];
  // 3 sites + "solo" on its own; Mirvac's code has run out (a uses it)
  assert.deepEqual(inductionsHint(groups, sites, now), { text: "4 inductions · 1 expired", expired: 1 });
  assert.deepEqual(inductionsHint([], [site("c", { expires: "2026-12-10" })], now), { text: "1 induction · 1 due within 30 days", expired: 0 });
  assert.deepEqual(inductionsHint([], [], now), { text: "None yet", expired: 0 });
});

test("a group's soonest date counts its sites' own codes", () => {
  const groups = [group("lend", "LL-1", "2027-06-01")];
  const sites = [site("b", { groupId: "lend", expires: "2026-12-06" }), site("a", { groupId: "lend", useGroup: true, code: "", expires: "2026-11-27" })];
  assert.equal(groupSoonest(groups[0], sites, groups, now), 10);
});

test("restore merge: new ones added, the later edit of one on both wins", () => {
  const mine = [{ id: "a", updatedAt: 5 }, { id: "b", updatedAt: 5 }];
  const theirs = [{ id: "a", updatedAt: 9 }, { id: "b", updatedAt: 1 }, { id: "c", updatedAt: 1 }];
  assert.deepEqual(mergeInductions(mine, theirs), { write: [{ id: "a", updatedAt: 9 }, { id: "c", updatedAt: 1 }], changed: 2 });
});
