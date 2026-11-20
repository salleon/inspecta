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

test("stair Excel: summary sheets first, laid out like the PDF; nothing cut off", () => {
  const wb = new ExcelJS.Workbook();
  addStairSheets(wb, [{ ...general, notes: [{ location: "B1", text: "A long note that has to wrap across the sheet, well past the width of one cell, so its row grows to fit it." }] }], { ...sys, notes: "Relief damper is manual" }, { name: "Site", address: "" });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Summary SPF-1 · South", "Runs SPF-1 · South"]);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell(1, 1).value, "Stair pressurisation · System testing · Summary");
  assert.equal(ws.getCell(2, 1).value, "SPF-1 · South", "the stair's name, as big as the title");
  assert.equal(ws.getCell(2, 1).font.size, ws.getCell(1, 1).font.size);
  assert.ok(ws.columns.every((c) => c.width === 16), "every column the same width");
  // the tile: its label, its result, then a line each for the max and how it was measured
  const col = ws.getColumn(1).values as unknown[];
  const at = col.indexOf("Noise, stair (average)");
  assert.equal(ws.getCell(at + 1, 1).value, "54.5 dB(A) ✓");
  assert.equal(ws.getCell(at + 2, 1).value, "max 65.4 dB(A)");
  assert.equal(ws.getCell(at + 3, 1).value, "Phone (indicative)");
  // the notes: the general notes, then the test notes, each wrapped in a wide cell, its row sized to it
  assert.ok(col.indexOf("GENERAL NOTES") < col.indexOf("TEST NOTES"));
  const note = col.indexOf("1 · B1");
  assert.equal(ws.getCell(note, 2).alignment.wrapText, true);
  assert.ok(ws.getRow(note).height >= 28, "tall enough for two lines");
});
