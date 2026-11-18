import { useEffect, useState } from "react";
import type { DuctProbe } from "../db/types";
import { PROBE, probeName, probeResult, probeZone } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import ConfirmDialog from "./ConfirmDialog";

// A stair fan's duct probe (design canvas Duct probes test, version 2,
// boards 5 to 7): the test, then a card for each retest. Each go has a name
// (the fan's, until typed over), a stopwatch run from clearing the detector
// to the fan restarting, Failed to stop equipment, Failed to restart and a
// note.
// 60 to 90 s passes (green); anything else fails: 5 s either side in
// yellow as marginal, the rest red. The stopwatch keeps its start in the test, so it runs on
// while the phone is locked or the screen is left.

const PASS = "#2bd47a";
const FAIL = "#ff7a6a";
const WARN = "#f7c948";
const ZONE_COLOUR = { pass: PASS, marginal: WARN, fail: FAIL };

const clock = (sec: number) => {
  if (sec >= PROBE.scale) return "2:00+";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
};
const pct = (s: number) => (100 * s) / PROBE.scale;

// the stopwatch's button (design canvas board 8, option D): a round play or
// stop icon, then what it does in capitals and when to tap it under that
function TimerButton({ what, when, stop, onClick, disabled }: { what: string; when: string; stop?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      aria-label={`${what} ${when}`}
      disabled={disabled}
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 58, padding: "0 14px 0 8px", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", textAlign: "left", opacity: disabled ? 0.4 : 1 }}
    >
      <span style={{ width: 42, height: 42, borderRadius: 21, background: "var(--accent-text)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {stop ? <rect x="5" y="5" width="14" height="14" rx="2" /> : <path d="M8 5.5v13l11-6.5z" />}
        </svg>
      </span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: ".04em" }}>{what}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.75 }}>{when}</span>
      </span>
    </button>
  );
}

