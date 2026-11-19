import type { Site, SpfStair, SpfSystem, StairOnce, StairSection, StairTest } from "../db/types";
import {
  doorFails,
  doorMarginal,
  doorValue,
  FAN_CHECKS,
  KIND_LABEL,
  probeLatest,
  probeLine,
  latestDoor,
  limits,
  onceStatus,
  openWith,
  QUICK_CHECKS,
  runAt,
  runChange,
  runCount,
  runDoors,
  SECTION,
  stairDoors,
  fanName,
  stairLabel,
  stairLevels,
  type Every,
} from "./stairTest";
import { clock24, numericDate } from "./dates";

// A stair test as it prints (the "Stair report layout" design, Option A):
// a page per stair, headed by the stair's name, then an even strip of
// details, a tile per once-a-stair reading, the doors table, the fan checks
// and the notes. Anything not tested is left out. General system testing
// has a summary page per stair (each door's latest reading), then a page
// per stair of its runs side by side. The preview, the PDF and the Excel
// are all drawn from this, so what's previewed is what's exported.
//
// Every table spans the page: `widths` are points on the PDF's 515 pt
// content width, 0 sharing what's left equally; the preview and the Excel
// take the same proportions.

export interface StairTile {
  label: string;
  value: string; // the result, "–" when tested but not recorded
  lines: string[]; // small lines under it: the max, how it was measured, the limit
  fail?: boolean;
}

export interface StairRow {
  cells: string[];
  fails: boolean[];
  warns?: boolean[]; // passes, but only just
}

export interface StairTable {
  title: string; // the section heading over it
  head: string[] | null; // null: no heading row (the checks)
  widths: number[]; // pt, 0 = an equal share of what's left
  align: ("c" | "l")[];
  bold?: boolean; // the first column bold (the level, a note's number)
  rows: StairRow[];
  key?: string; // a line under it
}

export interface StairCheck {
  label: string;
  value: "Yes" | "No" | "";
}

export interface StairPage {
  kind: "summary" | "runs";
  title: string;
  stair: string; // the stair's name, as big as the title: "SPF-1 · Stair 1 - south"
  note: string; // a small line under it ("Latest reading at each door"), or ""
  footer: string; // site · stair, on every page
  details: { label: string; value: string }[]; // six, three to a row
  tiles: StairTile[];
  tables: StairTable[]; // the summary's doors table; a runs page's runs, then a table per door reading
  checks: { title: string; list: StairCheck[] } | null; // the fan's checks, or the three-monthly checks
  generalNotes: string[]; // the system's own notes from setup
  notes: { location: string; text: string }[];
  sheet: string; // the Excel sheet's name
}

export const DOOR_KEY = "red: fail · yellow: a pass within 0.1 m/s or 5 N of the limit · – not read";
export const RUN_KEY = "– not read in that run · red: fail · yellow: a pass within 0.1 m/s or 5 N of the limit";
const GENERAL_TITLE = "Stair pressurisation · System testing";
const RUN_COLS = 6; // run columns across before the table carries on below
const LEVEL_W = 64; // the level column, and the adjacent door's

const day = numericDate;
const clock = clock24;
const t = (v?: string) => (v ?? "").trim();
const yesNo = (v: "y" | "n" | undefined): StairCheck["value"] => (v === "y" ? "Yes" : v === "n" ? "No" : "");
const source = (s: "phone" | "meter" | undefined) => (s === "phone" ? "Phone (indicative)" : s === "meter" ? "Calibrated meter" : "");

