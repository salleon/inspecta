import type { Site, SpfStair, SpfSystem, StairOnce, StairTest } from "../db/types";
import {
  adjacentDoor,
  doorFails,
  doorKey,
  doorLetter,
  doorMarginal,
  doorsAt,
  doorValue,
  FAN_CHECKS,
  KIND_LABEL,
  limits,
  onceStatus,
  QUICK_CHECKS,
  runAt,
  runChange,
  runCount,
  runDoors,
  SECTION,
  stairDoors,
  stairFan,
  stairLabel,
  stairLevels,
  type Every,
} from "./stairTest";

// A stair test as it prints (design canvas StairTestSimple, "The report"):
// a page per stair, the sheet's full set of columns every time and anything
// not tested left blank. The preview, the PDF and the Excel are all drawn
// from this, so what's previewed is what's exported. A level with more than
// one door has a row for each ("P2 A", "P2 B"). A pass that's only just one
// is marked (warns) and shaded yellow. General system testing prints run by
// run instead (the Stair general system testing canvas, board 5): for each
// run a table with its stairs side by side.

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
  tables?: StairTable[]; // general system testing: a table per run, in place of head and rows
  readings?: string[]; // and its once-a-stair readings, a line per stair
  fan: string; // the fan's functionality checks ("" if not tested)
  fanLabel: string;
  quick: string | null; // the three-monthly ticks (only on that test)
  notes: string[];
  siteNotes: string;
}

export const STAIR_HEAD = ["Level", "Adjacent door open", "Average velocity m/s (min 1)", "Door closes and latches", "Door opening force N (max 110)"];

// under the stair's average noise: the max, where they came from (the
// phone's are indicative only), and the ambient (fan off)
const noiseRef = (once: StairOnce) => {
  const a = (once.ambient ?? "").trim();
  const max = (once.noiseRef ?? "").trim();
  const from = once.noiseRefSource === "phone" ? "indicative (phone)" : once.noiseRefSource === "meter" ? "calibrated meter" : "";
  const parts = [max && `max ${max} dB(A)`, (once.noiseStair ?? "").trim() && from, a && `ambient ${a} dB(A)${once.ambientLevel ? ` at ${once.ambientLevel}` : ""}`].filter(Boolean);
  return parts.length ? parts : undefined;
};

const day = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });

const ticks = (list: [string, string][], got: Record<string, "y" | "n"> | undefined) =>
  list
    .filter(([k]) => got?.[k])
    .map(([k, label]) => `${label}: ${got![k] === "y" ? "Yes" : "No"}`)
    .join(" · ");

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
const COLS = 8; // reading columns across a run's table before it splits

// the levels of several stairs as one list, each stair's order kept
function mergeLevels(lists: string[][]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    let at = 0;
    for (const level of list) {
      const i = out.indexOf(level);
      if (i >= 0) at = i + 1;
      else out.splice(at++, 0, level);
    }
  }
  return out;
}

