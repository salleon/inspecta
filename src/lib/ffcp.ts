import type { FfcpFan, FfcpMarks, FfcpNotes, FfcpTest } from "../db/types";

// Fire fan control panel testing (design canvas FFCP mock-up, v5): every
// fan's indication and manual control, checked in normal mode and again in
// fire mode. A fail asks why; the note can wait.

export type FfcpMode = "normal" | "fire";

// the fan checks, in order: three indication lights, then manual control
export const INDICATION = [
  ["run", "Run"],
  ["stop", "Stop"],
  ["fault", "Fault"],
] as const;
export const CONTROL = [
  ["on", "On"],
  ["off", "Off"],
] as const;
export const FAN_CHECKS = [...INDICATION, ...CONTROL];

// the shortcuts on Add fans
export const FAN_TYPES = ["SPF", "SAF", "SEF", "ZPF", "CPEF", "KEF"];

// quick reasons on a fail's note
export const REASONS = {
  indication: ["No light fitted", "Light not working", "Wrong light on"],
  control: ["Fan didn't start", "Fan didn't stop", "Switch not working"],
};

// "SPF-" 1 to 4 → SPF-01 … SPF-04 (at least two digits, more if the last needs it)
export function seriesNames(prefix: string, from: number, to: number): string[] {
  const width = Math.max(2, String(to).length);
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(prefix + String(n).padStart(width, "0"));
  return out;
}

export const fanKeys = (mode: FfcpMode) => FAN_CHECKS.map(([k]) => `${mode}.${k}`);

export type Stats = { done: number; total: number; fails: number; noNote: number };

export function stats(marks: FfcpMarks, notes: FfcpNotes, keys: string[]): Stats {
  let done = 0,
    fails = 0,
    noNote = 0;
  for (const key of keys) {
    const m = marks[key];
    if (!m) continue;
    done++;
    if (m === "n") {
      fails++;
      if (!notes[key]?.trim()) noNote++;
    }
  }
  return { done, total: keys.length, fails, noNote };
}

const add = (a: Stats, b: Stats): Stats => ({ done: a.done + b.done, total: a.total + b.total, fails: a.fails + b.fails, noNote: a.noNote + b.noNote });
const ZERO: Stats = { done: 0, total: 0, fails: 0, noNote: 0 };

export const fanStats = (fan: FfcpFan, mode: FfcpMode) => stats(fan.marks, fan.notes, fanKeys(mode));

// one mode's checks, every fan's
export function modeStats(test: FfcpTest, mode: FfcpMode): Stats {
  return test.fans.reduce((t, f) => add(t, fanStats(f, mode)), ZERO);
}

export const testStats = (test: FfcpTest) => add(modeStats(test, "normal"), modeStats(test, "fire"));

// the line under a test on its job's list, and its colour
export function testSummary(test: FfcpTest): { text: string; tone: "pass" | "fail" | "todo" } {
  const s = testStats(test);
  const fans = `${test.fans.length} fan${test.fans.length === 1 ? "" : "s"}`;
  if (!test.fans.length) return { text: "No fans yet", tone: "todo" };
  if (s.fails) return { text: `${fans} · ${s.fails} fail${s.fails === 1 ? "" : "s"}${s.done < s.total ? ` · ${s.total - s.done} to do` : ""}`, tone: "fail" };
  if (s.done < s.total) return { text: `${fans} · ${s.done} of ${s.total} checks`, tone: "todo" };
  return { text: `${fans} · all passed`, tone: "pass" };
}

export function newFfcpTest(location = ""): FfcpTest {
  const now = Date.now();
  return { id: crypto.randomUUID(), location, testedAt: now, createdAt: now, updatedAt: now, fans: [] };
}

export const newFan = (name: string): FfcpFan => ({ id: crypto.randomUUID(), name, marks: {}, notes: {} });