// the once-a-stair readings being tested, a tile each
function stairTiles(has: (s: StairSection) => boolean, once: StairOnce, sys: SpfSystem, fan: string): StairTile[] {
  const l = limits(sys);
  const tiles: StairTile[] = [];
  if (has("noise")) {
    const avg = t(once.noiseStair);
    tiles.push({
      label: "Noise, stair (average)",
      value: avg ? `${avg} dB(A) ${Number(avg) > l.noiseStair ? "✗" : "✓"}` : "–",
      fail: !!avg && Number(avg) > l.noiseStair,
      lines: [[t(once.noiseRef) && `max ${t(once.noiseRef)} dB(A)`, t(once.ambient) && `ambient ${t(once.ambient)} dB(A)`].filter(Boolean).join(" · "), avg ? source(once.noiseRefSource) : ""].filter(Boolean),
    });
    const occ = t(once.noiseOcc);
    tiles.push({
      label: "Noise, occupied space (average)",
      value: occ ? `${occ} dB(A)${l.noiseOcc === null ? "" : Number(occ) > l.noiseOcc ? " ✗" : " ✓"}` : "–",
      fail: !!occ && l.noiseOcc !== null && Number(occ) > l.noiseOcc,
      lines: [t(once.noiseOccMax) && `max ${t(once.noiseOccMax)} dB(A)`, [occ ? source(once.noiseOccSource) : "", l.noiseOcc === null ? `recorded only (no limit in ${sys.edition})` : ""].filter(Boolean).join(" · ")].filter(Boolean),
    });
  }
  if (has("rest")) {
    const rest = onceStatus("rest", once, sys);
    tiles.push({
      label: "Pressure restoration",
      value: rest.text || "–",
      fail: rest.fail,
      lines: [[t(once.restLevel) ? `Slowest door ${t(once.restLevel)}` : "", `limit ${l.rest} s`].filter(Boolean).join(" · "), t(once.restDoors) && `Doors opened: ${t(once.restDoors)}`].filter(Boolean),
    });
  }
  if (has("pa")) {
    const pa = onceStatus("pa", once, sys);
    tiles.push({ label: "Stair, all doors closed", value: pa.text || "–", fail: pa.fail, lines: [l.pa === null ? `Recorded only (no limit in ${sys.edition})` : `limit ${l.pa} Pa`] });
  }
  if (has("fan")) {
    const fanSt = onceStatus("fan", once, sys);
    const yes = FAN_CHECKS.filter(([k]) => once.fan?.[k] === "y").length;
    const failed = FAN_CHECKS.filter(([k]) => once.fan?.[k] === "n").map(([, label]) => `No: ${label}`);
    tiles.push({ label: "Fan checks", value: fanSt.text || "–", fail: fanSt.fail, lines: fanSt.text ? [`${yes} of ${FAN_CHECKS.length} Yes`, ...failed] : [] });
  }
  if (has("probe")) {
    const list = once.probe ?? [];
    const last = probeLatest(list);
    const st = onceStatus("probe", once, sys);
    const p = last?.p;
    const earlier = last ? list.slice(0, last.n).map((x, n) => `Earlier: ${probeLine(x, fan, n)}`) : [];
    tiles.push({
      label: `Duct probe · fan ${fan}`,
      value: st.text || "–",
      fail: st.fail,
      lines: [p ? (p.noStop ? "Failed to stop equipment" : "Equipment shut down") : "", ...earlier, t(p?.notes)].filter(Boolean),
    });
  }
  return tiles;
}

const details = (test: StairTest, sys: SpfSystem, site: Pick<Site, "name" | "address">, stair: SpfStair, k: number, fourth: { label: string; value: string }) => [
  { label: "Site", value: [site.name, site.address].filter((x) => x?.trim()).join(", ") },
  { label: "Date", value: day(test.testedAt) },
  { label: "System", value: `${sys.type === "One test" ? "" : `${sys.type} · `}AS 1668.1-${sys.edition}` },
  fourth,
  { label: "Fan", value: fanName(stair, k) },
  { label: "Tested by", value: test.testedBy?.trim() ?? "" },
];

const noteList = (test: StairTest) => test.notes.filter((x) => x.text.trim()).map((x) => ({ location: x.location.trim(), text: x.text.trim() }));
const generalNotes = (sys: SpfSystem) => sys.notes.split("\n").map((l) => l.trim()).filter(Boolean);

