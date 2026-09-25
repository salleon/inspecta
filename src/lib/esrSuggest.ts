import { ESR_ITEMS, currentCode } from "./esrCategories";
import { categoryKeywords, subscribeKeywords } from "./esrKeywords";

// ESR category suggestions for a finding, worked out on the phone (offline,
// no AI service) from what's typed in the note, and a little from the
// location:
//
// 1. Built-in keywords per item (esrCategories.ts). Word endings don't
//    matter ("dampers", "closing") and a one-letter typo in a longer word
//    still matches ("extingusher").
// 2. What this phone has learnt: every time a category is picked, the
//    note's words are remembered against it, so the inspector's own
//    shorthand ("FHR", "EL") ranks their usual pick first next time.
//
// Top 5, best first. If fewer than 5 match, the rest are the most-used
// categories, so there's always a quick pick.

const MAX_SUGGESTIONS = 5;

const STOPWORDS = new Set(
  "a an and are as at be been by for from has have in is it its of on or no not the this that to with was were into near under over off out up down per".split(" "),
);

// Folds word endings together so "closing", "closer" and "close" match
// "closer" / "clos", "dampers" matches "damper", "pressurization" matches
// "pressurisation". Applied to keywords and notes alike, so it only needs
// to be consistent, not correct English.
function stem(word: string): string {
  let t = word.replace(/z/g, "s");
  if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ies")) t = t.slice(0, -3) + "y";
  else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  else if (/(ss|x|ch|sh)es$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith("e")) t = t.slice(0, -1);
  return t;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
}

// meaningful words only: for learning and for comparing notes
function keyWords(text: string): string[] {
  return tokens(text).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// one insert, delete or swap-a-letter apart, for words long enough that
// that's a typo rather than a different word
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1 || a[0] !== b[0]) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

interface Keyword {
  text: string; // as shown in Admin, e.g. "hose reel"
  words: string[];
  weight: number;
}

// "~" = weak hint, "!" = near-certain. Longer phrases are more specific,
// so count for more. Built from the built-in keywords plus any Admin
// changes on this phone, and rebuilt when those change.
let keywordTable: { code: string; keywords: Keyword[] }[] | null = null;
subscribeKeywords(() => {
  keywordTable = null;
});

function keywordsTable() {
  keywordTable ??= ESR_ITEMS.map((i) => ({
    code: i.code,
    keywords: categoryKeywords(i.code).map((k) => {
      const words = tokens(k.text);
      const weight = k.kind === "~" ? 0.6 : (2 + 1.5 * (words.length - 1)) * (k.kind === "!" ? 2 : 1);
      return { text: `${k.kind}${k.text}`, words, weight };
    }),
  }));
  return keywordTable;
}

function contains(text: string[], phrase: string[]): boolean {
  outer: for (let i = 0; i + phrase.length <= text.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (!nearlyEqual(text[i + j], phrase[j])) continue outer;
    return true;
  }
  return false;
}

// ---- what this phone has learnt (kept on the phone, in localStorage) ----

const MEMORY_KEY = "inspecta.esrMemory";
const USAGE_KEY = "inspecta.esrUsage";

type Memory = Record<string, Record<string, number>>; // word -> code -> times
type Usage = Record<string, number>; // code -> times picked

function load<T>(key: string): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as T;
  } catch {
    return {} as T;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best effort — suggestions still work from the built-in keywords
  }
}

let memory: Memory | null = null;
let usage: Usage | null = null;

// counts saved against a removed code (e.g. 4.1) count for its replacement
function renameCounts(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, n] of Object.entries(counts)) out[currentCode(code)] = (out[currentCode(code)] ?? 0) + n;
  return out;
}

function loadMemory(): Memory {
  const m = load<Memory>(MEMORY_KEY);
  for (const w of Object.keys(m)) m[w] = renameCounts(m[w]);
  return m;
}

const loadUsage = () => renameCounts(load<Usage>(USAGE_KEY));

