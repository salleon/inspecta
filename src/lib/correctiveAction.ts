import type { Finding } from "../db/types";
import { COMMON_DEFECTS, type CommonDefect } from "./commonDefects";
import { currentCode } from "./esrCategories";
import { nearlyEqual, tokens } from "./esrSuggest";

// Pre-filled corrective action for the Excel register: when a finding's note
// is clearly one of the common defects (lib/commonDefects), its Report
// Wording. Only when sure: every one of the defect's word groups has to be
// in the note (each group matched by different words), none of its "unless"
// words, and no other defect equally likely. Otherwise nothing, and the
// engineer writes it. The export shows it in red so it gets checked.

type Tokens = string[];

// "didn't" → "didnt", so both spellings match
const words = (text: string): Tokens => tokens(text.replace(/['’]/g, ""));

interface Prepared {
  defect: CommonDefect;
  groups: Tokens[][];
  unless: Tokens[];
}

let prepared: Prepared[] | null = null;
function table(): Prepared[] {
  prepared ??= COMMON_DEFECTS.map((defect) => ({
    defect,
    groups: defect.match.map((g) => g.map(words)),
    unless: (defect.unless ?? []).map(words),
  }));
  return prepared;
}

// every place a phrase occurs in the note, as [start, end)
function spans(note: Tokens, phrase: Tokens): [number, number][] {
  const found: [number, number][] = [];
  outer: for (let i = 0; i + phrase.length <= note.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (!nearlyEqual(note[i + j], phrase[j])) continue outer;
    found.push([i, i + phrase.length]);
  }
  return found;
}

// Can each group be matched by its own, non-overlapping bit of the note?
// Returns the words used, or null. (Groups are few, so a plain search.)
function assign(options: [number, number][][], used: [number, number][] = []): number | null {
  if (!options.length) return used.reduce((n, [a, b]) => n + (b - a), 0);
  const [first, ...rest] = options;
  if (!first.length) return assign(rest, used); // satisfied by the ESR category
  let best: number | null = null;
  for (const s of first) {
    if (used.some(([a, b]) => s[0] < b && a < s[1])) continue;
    const n = assign(rest, [...used, s]);
    if (n !== null && (best === null || n > best)) best = n;
  }
  return best;
}

function score(p: Prepared, note: Tokens, category: string | undefined): number | null {
  if (p.unless.some((u) => spans(note, u).length)) return null;
  const byCategory = !!category && !!p.defect.categories?.some((c) => category === c || category.startsWith(c + "."));
  const options: [number, number][][] = [];
  for (const [i, group] of p.groups.entries()) {
    const found = group.flatMap((phrase) => spans(note, phrase));
    if (i === 0 && byCategory && !found.length) {
      options.push([]);
      continue;
    }
    if (!found.length) return null;
    options.push(found);
  }
  const wordsUsed = assign(options);
  if (wordsUsed === null) return null;
  // more groups, more matched words and agreeing with the ESR category all
  // make it more specific
  return p.groups.length * 100 + wordsUsed * 10 + (byCategory ? 5 : 0);
}

export function commonDefectFor(note: string, esrCategory?: string): CommonDefect | undefined {
  const text = words(note);
  if (!text.length) return undefined;
  const category = esrCategory ? currentCode(esrCategory) : undefined;
  let best: { defect: CommonDefect; score: number } | undefined;
  let tie = false;
  for (const p of table()) {
    const s = score(p, text, category);
    if (s === null) continue;
    if (!best || s > best.score) {
      best = { defect: p.defect, score: s };
      tie = false;
    } else if (s === best.score) tie = true;
  }
  return best && !tie ? best.defect : undefined;
}

export function suggestedCorrectiveAction(finding: Pick<Finding, "note" | "esrCategory">): string | undefined {
  return commonDefectFor(finding.note ?? "", finding.esrCategory)?.wording;
}
