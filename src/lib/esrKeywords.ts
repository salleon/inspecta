import { useSyncExternalStore } from "react";
import { esrItem } from "./esrCategories";

// Admin keyword tuning: changes to the built-in ESR keywords
// (esrCategories.ts), made on this phone from Settings → Admin. Stored as
// per-category additions and removals, so an app update that improves the
// built-in list still comes through for everything not touched here.
//
// Changes can be shared as a small JSON file and loaded on another phone,
// or sent to be built into the app for everyone.

export type KeywordKind = "!" | "" | "~"; // near-certain, normal, weak hint

export interface Keyword {
  text: string;
  kind: KeywordKind;
  builtIn: boolean;
}

interface CategoryEdits {
  added: { text: string; kind: KeywordKind }[];
  removed: string[]; // built-in keyword texts
}

type Edits = Record<string, CategoryEdits>;

const KEY = "inspecta.esrKeywordEdits";
const FILE_TYPE = "inspecta-esr-keywords";

const listeners = new Set<() => void>();
let edits: Edits = load();

function load(): Edits {
  try {
    return sanitise(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return {};
  }
}

function save(next: Edits) {
  edits = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // best effort
  }
  listeners.forEach((l) => l());
}

// Only known categories and well-formed entries survive (also used on a
// loaded file, which could come from anywhere).
function sanitise(raw: unknown): Edits {
  const out: Edits = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!esrItem(code) || !value || typeof value !== "object") continue;
    const v = value as { added?: unknown; removed?: unknown };
    const added = (Array.isArray(v.added) ? v.added : [])
      .filter((a): a is { text: string; kind: KeywordKind } => !!a && typeof a.text === "string" && ["!", "", "~"].includes(a.kind))
      .map((a) => ({ text: clean(a.text), kind: a.kind }))
      .filter((a) => a.text);
    const removed = (Array.isArray(v.removed) ? v.removed : []).filter((r): r is string => typeof r === "string").map(clean);
    if (added.length || removed.length) out[code] = { added, removed };
  }
  return out;
}

const clean = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);

function parseBuiltIn(k: string): { text: string; kind: KeywordKind } {
  const kind = k[0] === "~" || k[0] === "!" ? (k[0] as KeywordKind) : "";
  return { text: k.slice(kind.length), kind };
}

// The keywords a category uses on this phone: built-in minus removals,
// plus additions.
export function categoryKeywords(code: string): Keyword[] {
  const item = esrItem(code);
  if (!item) return [];
  const e = edits[code];
  const builtIn = item.keywords.map(parseBuiltIn).filter((k) => !e?.removed.includes(k.text));
  return [...builtIn.map((k) => ({ ...k, builtIn: true })), ...(e?.added ?? []).map((k) => ({ ...k, builtIn: false }))];
}

export function isEdited(code: string): boolean {
  return !!edits[code];
}

export function editedCount(): number {
  return Object.keys(edits).length;
}

function update(code: string, fn: (e: CategoryEdits) => void) {
  const e: CategoryEdits = { added: [...(edits[code]?.added ?? [])], removed: [...(edits[code]?.removed ?? [])] };
  fn(e);
  const next = { ...edits };
  if (e.added.length || e.removed.length) next[code] = e;
  else delete next[code];
  save(next);
}

// Adding a keyword that exists already (built-in or added) just changes its
// strength; adding back a removed built-in one restores it.
export function addKeyword(code: string, text: string, kind: KeywordKind) {
  const t = clean(text);
  if (!t) return;
  const builtIn = esrItem(code)?.keywords.map(parseBuiltIn).find((k) => k.text === t);
  update(code, (e) => {
    e.added = e.added.filter((a) => a.text !== t);
    if (builtIn && builtIn.kind === kind) {
      e.removed = e.removed.filter((r) => r !== t);
      return;
    }
    if (builtIn && !e.removed.includes(t)) e.removed.push(t);
    e.added.push({ text: t, kind });
  });
}

export function removeKeyword(code: string, keyword: Keyword) {
  update(code, (e) => {
    if (keyword.builtIn) {
      if (!e.removed.includes(keyword.text)) e.removed.push(keyword.text);
    } else {
      e.added = e.added.filter((a) => a.text !== keyword.text);
    }
  });
}

export function resetCategory(code: string) {
  const next = { ...edits };
  delete next[code];
  save(next);
}

export function resetAllKeywords() {
  save({});
}

// ---- share / load ----

export function keywordFile(): Blob {
  const body = { type: FILE_TYPE, version: 1, exportedAt: new Date().toISOString(), edits };
  return new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
}

export function keywordFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `inspecta-keywords-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

// Reads a shared file; returns how many categories it changes, or throws
// if it isn't an Inspecta keyword file. Call applyKeywordFile to use it.
export function readKeywordFile(text: string): Edits {
  const parsed = JSON.parse(text) as { type?: string; edits?: unknown };
  if (parsed?.type !== FILE_TYPE) throw new Error("Not an Inspecta keyword file");
  return sanitise(parsed.edits);
}

// Replaces this phone's changes with the file's.
export function applyKeywordFile(next: Edits) {
  save(next);
}

// ---- change notifications ----

let version = 0;
listeners.add(() => version++);

export function subscribeKeywords(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// re-renders when any keyword changes
export function useKeywordVersion(): number {
  return useSyncExternalStore(subscribeKeywords, () => version);
}