export default function DuctProbes({ probes, fan, update, peek }: { probes: DuctProbe[]; fan: string; update: (fn: (list: DuctProbe[]) => DuctProbe[]) => void; peek?: boolean }) {
  // the first go is there before anything is typed
  const shown = probes.length ? probes : [{}];
  const running = shown.some((p) => p.started);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || peek) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running, peek]);
  // the go whose Failed to restart is being asked about
  const [asking, setAsking] = useState<number | null>(null);
  useBackHandler(() => {
    if (asking === null) return false;
    setAsking(null);
    return true;
  });
  const edit = (i: number, patch: Partial<DuctProbe>) =>
    update((list) => {
      const next = list.length ? [...list] : [{}];
      next[i] = { ...next[i], ...patch };
      return next;
    });

  return (
    <>
      {shown.map((p, i) => {
        const timing = !!p.started;
        const t = timing ? (now - p.started!) / 1000 : p.time;
        const result = probeResult(p);
        const zone = t === undefined ? null : probeZone(t);
        const colour = p.failed ? FAIL : zone ? ZONE_COLOUR[zone] : "var(--muted-2)";
        const hint = timing
          ? t! < PROBE.min - PROBE.margin
            ? `Window opens in ${Math.ceil(PROBE.min - t!)} s`
            : t! < PROBE.min
              ? `Marginal · window in ${Math.ceil(PROBE.min - t!)} s`
              : t! <= PROBE.max
                ? `In the window · ${Math.ceil(PROBE.max - t!)} s left`
                : t! <= PROBE.max + PROBE.margin
                  ? "Marginal · over 90 s"
                  : "Over 90 s"
          : p.failed
            ? "Failed to restart"
            : t !== undefined
              ? zone === "pass"
                ? "Restarted in the window"
                : zone === "marginal"
                  ? t < PROBE.min
                    ? "Marginal: just before 60 s"
                    : "Marginal: just after 90 s"
                  : t < PROBE.min
                    ? "Too soon: before 60 s"
                    : "Too slow: over 90 s"
              : "Tap to start";
        const verdict = timing ? ["Timing", "rgba(var(--accent-rgb), .16)", "var(--accent-soft)"] : result === "pass" ? ["Pass", "rgba(43,212,122,.16)", PASS] : result === "marginal" ? ["Fail · marginal", "rgba(247,201,72,.16)", WARN] : result === "fail" ? ["Fail", "rgba(255,90,74,.15)", FAIL] : ["Not tested", "var(--panel-2)", "var(--muted)"];
        const label = i === 0 ? "Test" : `Retest ${i}`;
        return (
          <div key={i} data-testid="duct-probe" style={{ background: "var(--panel)", border: `1px solid ${timing ? "var(--accent)" : "var(--border)"}`, borderRadius: 14, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flexShrink: 0, height: 28, padding: "0 8px", borderRadius: 8, background: "rgba(var(--accent-rgb), .14)", color: "var(--accent-soft)", fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center" }}>{label}</span>
              <input
                aria-label={`${label} name`}
                placeholder="Name"
                value={p.name ?? probeName(p, fan, i)}
                onChange={(e) => edit(i, { name: e.target.value })}
                style={{ flex: 1, minWidth: 0, background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "8px 10px", fontSize: 14, fontWeight: 700, color: "var(--text)", outline: "none" }}
              />
              <span data-testid="probe-result" style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, padding: "6px 10px", borderRadius: 999, background: verdict[1], color: verdict[2] }}>
                {verdict[0]}
              </span>
            </div>

            <div style={{ background: "var(--panel-2)", borderRadius: 12, padding: "10px 11px", display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span data-testid="probe-clock" style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: timing && zone === "fail" && t! < PROBE.min ? "var(--text)" : colour }}>
                  {clock(t ?? 0)}
                </span>
                <span style={{ flexGrow: 1, fontSize: 12, fontWeight: 700, textAlign: "right", lineHeight: 1.3, color: timing && t! < PROBE.min - PROBE.margin ? "var(--muted)" : t === undefined && !p.failed ? "var(--muted)" : colour }}>{hint}</span>
              </div>
              {/* 0 to 120 s: red, a yellow margin, the green window, a yellow margin, red */}
              <div aria-hidden="true" style={{ position: "relative", height: 26 }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 4, height: 8, borderRadius: 4, background: "rgba(255,90,74,.35)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: `${pct(PROBE.min - PROBE.margin)}%`, width: `${pct(PROBE.margin)}%`, top: 0, bottom: 0, background: "rgba(247,201,72,.75)" }} />
                  <div style={{ position: "absolute", left: `${pct(PROBE.min)}%`, width: `${pct(PROBE.max - PROBE.min)}%`, top: 0, bottom: 0, background: "rgba(43,212,122,.5)" }} />
                  <div style={{ position: "absolute", left: `${pct(PROBE.max)}%`, width: `${pct(PROBE.margin)}%`, top: 0, bottom: 0, background: "rgba(247,201,72,.75)" }} />
                </div>
                {t !== undefined && <div style={{ position: "absolute", left: `${Math.min(100, pct(t))}%`, top: 0, width: 3, marginLeft: -2, height: 16, borderRadius: 2, background: zone ? ZONE_COLOUR[zone] : "var(--text)", boxShadow: "0 0 0 1px #071b2c" }} />}
                <span style={{ position: "absolute", left: 0, top: 14, fontSize: 10, fontWeight: 800, color: FAIL }}>0</span>
                <span style={{ position: "absolute", left: `${pct(PROBE.min)}%`, top: 14, transform: "translateX(-50%)", fontSize: 10, fontWeight: 800, color: PASS }}>60</span>
                <span style={{ position: "absolute", left: `${pct(PROBE.max)}%`, top: 14, transform: "translateX(-50%)", fontSize: 10, fontWeight: 800, color: PASS }}>90</span>
                <span style={{ position: "absolute", right: 0, top: 14, fontSize: 10, fontWeight: 800, color: FAIL }}>120+ s</span>
              </div>
              {timing ? (
                <TimerButton stop what="STOP TIMER" when="when the equipment restarts" onClick={() => edit(i, { time: Math.round((Date.now() - p.started!) / 100) / 10, started: undefined, failed: false, stoppedAt: undefined })} />
              ) : p.time === undefined && !p.failed ? (
                <TimerButton what="START TIMER" when="when the detector is cleared" disabled={running} onClick={() => edit(i, { started: Date.now(), failed: false, time: undefined, stoppedAt: undefined })} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flexGrow: 1, fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>
                    {p.failed ? (p.stoppedAt ? `Clock stopped at ${Math.round(p.stoppedAt)} s` : "Noted as failed") : `Restarted after ${Math.round(p.time ?? 0)} s`}
                  </span>
                  <button
                    disabled={running}
                    onClick={() => edit(i, { time: undefined, failed: false, stoppedAt: undefined })}
                    style={{ minHeight: 36, padding: "0 12px", borderRadius: 9, border: "1px solid rgba(var(--accent-rgb), .4)", background: "rgba(var(--accent-rgb), .14)", color: "var(--accent-soft)", fontSize: 12, fontWeight: 800, opacity: running ? 0.4 : 1 }}
                  >
                    Time again
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {/* the fan cutting out is a given when the test runs, so only a fail is ticked */}
              <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, minHeight: 44, padding: "0 11px", borderRadius: 11, background: p.noStop ? "rgba(255,90,74,.15)" : "var(--panel)", border: `1px solid ${p.noStop ? "rgba(255,122,106,.5)" : "var(--border)"}`, color: p.noStop ? FAIL : "var(--text)", fontSize: 13, fontWeight: 800 }}>
                <input type="checkbox" checked={!!p.noStop} onChange={() => edit(i, { noStop: !p.noStop })} style={{ width: 20, height: 20, margin: 0, accentColor: "#e5483a" }} />
                Failed to stop equipment
              </label>
              <button
                aria-pressed={!!p.failed}
                onClick={() => (p.failed ? edit(i, { failed: false, stoppedAt: undefined }) : setAsking(i))}
                style={{ flex: 1, minHeight: 44, padding: "0 11px", borderRadius: 11, fontSize: 13, fontWeight: 800, background: p.failed ? "#e5483a" : "rgba(255,90,74,.10)", border: `1px solid ${p.failed ? "#e5483a" : "rgba(255,122,106,.5)"}`, color: p.failed ? "#fff" : FAIL }}
              >
                Failed to restart{p.failed ? " ✕" : ""}
              </button>
            </div>

            <textarea
              aria-label={`${label} notes`}
              placeholder="Notes"
              rows={2}
              value={p.notes ?? ""}
              onChange={(e) => edit(i, { notes: e.target.value })}
              style={{ width: "100%", boxSizing: "border-box", background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "var(--text)", outline: "none", resize: "vertical", lineHeight: 1.4 }}
            />
          </div>
        );
      })}
      {asking !== null && !peek && (
        <div style={{ position: "fixed", inset: 0, zIndex: 20 }}>
          <ConfirmDialog
            title="Failed to restart?"
            message={
              shown[asking]?.started
                ? "This stops the timer and fails this go: the fan didn't come back on."
                : shown[asking]?.time !== undefined
                  ? `This fails this go and replaces its restart time of ${Math.round(shown[asking].time!)} s.`
                  : "This fails this go: the fan didn't come back on."
            }
            confirmLabel="Failed to restart"
            onCancel={() => setAsking(null)}
            onConfirm={() => {
              const i = asking;
              setAsking(null);
              update((list) => {
                const next = list.length ? [...list] : [{}];
                const p = next[i] ?? {};
                next[i] = { ...p, failed: true, started: undefined, time: undefined, stoppedAt: p.started ? (Date.now() - p.started) / 1000 : undefined };
                return next;
              });
            }}
          />
        </div>
      )}
      <button
        onClick={() => update((list) => [...(list.length ? list : [{}]), {}])}
        disabled={running}
        style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", minHeight: 54, padding: "10px 12px", borderRadius: 13, border: "1px dashed var(--border-strong)", background: "none", textAlign: "left", opacity: running ? 0.4 : 0.8 }}
      >
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(var(--accent-rgb), .1)", color: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>+</span>
        <span style={{ flexGrow: 1, fontSize: 14, fontWeight: 800, color: "#bfd0de" }}>Retest duct probe</span>
      </button>
    </>
  );
}
