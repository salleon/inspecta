import type { Site, SpfSystem, StairOnce, StairSection, StairTest } from "../db/types";
import {
  adjacentDoor,
  doorFails,
  doorMarginal,
  doorValue,
  FAN_CHECKS,
  KIND_LABEL,
  latestDoor,
  limits,
  onceStatus,
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

// A stair test as it prints (design canvas StairTestSimple, "The report"):
// a page per stair, the sheet's full set of columns every time and anything
// not tested left blank. The preview, the PDF and the Excel are all drawn
// from this, so what's previewed is what's exported. A level with more than
// one door has a row for each ("P2 A", "P2 B"). A pass that's only just one
// is marked (warns) and shaded yellow. General system testing has a page per
// stair too, with its runs side by side (generalPages).

export interface StairBox {
  label: string;
  value: string; // "" = not tested
  fail?: boolean;
  ref?: string[]; // the ambient and the phone meter's reading, a line each
}

export interface StairRow {
  cells: string[];
  fails: boolean[];
  warns?: boolean[]; // passes, but only just
}

export interface StairTable {
  title: string;
  head: string[];
  rows: StairRow[];
}

export interface StairPage {
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
  boxes: StairBox[];
  head: string[];
  rows: StairRow[];
  tables?: StairTable[]; // general system testing: a table per door reading, its runs across, in place of head and rows
  runs?: string[]; // and under them, what changed before each run, then the key
  readings?: string[]; // older layouts: once-a-stair readings, a line per stair
  fan: string; // the fan's functionality checks ("" if not tested)
  fanLabel: string;
  quick: string | null; // the three-monthly ticks (only on that test)
  notes: string[];
  siteNotes: string;
  sheet?: string; // the Excel sheet's name, when not the stair's
}

const STAIR_HEAD = ["Level", "Adjacent door open", "Average velocity m/s (min 1)", "Door closes and latches", "Door opening force N (max 110)"];

// the occupied space's noise, as the stair's: its average judged against the
// limit (just recorded before 1998), the max and where they came from under it
const occupiedBox = (once: StairOnce, l: ReturnType<typeof limits>): StairBox => {
  const avg = (once.noiseOcc ?? "").trim();
  const max = (once.noiseOccMax ?? "").trim();
  const from = once.noiseOccSource === "phone" ? "indicative (phone)" : once.noiseOccSource === "meter" ? "calibrated meter" : "";
  const ref = [max && `max ${max} dB(A)`, avg && from].filter(Boolean) as string[];
  return {
    label: "Noise, occupied space (average)",
    value: avg ? `${avg} dB(A)${l.noiseOcc === null ? "" : Number(avg) > l.noiseOcc ? " ✗" : " ✓"}` : "",
    fail: l.noiseOcc !== null && Number(avg) > l.noiseOcc,
    ref: ref.length ? ref : undefined,
  };
};

// under the stair's average noise: the max, where they came from (the
// phone's are indicative only), and the ambient (fan off)
const noiseRef = (once: StairOnce) => {
  const a = (once.ambient ?? "").trim();
  const max = (once.noiseRef ?? "").trim();
  const from = once.noiseRefSource === "phone" ? "indicative (phone)" : once.noiseRefSource === "meter" ? "calibrated meter" : "";
  const parts = [max && `max ${max} dB(A)`, (once.noiseStair ?? "").trim() && from, a && `ambient ${a} dB(A)`].filter(Boolean);
  return parts.length ? parts : undefined;
};

const day = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });

const ticks = (list: [string, string][], got: Record<string, "y" | "n"> | undefined) =>
  list
    .filter(([k]) => got?.[k])
    .map(([k, label]) => `${label}: ${got![k] === "y" ? "Yes" : "No"}`)
    .join(" · ");

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });


// General system testing: a page per stair, as the other tests, so a
// door's readings can be followed as things are adjusted. For each door
// reading, a table with a row per door and a column per run ("–" where a
// door wasn't read in that run: a spot check, or not re-read). What changed
// before each run is listed under the tables, with a key to the colours.
// After them, a summary page per stair in the other tests' record layout,
// each door's latest reading side by side.
const RUN_COLS = 6; // run columns across before the table carries on below

