import type { FfcpFan, FfcpMarks, FfcpNotes, FfcpTest } from "../db/types";

// Fire fan control panel testing (design canvas FFCP mock-up, v5): every
// fan's indication and manual control, checked in normal mode and again in
// fire mode. A fail's reason is added from the box under it, any time.

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

// quick reasons on a fail's note (or type another)
export const FAIL_REASONS = ["Indicator/operation mismatch", "Incorrect indication"];

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

// ---- the report (lib/ffcpPdf, lib/ffcpExcel) ----

// what each check is called in the notes, where the table's headings aren't there to say
// the table's column headings (manual control: run and stop, as the drawn sheet)
export const HEADS = ["RUN", "STOP", "FAULT", "RUN", "STOP"];
const NOTE_LABEL: Record<string, string> = { run: "Run light", stop: "Stop light", fault: "Fault light", on: "Manual run", off: "Manual stop" };

// the modes with anything ticked: a mode not tested gets no table
export const modesTested = (test: FfcpTest): FfcpMode[] => (["normal", "fire"] as FfcpMode[]).filter((m) => test.fans.some((f) => FAN_CHECKS.some(([k]) => f.marks[`${m}.${k}`])));

// each fail's why, then each fan's own note
export function reportNotes(test: FfcpTest): { head: string; text: string; fail: boolean }[] {
  const notes: { head: string; text: string; fail: boolean }[] = [];
  for (const fan of test.fans) {
    for (const mode of ["normal", "fire"] as FfcpMode[])
      for (const [k] of FAN_CHECKS) {
        if (fan.marks[`${mode}.${k}`] !== "n") continue;
        notes.push({ head: `${fan.name} · ${mode === "normal" ? "Normal" : "Fire"} · ${NOTE_LABEL[k]} FAIL`, text: fan.notes[`${mode}.${k}`]?.trim() || "No note", fail: true });
      }
    if (fan.note?.trim()) notes.push({ head: fan.name, text: fan.note.trim(), fail: false });
  }
  return notes;
}

// "7 fans · 3 fails on 2 fans · 3 not checked" (the modes tested only)
export function reportSummary(test: FfcpTest): { text: string; fails: number } {
  const all = test.fans.flatMap((f) => modesTested(test).flatMap((m) => FAN_CHECKS.map(([k]) => f.marks[`${m}.${k}`])));
  const fails = all.filter((x) => x === "n").length;
  const left = all.filter((x) => !x).length;
  const failedFans = test.fans.filter((f) => Object.values(f.marks).includes("n")).length;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return { text: [n(test.fans.length, "fan"), fails ? `${n(fails, "fail")} on ${n(failedFans, "fan")}` : "all passed", left ? `${left} not checked` : ""].filter(Boolean).join(" · "), fails };
}
