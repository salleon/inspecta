import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import type { SpfSystem, StairTest } from "../../src/db/types";
import { addStairSheets } from "../../src/lib/stairExcel";

const sys: SpfSystem = { edition: "1991", type: "Purge", notes: "", stairs: [{ id: "s1", name: "South", from: "B2", to: "G", extra: [], fan: "SPF-1" }] };
const general: StairTest = {
  id: "t",
  siteId: "x",
  kind: "general",
  sections: ["vel", "noise"],
  testedAt: 0,
  doors: { s1: { B1: { vel: "1.2" } } },
  once: { s1: { noiseStair: "54.5", noiseRef: "65.4", noiseRefSource: "phone" } },
  notes: [],
  order: 0,
  createdAt: 0,
  updatedAt: 0,
};

test("stair Excel: system testing's summary sheet first; nothing cut off", () => {
  const wb = new ExcelJS.Workbook();
  addStairSheets(wb, [general], sys, { name: "Site", address: "" });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Summary SPF-1 · South", "SPF SPF-1 · South"]);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell(1, 1).value, "Stair pressurisation · System testing · Summary");
  assert.ok(ws.getCell(1, 1).isMerged, "the title spans the sheet");
  // a reading: label on the left, its value and where it came from a line each, wrapped, across the rest
  const row = ws.getColumn(1).values.indexOf("Noise, stair (average)");
  const v = ws.getCell(row, 3);
  assert.match(String(v.value), /^54\.5 dB\(A\) ✓\nmax 65\.4 dB\(A\)\nindicative \(phone\)$/);
  assert.equal(v.alignment.wrapText, true);
  assert.ok(ws.getRow(row).height >= 3 * 12, "tall enough for its three lines");
});
