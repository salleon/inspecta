import { test } from "node:test";
import assert from "node:assert/strict";
import { reportRows } from "../../src/lib/esrGrouping";
import type { Finding } from "../../src/db/types";

const mk = (id: string, esrCategory: string | undefined, note: string) => ({ finding: { id, note, esrCategory } as Finding });
const describe = (rows: ReturnType<typeof reportRows<{ finding: Finding }>>) =>
  rows.map((r) => (r.kind === "finding" ? `${r.ref ?? "-"}${r.kept ? "*" : ""} ${r.entry.finding.id}` : r.kind === "uncategorised" ? "UNCATEGORISED" : `${r.kind.toUpperCase()} ${r.code}`));

test("no categories: list order, no headings", () => {
  assert.deepEqual(describe(reportRows([mk("a", undefined, "x"), mk("b", undefined, "y")])), ["- a", "- b"]);
});

test("blue / yellow / grey structure, refs and Uncategorised last", () => {
  const rows = reportRows([
    mk("a", "6.3.4", "Fire damper access panel missing"),
    mk("b", "6.1", "Car park fan faulty"),
    mk("c", "6.3.1", "AHU not shutting down"),
    mk("d", "13", "Logbook missing"),
    mk("e", "6.3.4", "Fire damper fusible link"),
    mk("f", "4", "EEL failed"),
    mk("g", undefined, "Bin"),
  ]);
  assert.deepEqual(describe(rows), [
    "SECTION 4", "4.1 f",
    "SECTION 6", "ITEM 6.1", "6.1.1 b",
    "GROUP 6.3", "ITEM 6.3.1", "6.3.1.1 c", "ITEM 6.3.4", "6.3.4.1 a", "6.3.4.2 e",
    "SECTION 13", "13.1 d",
    "UNCATEGORISED", "- g",
  ]);
});

test("similar notes sit together", () => {
  const rows = reportRows([mk("a", "3.1", "Exit sign not illuminated"), mk("b", "3.1", "Exit sign diffuser cracked"), mk("c", "3.1", "Exit sign not illuminated")]);
  assert.deepEqual(describe(rows).slice(2), ["3.1.1 a", "3.1.2 c", "3.1.3 b"]);
});

test("old report numbers are kept (first) and new findings count on after them", () => {
  const rows = reportRows([mk("a", "1.8", "Door closer missing"), mk("b", "1.8", "1.8.3 still present"), mk("c", "1.8", "1.8.1 rectified"), mk("d", "1.6", "1.8.2 wrong category")]);
  assert.deepEqual(describe(rows), ["SECTION 1", "ITEM 1.6", "1.6.1 d", "ITEM 1.8", "1.8.1* c", "1.8.3* b", "1.8.4 a"]);
});
