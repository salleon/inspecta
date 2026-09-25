// Building level for a finding (advanced controls). Stored on the finding
// as plain display text so the list and PDF can print it as-is; this file
// turns that text into something the Level field can edit and step.
//
//   typed "25"            -> "Level 25"
//   Basement + "2"        -> "Basement 2"
//   Ground / Mezzanine / Roof quick buttons -> that word
//
// −/+ step one floor: … Basement 2, Basement 1, Ground, Level 1, Level 2 …

type LevelKind = "level" | "basement" | "ground" | "mezzanine" | "roof";

interface ParsedLevel {
  kind: LevelKind;
  // floor number for "level"/"basement"; "" while one is still being typed
  num: string;
}

export function parseLevel(text: string | undefined): ParsedLevel | undefined {
  if (!text) return undefined;
  const t = text.trim();
  let m = /^level\s*(\d*)$/i.exec(t);
  if (m) return { kind: "level", num: m[1] };
  m = /^basement\s*(\d*)$/i.exec(t);
  if (m) return { kind: "basement", num: m[1] };
  if (/^ground$/i.test(t)) return { kind: "ground", num: "" };
  if (/^mezzanine$/i.test(t)) return { kind: "mezzanine", num: "" };
  if (/^roof$/i.test(t)) return { kind: "roof", num: "" };
  if (/^\d+$/.test(t)) return { kind: "level", num: t };
  return undefined;
}

export function formatLevel(p: ParsedLevel): string | undefined {
  switch (p.kind) {
    case "level":
      // "Level" with no number yet isn't a level — treat as cleared
      return p.num ? `Level ${p.num}` : undefined;
    case "basement":
      return p.num ? `Basement ${p.num}` : "Basement";
    case "ground":
      return "Ground";
    case "mezzanine":
      return "Mezzanine";
    case "roof":
      return "Roof";
  }
}

// Floors as a signed number: Basement n = -n, Ground = 0, Level n = n.
// Mezzanine sits between Ground and Level 1. Roof has no known number, so
// −/+ leave it alone.
function toFloor(p: ParsedLevel): number | undefined {
  const n = parseInt(p.num, 10);
  switch (p.kind) {
    case "level":
      return Number.isNaN(n) ? 0 : n;
    case "basement":
      return -(Number.isNaN(n) ? 1 : n);
    case "ground":
      return 0;
    case "mezzanine":
      return 0.5;
    case "roof":
      return undefined;
  }
}

function fromFloor(f: number): string {
  if (f === 0) return "Ground";
  if (f < 0) return `Basement ${-f}`;
  return `Level ${f}`;
}

// One floor up (+1) or down (-1). From an empty field, + starts at Level 1
// and − at Ground.
export function stepLevel(text: string | undefined, dir: 1 | -1): string | undefined {
  const p = parseLevel(text);
  if (!p || (p.kind === "level" && !p.num)) return dir === 1 ? "Level 1" : "Ground";
  const f = toFloor(p);
  if (f === undefined) return text; // Roof
  const next = dir === 1 ? Math.floor(f) + 1 : Math.ceil(f) - 1;
  return fromFloor(next);
}