// Remember a pick: the note's words now point (a little more) to `code`.
export function learnCategory(note: string, code: string) {
  memory ??= loadMemory();
  usage ??= loadUsage();
  for (const w of new Set(keyWords(note))) {
    const codes = (memory[w] ??= {});
    codes[code] = (codes[code] ?? 0) + 1;
  }
  usage[code] = (usage[code] ?? 0) + 1;
  save(MEMORY_KEY, memory);
  save(USAGE_KEY, usage);
}

// ---- ranking ----

export interface CategorySuggestion {
  code: string;
  // false for the padding picks (most used), which don't match the note
  matched: boolean;
}

const FALLBACK = ["1.6", "1.4", "3.1", "4", "5.5", "7.2", "2.4", "13"];

// Nothing typed in the note gives no suggestions, unless `padIfEmpty`
// (the Categorise screen, which always offers the most-used ones).
export function suggestCategories(note: string, location = "", { max = MAX_SUGGESTIONS, padIfEmpty = false } = {}): CategorySuggestion[] {
  const noteWords = tokens(note);
  if (!padIfEmpty && !noteWords.some((w) => !STOPWORDS.has(w))) return [];
  const placeWords = tokens(location);
  memory ??= loadMemory();
  usage ??= loadUsage();

  const scores = new Map<string, number>();
  const add = (code: string, s: number) => scores.set(code, (scores.get(code) ?? 0) + s);

  for (const [code, { score }] of keywordScores(noteWords, placeWords)) add(code, score);

  // learnt words: stronger the more often a word led to that category, and
  // the more it points to that one category rather than several
  for (const w of new Set(keyWords(note))) {
    const codes = memory[w];
    if (!codes) continue;
    const total = Object.values(codes).reduce((a, b) => a + b, 0);
    for (const [code, n] of Object.entries(codes)) add(code, 2.5 * Math.min(n, 3) * (n / total));
  }

  const order = new Map(ESR_ITEMS.map((i, n) => [i.code, n]));
  const known = (code: string) => order.has(code);
  const ranked: CategorySuggestion[] = [...scores.entries()]
    .filter(([code, s]) => s >= 0.5 && known(code))
    .sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!)
    .slice(0, max)
    .map(([code]) => ({ code, matched: true }));

  const mostUsed = Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);
  for (const code of [...mostUsed, ...FALLBACK]) {
    if (ranked.length >= max) break;
    if (known(code) && !ranked.some((r) => r.code === code)) ranked.push({ code, matched: false });
  }
  return ranked;
}

// Per item: its strongest keyword counts in full, any others at half —
// "fire rated wall" also matching "wall" shouldn't outweigh a clear
// "penetration". Location matches count at 40%.
function keywordScores(noteWords: string[], placeWords: string[]) {
  const out = new Map<string, { score: number; matched: string[] }>();
  for (const { code, keywords } of keywordsTable()) {
    const hits: { weight: number; text: string }[] = [];
    for (const k of keywords) {
      if (!k.words.length) continue;
      if (contains(noteWords, k.words)) hits.push({ weight: k.weight, text: k.text });
      else if (placeWords.length && contains(placeWords, k.words)) hits.push({ weight: k.weight * 0.4, text: `${k.text} (location)` });
    }
    if (!hits.length) continue;
    hits.sort((x, y) => y.weight - x.weight);
    out.set(code, { score: hits[0].weight + 0.5 * hits.slice(1).reduce((x, y) => x + y.weight, 0), matched: hits.map((h) => h.text) });
  }
  return out;
}

// Admin "Test a note": the top 5 from keywords alone (not what this phone
// has learnt), with what matched and the score.
export function explainCategories(note: string, max = MAX_SUGGESTIONS) {
  const order = new Map(ESR_ITEMS.map((i, n) => [i.code, n]));
  return [...keywordScores(tokens(note), [])]
    .sort((a, b) => b[1].score - a[1].score || order.get(a[0])! - order.get(b[0])!)
    .slice(0, max)
    .map(([code, { score, matched }]) => ({ code, score, matched }));
}

// How alike two notes are (0–1), for putting similar findings next to
// each other in the reports: shared meaningful words over all of them.
export function noteSimilarity(a: string, b: string): number {
  const wa = new Set(keyWords(a));
  const wb = new Set(keyWords(b));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}
