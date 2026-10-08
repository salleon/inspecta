import type { Site, SpfSystem, StairTest } from "../db/types";
import { adjacentDoor, doorFails, doorValue, FAN_CHECKS, KIND_LABEL, limits, onceStatus, QUICK_CHECKS, stairLevels, stairName } from "./stairTest";

// A stair test as it prints (design canvas StairTestSimple, "The report"):
// a page per stair, the sheet's full set of columns every time and anything
// not tested left blank. The preview, the PDF and the Excel are all drawn
// from this, so what's previewed is what's exported.

export interface StairBox {
  label: string;
  value: string; // "" = not tested
  fail?: boolean;
  ref?: string; // the phone meter's reading, reference only
}

export interface StairRow {
  cells: string[];
  fails: boolean[];
}

export interface StairPage {
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
  boxes: StairBox[];
  head: string[];
  rows: StairRow[];
  fan: string; // the fan's functionality checks ("" if not tested)
  fanLabel: string;
  quick: string | null; // the three-monthly ticks (only on that test)
  notes: string[];
  siteNotes: string;
}

export const STAIR_HEAD = ["Level", "Adjacent door open", "Average velocity m/s (min 1)", "Door closes and latches", "Door opening force N (max 110)"];

const day = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });

const ticks = (list: [string, string][], got: Record<string, "y" | "n"> | undefined) =>
  list
    .filter(([k]) => got?.[k])
    .map(([k, label]) => `${label}: ${got![k] === "y" ? "Yes" : "No"}`)
    .join(" · ");

export function stairPages(test: StairTest, sys: SpfSystem, site: Pick<Site, "name" | "address">): StairPage[] {
  const has = (s: string) => test.sections.includes(s as never);
  const l = limits(sys);
  return sys.stairs.map((stair, i) => {
    const levels = stairLevels(stair);
    const doors = test.doors[stair.id] ?? {};
    const once = test.once[stair.id] ?? {};
    const noise = onceStatus("noise", once, sys);
    const rest = onceStatus("rest", once, sys);
    const pa = onceStatus("pa", once, sys);
    const n = (v?: string) => (v ?? "").trim();
    const boxes: StairBox[] = [
      { label: "Max noise, stair", value: has("noise") && n(once.noiseStair) ? `${n(once.noiseStair)} dB(A) ${Number(once.noiseStair) > l.noiseStair ? "✗" : "✓"}` : "", fail: noise.fail && Number(once.noiseStair) > l.noiseStair, ref: has("noise") && n(once.noiseRef) ? `phone ref. ${n(once.noiseRef)} dB(A)` : undefined },
      { label: "Max noise, occupied space", value: has("noise") && n(once.noiseOcc) ? `${n(once.noiseOcc)} dB(A)${l.noiseOcc === null ? "" : Number(once.noiseOcc) > l.noiseOcc ? " ✗" : " ✓"}` : "", fail: l.noiseOcc !== null && Number(once.noiseOcc) > l.noiseOcc },
      { label: "Pressure restoration", value: has("rest") ? rest.text : "", fail: rest.fail },
      { label: "Stair, all doors closed", value: has("pa") ? pa.text : "", fail: pa.fail },
    ];
    const rows: StairRow[] = levels.map((level, j) => {
      const d = doors[level];
      const cells = [
        level,
        has("vel") ? adjacentDoor(levels, j, sys) || "–" : "",
        has("vel") ? doorValue("vel", d) : "",
        has("latch") ? (d?.latch === "y" ? "Y" : d?.latch === "n" ? "N" : "") : "",
        has("force") ? doorValue("force", d) : "",
      ];
      const fails = [false, false, has("vel") && !!doorFails("vel", d, sys), has("latch") && !!doorFails("latch", d, sys), has("force") && !!doorFails("force", d, sys)];
      return { cells, fails };
    });
    return {
      title: `Stair pressurisation · ${KIND_LABEL[test.kind]}`,
      subtitle: stairName(stair, i).replace(" · ", " (") + (stair.name.trim() ? ")" : ""),
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