// general system testing: a table per run and reading
function generalPages(test: StairTest, sys: SpfSystem, site: Pick<Site, "name" | "address">): StairPage[] {
  const every = test.sections.filter((s): s is Every => SECTION[s].every);
  const cell = (section: Every, v: string) => (section === "latch" ? (v === "Yes" ? "Y" : v === "No" ? "N" : "") : v);
  const tables: StairTable[] = [];
  for (let r = 0; r < runCount(test); r++) {
    const doors = runDoors(test, r);
    for (const section of every) {
      const read = (st: SpfStair) => stairDoors(st).some((d) => doorValue(section, doors[st.id]?.[d.key]));
      // the stairs read in this run (every stair, on a first run with nothing in it yet)
      const stairs = sys.stairs.filter(read);
      const shown = stairs.length ? stairs : r === 0 && section === every[0] ? sys.stairs : [];
      const cols = shown.flatMap((st) => {
        const of = Math.max(...stairLevels(st).map((l) => doorsAt(st, l)));
        // the fan, then the stairwell's name on a second line
        const fan = stairFan(st) || "No fan name";
        const well = st.name.trim() ? `\n${st.name.trim()}` : "";
        return Array.from({ length: of }, (_, n) => ({ st, n, label: `${of > 1 ? `${fan} ${doorLetter(n)}` : fan}${well}` }));
      });
      const levels = mergeLevels(shown.map(stairLevels));
      for (let c = 0; c < cols.length; c += COLS) {
        const part = cols.slice(c, c + COLS);
        tables.push({
          title: `Run ${r + 1} · ${clock(runAt(test, r))} · ${runChange(test, r) || "No change noted"} · ${SECTION[section].column}`,
          head: ["Level", ...part.map((x) => x.label)],
          rows: levels.map((level) => {
            const ds = part.map((x) => (stairLevels(x.st).includes(level) && x.n < doorsAt(x.st, level) ? doors[x.st.id]?.[doorKey(level, x.n)] : undefined));
            return {
              cells: [level, ...ds.map((d) => cell(section, doorValue(section, d)))],
              fails: [false, ...ds.map((d) => !!doorFails(section, d, sys))],
              warns: [false, ...ds.map((d) => doorMarginal(section, d, sys))],
            };
          }),
        });
      }
    }
  }
  const once = sys.stairs
    .map((st) => {
      const parts = (["noise", "rest", "pa"] as const).filter((s) => test.sections.includes(s)).map((s) => [s, onceStatus(s, test.once[st.id], sys).text] as const).filter(([, t]) => t);
      return parts.length ? `${stairLabel(st)}: ${parts.map(([s, t]) => `${SECTION[s].name} ${t}`).join(" · ")}` : "";
    })
    .filter(Boolean);
  return [
    {
      title: `Stair pressurisation · ${KIND_LABEL.general}`,
      subtitle: "All stairs",
      details: [
        { label: "Site", value: [site.name, site.address].filter((s) => s?.trim()).join(", ") },
        { label: "Date", value: day(test.testedAt) },
        { label: "System", value: `${sys.type === "One test" ? "" : `${sys.type} · `}built to AS 1668.1-${sys.edition}` },
        { label: "Runs", value: String(runCount(test)) },
        { label: "Stairs", value: sys.stairs.map((st) => stairLabel(st)).join(", ") },
        { label: "Tested by", value: test.testedBy?.trim() ?? "" },
      ],
      boxes: [],
      head: [],
      rows: [],
      tables,
      readings: once,
      fan: "",
      fanLabel: "",
      quick: null,
      notes: test.notes.filter((x) => x.text.trim()).map((x, k) => `${k + 1} · ${x.location.trim() ? `${x.location.trim()} · ` : ""}${x.text.trim()}`),
      siteNotes: sys.notes.trim(),
    },
  ];
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
      { label: "Max noise, occupied space", value: has("noise") && n(once.noiseOcc) ? `${n(once.noiseOcc)} dB(A)${l.noiseOcc === null ? "" : Number(once.noiseOcc) > l.noiseOcc ? " ✗" : " ✓"}` : "", fail: l.noiseOcc !== null && Number(once.noiseOcc) > l.noiseOcc },
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
      subtitle: stairLabel(stair),
      details: [
        { label: "Site", value: [site.name, site.address].filter((s) => s?.trim()).join(", ") },
        { label: "Date", value: day(test.testedAt) },
        { label: "System", value: `${sys.type === "One test" ? "" : `${sys.type} · `}built to AS 1668.1-${sys.edition}` },
        { label: "Test", value: test.kind === "comm" ? `Commissioning, AS 1668.1-${sys.edition}` : `${KIND_LABEL[test.kind]}, AS 1851-2012` },
        { label: "Fan", value: stair.fan.trim() },
        { label: "Tested by", value: test.testedBy?.trim() ?? "" },
      ],
      boxes,
      head: STAIR_HEAD,
      rows,
      fan: has("fan") ? ticks(FAN_CHECKS, once.fan) : "",
      fanLabel: `Fan${stair.fan.trim() ? ` ${stair.fan.trim()}` : ""} functionality`,
      quick: has("quick") ? ticks(QUICK_CHECKS, once.quick) : null,
      notes: test.notes.filter((x) => x.text.trim()).map((x, k) => `${k + 1} · ${x.location.trim() ? `${x.location.trim()} · ` : ""}${x.text.trim()}`),
      siteNotes: sys.notes.trim(),
    };
  });
}