function generalPages(test: StairTest, sys: SpfSystem, site: Pick<Site, "name" | "address">): StairPage[] {
  const every = test.sections.filter((s): s is Every => SECTION[s].every);
  const has = (s: StairSection) => test.sections.includes(s);
  const cell = (section: Every, v: string) => (section === "latch" ? (v === "Yes" ? "Y" : v === "No" ? "N" : "") : v);
  const runs = runCount(test);
  const runLines = Array.from({ length: runs }, (_, r) => `Run ${r + 1} · ${clock(runAt(test, r))} · ${r === 0 ? runChange(test, r) || "As found" : runChange(test, r) || "No change noted"}`);
  const key = `– not read in that run · red: fail · yellow: a pass within 0.1 m/s or 5 N of the limit`;
  const l = limits(sys);
  const runPages = sys.stairs.map((stair, k): StairPage => {
    const levels = stairLevels(stair);
    const once = test.once[stair.id] ?? {};
    const n = (v?: string) => (v ?? "").trim();
    const tables: StairTable[] = [];
    for (const section of every) {
      for (let r0 = 0; r0 < runs; r0 += RUN_COLS) {
        const rs = Array.from({ length: Math.min(RUN_COLS, runs - r0) }, (_, j) => r0 + j);
        const vel = section === "vel";
        tables.push({
          title: `${SECTION[section].column}, run by run${r0 ? " (continued)" : ""}`,
          head: ["Level", ...(vel ? ["Adjacent door open"] : []), ...rs.map((r) => `Run ${r + 1}\n${clock(runAt(test, r))}`)],
          rows: stairDoors(stair).map((door) => {
            const ds = rs.map((r) => runDoors(test, r)[stair.id]?.[door.key]);
            return {
              cells: [door.label, ...(vel ? [adjacentDoor(levels, door.li, sys) || "–"] : []), ...ds.map((d) => cell(section, doorValue(section, d)) || "–")],
              fails: [false, ...(vel ? [false] : []), ...ds.map((d) => !!doorFails(section, d, sys))],
              warns: [false, ...(vel ? [false] : []), ...ds.map((d) => doorMarginal(section, d, sys))],
            };
          }),
        });
      }
    }
    // the once-a-stair readings and the fan checks: only those being tested
    const boxes: StairBox[] = [];
    if (has("noise")) {
      const noise = onceStatus("noise", once, sys);
      boxes.push({ label: "Noise, stair (average)", value: n(once.noiseStair) ? `${n(once.noiseStair)} dB(A) ${Number(once.noiseStair) > l.noiseStair ? "✗" : "✓"}` : "", fail: noise.fail && Number(once.noiseStair) > l.noiseStair, ref: noiseRef(once) });
      boxes.push(occupiedBox(once, l));
    }
    if (has("rest")) {
      const rest = onceStatus("rest", once, sys);
      boxes.push({ label: "Pressure restoration", value: rest.text, fail: rest.fail });
    }
    if (has("pa")) {
      const pa = onceStatus("pa", once, sys);
      boxes.push({ label: "Stair, all doors closed", value: pa.text, fail: pa.fail });
    }
    if (has("fan")) {
      const fan = onceStatus("fan", once, sys);
      const failed = FAN_CHECKS.filter(([key]) => once.fan?.[key] === "n").map(([, label]) => `No: ${label}`);
      boxes.push({ label: "Fan checks", value: fan.text, fail: fan.fail, ref: failed.length ? failed : undefined });
    }
    return {
      title: `Stair pressurisation · ${KIND_LABEL.general}`,
      subtitle: stairLabel(stair, k),
      details: [
        { label: "Site", value: [site.name, site.address].filter((x) => x?.trim()).join(", ") },
        { label: "Date", value: day(test.testedAt) },
        { label: "System", value: `${sys.type === "One test" ? "" : `${sys.type} · `}built to AS 1668.1-${sys.edition}` },
        { label: "Runs", value: String(runs) },
        { label: "Fan", value: fanName(stair, k) },
        { label: "Tested by", value: test.testedBy?.trim() ?? "" },
      ],
      boxes,
      head: [],
      rows: [],
      tables,
      runs: tables.length ? [...runLines, key] : undefined,
      fan: "",
      fanLabel: "",
      quick: null,
      notes: test.notes.filter((x) => x.text.trim()).map((x, j) => `${j + 1} · ${x.location.trim() ? `${x.location.trim()} · ` : ""}${x.text.trim()}`),
      siteNotes: sys.notes.trim(),
    };
  });
  // then a summary page per stair, in the record layout: a row per door with
  // its readings side by side, each the latest from any run
  const latest: StairTest["doors"] = Object.fromEntries(
    sys.stairs.map((st) => [
      st.id,
      Object.fromEntries(
        stairDoors(st).map((d) => [d.key, { vel: latestDoor(test, st.id, d.key, "vel")?.vel, force: latestDoor(test, st.id, d.key, "force")?.force, latch: latestDoor(test, st.id, d.key, "latch")?.latch }]),
      ),
    ]),
  );
  const summary = stairPages({ ...test, kind: "custom", doors: latest, runs: undefined }, sys, site).map((page) => ({
    ...page,
    sheet: `Summary ${page.subtitle}`,
    title: `Stair pressurisation · ${KIND_LABEL.general} · Summary`,
    subtitle: `${page.subtitle} · latest reading at each door`,
    details: page.details.map((d) => (d.label === "Test" ? { label: "Test", value: `${KIND_LABEL.general}: each door's latest reading of ${runs} run${runs === 1 ? "" : "s"}` } : d)),
  }));
  return [...runPages, ...summary];
}