// the doors table: a row per door, only the door tests being done; readings from `door`
function doorsTable(title: string, test: StairTest, sys: SpfSystem, stair: SpfStair, door: (key: string, s: Every) => ReturnType<typeof latestDoor>): StairTable | null {
  const every = (["vel", "latch", "force"] as Every[]).filter((s) => test.sections.includes(s));
  if (!every.length) return null;
  const vel = every.includes("vel");
  const levels = stairLevels(stair);
  return {
    title,
    head: ["Level", ...(vel ? ["Adjacent door open"] : []), ...every.map((s) => SECTION[s].column!)],
    widths: [LEVEL_W, ...(vel ? [LEVEL_W] : []), ...every.map(() => 0)],
    align: [],
    bold: true,
    rows: stairDoors(stair).map((d) => {
      const ds = every.map((s) => door(d.key, s));
      return {
        cells: [d.label, ...(vel ? [openWith(levels, d.li, sys, door(d.key, "vel")) || "–"] : []), ...every.map((s, i) => doorValue(s, ds[i]) || "–")],
        fails: [false, ...(vel ? [false] : []), ...every.map((s, i) => !!doorFails(s, ds[i], sys))],
        warns: [false, ...(vel ? [false] : []), ...every.map((s, i) => doorMarginal(s, ds[i], sys))],
      };
    }),
    key: DOOR_KEY,
  };
}

function summaryPage(test: StairTest, sys: SpfSystem, site: Pick<Site, "name" | "address">, stair: SpfStair, k: number): StairPage {
  const has = (s: StairSection) => test.sections.includes(s);
  const once = test.once[stair.id] ?? {};
  const general = test.kind === "general";
  const runs = runCount(test);
  const fan = fanName(stair, k);
  const label = stairLabel(stair, k);
  const table = general
    ? doorsTable("Doors · latest reading", test, sys, stair, (key, s) => latestDoor(test, stair.id, key, s))
    : doorsTable("Doors", test, sys, stair, (key) => test.doors[stair.id]?.[key]);
  const checks = has("fan")
    ? { title: `Fan ${fan} functionality`, list: FAN_CHECKS.map(([key, l]) => ({ label: l, value: yesNo(once.fan?.[key]) })) }
    : has("quick")
      ? { title: "Three-monthly check (AS 1851-2012 Table 13.4.2.2)", list: QUICK_CHECKS.map(([key, l]) => ({ label: l, value: yesNo(once.quick?.[key]) })) }
      : null;
  const fourth = general
    ? { label: "Test", value: `Latest of ${runs} run${runs === 1 ? "" : "s"}` }
    : { label: "Test", value: test.kind === "comm" ? `Commissioning, AS 1668.1-${sys.edition}` : `${KIND_LABEL[test.kind]}, AS 1851-2012` };
  return {
    kind: "summary",
    title: general ? `${GENERAL_TITLE} · Summary` : `Stair pressurisation · ${KIND_LABEL[test.kind]}`,
    stair: label,
    note: general ? "Latest reading at each door" : "",
    footer: [site.name.trim(), label].filter(Boolean).join(" · "),
    details: details(test, sys, site, stair, k, fourth),
    tiles: stairTiles(has, once, sys, fan),
    tables: table ? [table] : [],
    checks,
    generalNotes: generalNotes(sys),
    notes: noteList(test),
    sheet: general ? `Summary ${label}` : label,
  };
}

