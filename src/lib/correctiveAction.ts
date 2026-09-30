import type { Finding } from "../db/types";
import { COMMON_DEFECTS, type CommonDefect } from "./commonDefects";
import { currentCode } from "./esrCategories";
import { tokens } from "./esrSuggest";

// Pre-filled corrective action for the Excel register: when a finding's note
// is clearly one of the common defects (lib/commonDefects), its Report
// Wording. Only when sure, since a wrong one is worse than a blank:
// - the finding must be filed under one of the defect's ESR categories
//   (uncategorised findings never get one);
// - every one of the defect's word groups must be in the note, each matched
//   by different words, exactly (word endings aside: no typo guessing, which
//   once read "point" as "paint"); only a group that just names the subject
//   (door, sprinkler...) may be left to the category;
// - none of its "unless" words, and no other defect equally likely.
// Otherwise nothing, and the engineer writes it. The export shows it in red
// so it gets checked.

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
    for (let j = 0; j < phrase.length; j++) if (note[i + j] !== phrase[j]) continue outer;
    found.push([i, i + phrase.length]);
  }
  return found;
}

// Can each group be matched by its own, non-overlapping bit of the note?
// Returns the words used, or null. (Groups are few, so a plain search.)
function assign(options: [number, number][][], used: [number, number][] = []): number | null {
  if (!options.length) return used.reduce((n, [a, b]) => n + (b - a), 0);
  const [first, ...rest] = options;
  if (!first.length) return assign(rest, used); // the subject, given by the ESR category
  let best: number | null = null;
  for (const s of first) {
    if (used.some(([a, b]) => s[0] < b && a < s[1])) continue;
    const n = assign(rest, [...used, s]);
    if (n !== null && (best === null || n > best)) best = n;
  }
  return best;
}

function score(p: Prepared, note: Tokens, category: string): number | null {
  if (!p.defect.categories.some((c) => category === c || category.startsWith(c + "."))) return null;
  if (p.unless.some((u) => spans(note, u).length)) return null;
  const options: [number, number][][] = [];
  for (const [i, group] of p.groups.entries()) {
    const found = group.flatMap((phrase) => spans(note, phrase));
    if (i === 0 && p.defect.subjectFromCategory && !found.length) {
      options.push([]);
      continue;
    }
    if (!found.length) return null;
    options.push(found);
  }
  const wordsUsed = assign(options);
  if (wordsUsed === null) return null;
  // more groups and more matched words make it more specific
  return p.groups.length * 100 + wordsUsed * 10;
}

export function commonDefectFor(note: string, esrCategory?: string): CommonDefect | undefined {
  const text = words(note);
  if (!text.length) return undefined;
  if (!esrCategory) return undefined;
  const category = currentCode(esrCategory);
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