export function stairPages(test: StairTest, sys: SpfSystem, site: Pick<Site, "name" | "address">): StairPage[] {
  if (test.kind === "general") return generalPages(test, sys, site);
  const has = (s: string) => test.sections.includes(s as never);
  const l = limits(sys);
  return sys.stairs.map((stair) => {
    const levels = stairLevels(stair);
    const doors = test.doors[stair.id] ?? {};
    const once = test.once[stair.id] ?? {};
    const noise = onceStatus("noise", once, sys);
    const rest = onceStatus("rest", once, sys);
    const pa = onceStatus("pa", once, sys);
    const n = (v?: string) => (v ?? "").trim();
    const boxes: StairBox[] = [
      { label: "Noise, stair (average)", value: has("noise") && n(once.noiseStair) ? `${n(once.noiseStair)} dB(A) ${Number(once.noiseStair) > l.noiseStair ? "✗" : "✓"}` : "", fail: noise.fail && Number(once.noiseStair) > l.noiseStair, ref: has("noise") ? noiseRef(once) : undefined },
      has("noise") ? occupiedBox(once, l) : { label: "Noise, occupied space (average)", value: "" },
      { label: "Pressure restoration", value: has("rest") ? rest.text : "", fail: rest.fail },
      { label: "Stair, all doors closed", value: has("pa") ? pa.text : "", fail: pa.fail },
    ];
    const rows: StairRow[] = stairDoors(stair).map((door) => {
      const d = doors[door.key];
      const cells = [
        door.label,
        has("vel") ? adjacentDoor(levels, door.li, sys) || "–" : "",
        has("vel") ? doorValue("vel", d) : "",
        has("latch") ? (d?.latch === "y" ? "Y" : d?.latch === "n" ? "N" : "") : "",
        has("force") ? doorValue("force", d) : "",
      ];
      const fails = [false, false, has("vel") && !!doorFails("vel", d, sys), has("latch") && !!doorFails("latch", d, sys), has("force") && !!doorFails("force", d, sys)];
      const warns = [false, false, has("vel") && doorMarginal("vel", d, sys), false, has("force") && doorMarginal("force", d, sys)];
      return { cells, fails, warns };
    });
    return {
      title: `Stair pressurisation · ${KIND_LABEL[test.kind]}`,
      subtitle: stairLabel(stair, sys.stairs.indexOf(stair)),
      details: [
        { label: "Site", value: [site.name, site.address].filter((s) => s?.trim()).join(", ") },
        { label: "Date", value: day(test.testedAt) },
        { label: "System", value: `${sys.type === "One test" ? "" : `${sys.type} · `}built to AS 1668.1-${sys.edition}` },
        { label: "Test", value: test.kind === "comm" ? `Commissioning, AS 1668.1-${sys.edition}` : `${KIND_LABEL[test.kind]}, AS 1851-2012` },
        { label: "Fan", value: fanName(stair, sys.stairs.indexOf(stair)) },
        { label: "Tested by", value: test.testedBy?.trim() ?? "" },
      ],
      boxes,
      head: STAIR_HEAD,
      rows,
      fan: has("fan") ? ticks(FAN_CHECKS, once.fan) : "",
      fanLabel: `Fan ${fanName(stair, sys.stairs.indexOf(stair))} functionality`,
      quick: has("quick") ? ticks(QUICK_CHECKS, once.quick) : null,
      notes: test.notes.filter((x) => x.text.trim()).map((x, k) => `${k + 1} · ${x.location.trim() ? `${x.location.trim()} · ` : ""}${x.text.trim()}`),
      siteNotes: sys.notes.trim(),
    };
  });
}