// General system testing's run by run: what changed before each run, then a
// table per door reading with a column per run ("–" where a door wasn't read
// in that run), the key under them
function runsPage(test: StairTest, sys: SpfSystem, site: Pick<Site, "name" | "address">, stair: SpfStair, k: number): StairPage {
  // in the summary's column order
  const every = (["vel", "latch", "force"] as Every[]).filter((s) => test.sections.includes(s));
  const runs = runCount(test);
  const levels = stairLevels(stair);
  const label = stairLabel(stair, k);
  const tables: StairTable[] = [
    {
      title: "Runs",
      head: ["Run", "Time", "What changed before it"],
      widths: [40, 50, 0],
      align: ["c", "c", "l"],
      bold: true,
      rows: Array.from({ length: runs }, (_, r) => ({ cells: [String(r + 1), clock(runAt(test, r)), r === 0 ? runChange(test, r) || "As found" : runChange(test, r) || "No change noted"], fails: [] })),
    },
  ];
  for (const section of every) {
    for (let r0 = 0; r0 < runs; r0 += RUN_COLS) {
      const rs = Array.from({ length: Math.min(RUN_COLS, runs - r0) }, (_, j) => r0 + j);
      const vel = section === "vel";
      tables.push({
        title: `${SECTION[section].column}, run by run${r0 ? " (continued)" : ""}`,
        head: ["Level", ...(vel ? ["Adjacent door open"] : []), ...rs.map((r) => `Run ${r + 1}\n${clock(runAt(test, r))}`)],
        widths: [LEVEL_W, ...(vel ? [LEVEL_W] : []), ...rs.map(() => 0)],
        align: [],
        bold: true,
        rows: stairDoors(stair).map((door) => {
          const ds = rs.map((r) => runDoors(test, r)[stair.id]?.[door.key]);
          return {
            cells: [door.label, ...(vel ? [openWith(levels, door.li, sys, ...[...rs].reverse().map((r) => runDoors(test, r)[stair.id]?.[door.key])) || "–"] : []), ...ds.map((d) => doorValue(section, d) || "–")],
            fails: [false, ...(vel ? [false] : []), ...ds.map((d) => !!doorFails(section, d, sys))],
            warns: [false, ...(vel ? [false] : []), ...ds.map((d) => doorMarginal(section, d, sys))],
          };
        }),
      });
    }
  }
  if (tables.length > 1) tables[tables.length - 1].key = RUN_KEY;
  return {
    kind: "runs",
    title: GENERAL_TITLE,
    stair: label,
    note: "",
    footer: [site.name.trim(), label].filter(Boolean).join(" · "),
    details: details(test, sys, site, stair, k, { label: "Runs", value: String(runs) }),
    tiles: [],
    tables: tables.length > 1 ? tables : [],
    checks: null,
    generalNotes: [],
    notes: [],
    sheet: `Runs ${label}`,
  };
}

// a test's pages: a summary per stair; for general system testing, then a runs page per stair
export function stairPages(test: StairTest, sys: SpfSystem, site: Pick<Site, "name" | "address">): StairPage[] {
  const summaries = sys.stairs.map((stair, k) => summaryPage(test, sys, site, stair, k));
  if (test.kind !== "general") return summaries;
  const runs = sys.stairs.map((stair, k) => runsPage(test, sys, site, stair, k)).filter((p) => p.tables.length);
  return [...summaries, ...runs];
}

// the photo appendix's heading, for the test the photos are from
export const photosTitle = (test: Pick<StairTest, "kind">) => (test.kind === "general" ? `${GENERAL_TITLE} · Photos` : `Stair pressurisation · ${KIND_LABEL[test.kind]} · Photos`);

// the tables after the doors: the checks (two to a row while the page fits
// on one sheet, else one), then the general notes, then the test notes
export function lowerTables(page: StairPage, twoUp: boolean): StairTable[] {
  const out: StairTable[] = [];
  const c = page.checks;
  if (c) {
    const cell = (x: StairCheck | undefined) => (x ? [x.label, x.value] : ["", ""]);
    const rows: StairRow[] = [];
    const step = twoUp ? 2 : 1;
    for (let i = 0; i < c.list.length; i += step) {
      const pair = c.list.slice(i, i + step);
      const cells = twoUp ? [...cell(pair[0]), ...cell(pair[1])] : cell(pair[0]);
      rows.push({ cells, fails: cells.map((v, j) => j % 2 === 1 && v === "No") });
    }
    out.push({ title: c.title, head: null, widths: twoUp ? [0, 44, 0, 44] : [0, 44], align: twoUp ? ["l", "c", "l", "c"] : ["l", "c"], rows });
  }
  if (page.generalNotes.length)
    out.push({ title: "General notes", head: ["#", "Note"], widths: [24, 0], align: ["c", "l"], bold: true, rows: page.generalNotes.map((n, i) => ({ cells: [String(i + 1), n], fails: [] })) });
  if (page.notes.length)
    out.push({ title: "Test notes", head: ["#", "Location", "Note"], widths: [24, LEVEL_W, 0], align: ["c", "c", "l"], bold: true, rows: page.notes.map((n, i) => ({ cells: [String(i + 1), n.location || "–", n.text], fails: [] })) });
  return out;
}

// a table's column widths in points across `width`: fixed ones as given, the rest sharing what's left
export function columnWidths(t: Pick<StairTable, "widths">, width: number): number[] {
  const fixed = t.widths.reduce((a, w) => a + w, 0);
  const share = (width - fixed) / Math.max(1, t.widths.filter((w) => !w).length);
  return t.widths.map((w) => w || share);
}
