import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEquipment, deviceFor, deviceFlow, deviceLabel, FLOW_DEVICES, matchDevices, overLimit } from "../../src/lib/flowEquipment";
import type { FlowTest } from "../../src/db/types";

const find = (label: string) => {
  const d = deviceFor(label);
  assert.ok(d, label);
  return d;
};

test("46 devices from the flow charts, each named once", () => {
  assert.equal(FLOW_DEVICES.length, 46);
  assert.equal(new Set(FLOW_DEVICES.map(deviceLabel)).size, 46);
});

test("flows match the charts: the device's flow at 1 \" Hg × √\" Hg", () => {
  // Ambit 20T DN80 medium steel: 755.38 at 2, 1068.27 at 4, 2266.14 at 18 (chart)
  const d = find("Ambit 20T DN80 · Medium steel");
  assert.deepEqual(["2", "4", "18"].map((h) => deviceFlow(d, h)), [755, 1068, 2266]);
  // GCR Diamond 2 200mm medium: 4866 at 2, 8427 at 6 (chart)
  const g = find("GCR Diamond 2 annubar 200mm · Medium steel");
  assert.deepEqual(["2", "6"].map((h) => deviceFlow(g, h)), [4866, 8427]);
  // AWR 73 & 74 50mm Sched 40: 339 at 2 (chart)
  assert.equal(deviceFlow(find("AWR 73 & 74 annubar 50mm · Sched 40"), "2"), 339);
  // the Sched 40 21T 10" (labelled DN150 on the chart): 7815.45 at 2
  assert.equal(deviceFlow(find('Ambit 21T 10" · Sched 40'), "2"), 7815);
  assert.equal(deviceFlow(d, ""), null);
  assert.equal(deviceFlow(d, "0"), 0);
});

test("the chart's limit: a 20T DN80 past 18 \" Hg; annubars run the whole chart", () => {
  const d = find("Ambit 20T DN80 · Medium steel");
  assert.equal(overLimit(d, "18"), false);
  assert.equal(overLimit(d, "20"), true);
  assert.equal(overLimit(find("GCR Diamond 2 annubar 200mm · Medium steel"), "30"), false);
});

test("suggestions: words in any order, sizes written any way", () => {
  const labels = (q: string) => matchDevices(q).map(deviceLabel);
  assert.ok(labels("20t 80").includes("Ambit 20T DN80 · Medium steel"));
  assert.ok(labels("80 20t").includes("Ambit 20T DN80 · Medium steel"));
  assert.ok(labels('ambit 3"').includes('Ambit 20T 3" · Sched 40'));
  assert.deepEqual(labels("gcr 200"), ["GCR Diamond 2 annubar 200mm · Medium steel", "GCR Diamond 2 annubar 200mm · Sched 40"]);
  assert.deepEqual(labels("gcr 200 sched"), ["GCR Diamond 2 annubar 200mm · Sched 40"]);
  assert.deepEqual(labels("pitot"), []);
  assert.deepEqual(labels(""), []);
  assert.ok(deviceFor("  ambit 20t dn80 · medium steel ")!, "case and spaces don't matter");
  assert.equal(deviceFor("80 mm / 20T Ambient"), null);
});

const flowTest = (equipment: string, rows: { hg: string; flow: string; flowAuto?: boolean }[]): FlowTest =>
  ({ id: "t", siteId: "s", kind: "sprinkler", name: "Sprinkler", testedAt: 0, k: 0, demand: [], order: 0, createdAt: 0, updatedAt: 0, equipment, sections: [{ name: "Town main", rows: rows.map((r) => ({ dis: "", suc: "", ...r })) }] }) as FlowTest;

test("picking a device fills in the flows; typed ones are kept; another equipment clears them", () => {
  const t = flowTest("Ambit 20T DN80 · Medium steel", [
    { hg: "2", flow: "" },
    { hg: "4", flow: "760" }, // typed
    { hg: "", flow: "" },
    { hg: "6", flow: "", flowAuto: false }, // being typed
  ]);
  applyEquipment(t);
  const rows = t.sections[0].rows;
  assert.deepEqual(rows.map((r) => [r.flow, r.flowAuto]), [["755", true], ["760", undefined], ["", undefined], ["", false]]);
  // the " Hg changes: its flow follows
  rows[0].hg = "8";
  applyEquipment(t);
  assert.equal(rows[0].flow, "1511");
  // a different device
  t.equipment = "Ambit 21T DN80 · Medium steel";
  applyEquipment(t);
  assert.equal(rows[0].flow, "1511");
  // equipment not in the charts: the worked-out flows go, the typed one stays
  t.equipment = "65 mm / Pitot";
  applyEquipment(t);
  assert.deepEqual(rows.map((r) => r.flow), ["", "760", "", ""]);
  assert.equal(rows[0].flowAuto, undefined);
});

test("hydrants (flows typed off the pitot) are left alone", () => {
  const t = { ...flowTest("Ambit 20T DN80 · Medium steel", [{ hg: "2", flow: "" }]), kind: "hydrant" } as FlowTest;
  applyEquipment(t);
  assert.equal(t.sections[0].rows[0].flow, "");
});
