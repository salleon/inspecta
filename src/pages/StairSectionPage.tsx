import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { SpfStair, SpfSystem, StairDoor, StairOnce, StairSection, StairTest, Tick } from "../db/types";
import { adjacentDoor, doorFails, doorStats, doorValue, FAN_CHECKS, limits, QUICK_CHECKS, SECTION, stairLevels, stairName } from "../lib/stairTest";
import { meterOffset, setMeterOffset, startMeter, type Meter } from "../lib/soundMeter";
import { useBackHandler } from "../lib/backButton";
import { AMBER, PageHeader, Pill, RulesBox, useStairTest } from "../components/StairUi";

// One section of a stair test (design canvas StairTestSimple, phones 3 and 4).
// A reading at every door is the whole stair, showing just that reading:
// tap a level and a keypad opens for it; Done ✓ saves it and closes, ▲ ▼
// step to the level above or below. You move yourself; the app never
// moves you on. A reading done once is a short screen of its own.

type Every = "vel" | "force" | "latch";
const PASS = "#2bd47a";
const FAIL = "#ff7a6a";

export default function StairSectionPage() {
  const { siteId, testId, section } = useParams<{ siteId: string; testId: string; section: StairSection }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { site, test, setTest, flush } = useStairTest(siteId, testId);
  const backTo = `/site/${siteId}/spf/${testId}?stair=${params.get("stair") ?? ""}`;
  const leave = () => {
    flush();
    navigate(backTo, { replace: true });
  };

  if (!site?.spf || !test || !section || !SECTION[section]) return <div style={{ height: "100%" }} />;
  const sys = site.spf;
  const i = Math.max(0, sys.stairs.findIndex((s) => s.id === params.get("stair")));
  const stair = sys.stairs[i];
  if (!stair) return <div style={{ height: "100%" }} />;
  return SECTION[section].every ? (
    <EveryDoor section={section as Every} sys={sys} stair={stair} stairNo={i} test={test} setTest={setTest} onBack={leave} />
  ) : (
    <Once section={section} sys={sys} stair={stair} stairNo={i} test={test} setTest={setTest} onBack={leave} />
  );
}

type Props = { sys: SpfSystem; stair: SpfStair; stairNo: number; test: StairTest; setTest: (u: (t: StairTest) => StairTest) => void; onBack: () => void };

function EveryDoor({ section, sys, stair, stairNo, test, setTest, onBack }: Props & { section: Every }) {
  const levels = stairLevels(stair);
  const doors = test.doors[stair.id] ?? {};
  const [cur, setCur] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const info = SECTION[section];
  const stats = doorStats(test, stair, section, sys);
  const l = limits(sys);
  const word = sys.edition === "1979" ? "storey" : sys.edition === "1991" ? "floor" : "compartment";

  useBackHandler(() => {
    if (cur === null) return false;
    setCur(null);
    return true;
  });

  // the level being typed stays in view above the keypad
  useEffect(() => {
    if (cur === null || !list.current) return;
    const row = list.current.querySelector<HTMLElement>(`[data-i="${cur}"]`);
    if (!row) return;
    const box = list.current.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const visible = box.height - 330;
    if (r.top < box.top || r.bottom > box.top + visible) list.current.scrollTop += r.top - box.top - Math.max(0, visible - 3 * r.height);
  }, [cur]);

  const setDoor = (level: string, patch: Partial<StairDoor>) =>
    setTest((t) => {
      const forStair = { ...t.doors[stair.id] };
      const next = { ...forStair[level], ...patch };
      if (!next.vel) delete next.vel;
      if (!next.force) delete next.force;
      if (!next.latch) delete next.latch;
      forStair[level] = next;
      return { ...t, doors: { ...t.doors, [stair.id]: forStair } };
    });

  function key(k: string) {
    if (cur === null) return;
    const level = levels[cur];
    const d = doors[level];
    if (k === "done") {
      if (doorValue(section, d)) {
        setFlash(cur);
        setTimeout(() => setFlash(null), 1400);
      }
      setCur(null);
      return;
    }
    if (k === "up") return setCur(Math.max(0, cur - 1));
    if (k === "down") return setCur(Math.min(levels.length - 1, cur + 1));
    if (section === "latch") {
      if (k === "y" || k === "n") setDoor(level, { latch: k });
      return;
    }
    const field = section;
    // from the latest value, so quick taps never drop a digit
    setTest((t) => {
      const forStair = { ...t.doors[stair.id] };
      const v = forStair[level]?.[field] ?? "";
      let next = v;
      if (k === "bs") next = v.slice(0, -1);
      else if (k === "." && v.includes(".")) return t;
      else if (v.length >= 6) return t;
      else next = v === "" && k === "." ? "0." : v + k;
      const door = { ...forStair[level], [field]: next };
      if (!door[field]) delete door[field];
      forStair[level] = door;
      return { ...t, doors: { ...t.doors, [stair.id]: forStair } };
    });
  }

  const value = cur === null ? "" : doorValue(section, doors[levels[cur]]);
  const fails = cur === null ? null : doorFails(section, doors[levels[cur]], sys);
  const grid = "48px 50px 1fr 48px";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title={info.name} sub={stairName(stair, stairNo)} onBack={onBack} right={<Pill>{`${stats.done} / ${stats.total}`}</Pill>} />
      <div style={{ flexShrink: 0, padding: "0 14px" }}>
        {section === "vel" ? (
          <RulesBox sys={sys} tiles={false}>
            <div style={{ fontSize: 12, color: "#d8c4a8" }}>
              <b style={{ color: "#ffd9a8" }}>Pass</b> ≥ {l.vel} m/s
            </div>
          </RulesBox>
        ) : (
          <div style={{ background: `${AMBER}.07)`, border: `1px solid ${AMBER}.45)`, borderRadius: 11, padding: "8px 9px", fontSize: 12, color: "#d8c4a8", lineHeight: 1.45 }}>
            {section === "force" ? (
              <>
                <b style={{ color: "#ffd9a8" }}>{sys.type === "Zone" ? `The ${word} above open` : "All stair doors closed"}</b> ({sys.type.toLowerCase()}, {sys.edition}), fan running. Pull each door open with the gauge. <b style={{ color: "#ffd9a8" }}>Pass ≤ {l.force} N.</b>
              </>
            ) : (
              <>
                Let each door go from fully open: it must <b style={{ color: "#ffd9a8" }}>close and latch</b> against the pressure.
              </>
            )}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 11.5, color: "var(--muted)" }}>
          <span style={{ whiteSpace: "nowrap" }}>
            <b style={{ color: "var(--text)" }}>
              {stats.done} of {stats.total} done
            </b>
            {stats.fails > 0 && <span style={{ color: FAIL }}> · {stats.fails} fail{stats.fails === 1 ? "" : "s"}</span>}
            {stats.done < stats.total ? ` · ${stats.total - stats.done} to go` : <span style={{ color: PASS }}> · all done ✓</span>}
          </span>
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: "#143452", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${stats.total ? (100 * stats.done) / stats.total : 0}%`, background: "var(--accent)", transition: "width .3s" }} />
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "8px 8px 2px", fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <span>Level</span>
          <span>{section === "vel" ? "+ open" : ""}</span>
          <span style={{ textAlign: "center" }}>{info.unit ?? "Latches"}</span>
          <span />
        </div>
      </div>
      <div ref={list} style={{ flexGrow: 1, overflowY: "auto", padding: `0 14px ${cur === null ? 20 : 340}px` }}>
        {levels.map((level, j) => {
          const d = doors[level];
          const v = doorValue(section, d);
          const bad = doorFails(section, d, sys);
          const editing = cur === j;
          return (
            <button
              key={level}
              data-i={j}
              onClick={() => setCur(j)}
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                gap: 8,
                alignItems: "center",
                width: "100%",
                padding: "4px 8px",
                marginBottom: 2,
                borderRadius: 9,
                border: editing ? "1px solid var(--accent)" : "1px solid transparent",
                background: editing ? "rgba(46,196,182,.08)" : flash === j ? "rgba(43,212,122,.25)" : "none",
                transition: "background 1.2s ease-out",
                color: "var(--text)",
              }}
            >
              <span style={{ height: 28, borderRadius: 7, background: "#143452", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, overflow: "hidden", whiteSpace: "nowrap" }}>{level}</span>
              <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, textAlign: "center" }}>{section === "vel" ? adjacentDoor(levels, j, sys) || "–" : ""}</span>
              <span style={{ fontSize: 15, fontWeight: 800, textAlign: "center", borderRadius: 7, padding: "3px 0", color: v ? (bad ? FAIL : PASS) : "#3f5a73", background: bad ? "rgba(255,90,74,.1)" : "none" }}>{v || "—"}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, textAlign: "center", borderRadius: 6, padding: "2px 0", color: editing ? "var(--accent-text)" : bad ? FAIL : PASS, background: editing ? "var(--accent)" : "none" }}>
                {editing ? "Editing" : v ? (bad ? "Fail" : "Pass") : ""}
              </span>
            </button>
          );
        })}
      </div>

      {cur !== null && (
        <div className="sheet-panel" style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "var(--panel)", borderTop: "1px solid #2a5a82", borderRadius: "20px 20px 0 0", boxShadow: "0 -14px 30px rgba(0,0,0,.5)", padding: "10px 12px calc(18px + env(safe-area-inset-bottom))", zIndex: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--accent-text)", background: "var(--accent)", borderRadius: 6, padding: "2px 6px", verticalAlign: 4, marginRight: 6 }}>Editing</span>
                Level {levels[cur]}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.35 }}>
                {section === "vel" && (
                  <>
                    Open: {levels[cur]}
                    {adjacentDoor(levels, cur, sys) ? ` + ${adjacentDoor(levels, cur, sys)}` : ""} + discharge
                    <br />
                  </>
                )}
                {section === "vel" ? `≥ ${l.vel} m/s` : section === "force" ? `≤ ${l.force} N` : "Yes to pass"}
              </div>
            </div>
            <div data-testid="spf-value" style={{ marginLeft: "auto", fontSize: 34, fontWeight: 800, minWidth: 90, textAlign: "right", color: fails === null ? "var(--text)" : fails ? FAIL : PASS }}>
              {value || <span style={{ fontSize: 13, color: "var(--muted)" }}>{section === "latch" ? "Yes / No" : "type"}</span>}
              {value && info.unit && <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 4 }}>{info.unit}</span>}
            </div>
          </div>
          <Keypad latch={section === "latch"} onKey={key} />
        </div>
      )}
    </div>
  );
}

const keyStyle = (kind: "num" | "fn" | "go" | "yes" | "no"): CSSProperties => ({
  height: 48,
  borderRadius: 10,
  fontSize: kind === "num" ? 20 : 15,
  fontWeight: kind === "num" ? 700 : 800,
  border: `1px solid ${kind === "yes" ? "rgba(43,212,122,.5)" : kind === "no" ? "rgba(255,90,74,.5)" : "rgba(46,196,182,.32)"}`,
  background: kind === "go" ? "var(--accent)" : kind === "yes" ? "rgba(43,212,122,.18)" : kind === "no" ? "rgba(255,90,74,.14)" : kind === "fn" ? "rgba(46,196,182,.07)" : "rgba(46,196,182,.15)",
  color: kind === "go" ? "var(--accent-text)" : kind === "yes" ? PASS : kind === "no" ? FAIL : kind === "fn" ? "#bfeee8" : "#e9fffc",
  touchAction: "manipulation",
});

function Keypad({ latch, onKey }: { latch: boolean; onKey: (k: string) => void }) {
  const k = (label: ReactNode, value: string, kind: Parameters<typeof keyStyle>[0] = "num", span = 1) => (
    <button
      key={value}
      aria-label={value === "bs" ? "Backspace" : value === "up" ? "Level above" : value === "down" ? "Level below" : value === "done" ? "Done" : String(label)}
      onPointerDown={(e) => {
        e.preventDefault();
        onKey(value);
      }}
      style={{ ...keyStyle(kind), gridColumn: span > 1 ? `span ${span}` : undefined }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7, marginTop: 10 }}>
      {latch
        ? [k("Yes", "y", "yes", 2), k("No", "n", "no", 2), k("▲", "up", "fn"), k("▼", "down", "fn"), k("Done ✓", "done", "go", 2)]
        : [
            k("7", "7"),
            k("8", "8"),
            k("9", "9"),
            k("⌫", "bs", "fn"),
            k("4", "4"),
            k("5", "5"),
            k("6", "6"),
            k("▲", "up", "fn"),
            k("1", "1"),
            k("2", "2"),
            k("3", "3"),
            k("▼", "down", "fn"),
            k(".", ".", "fn"),
            k("0", "0"),
            k("Done ✓", "done", "go", 2),
          ]}
    </div>
  );
}

// ---- once a stair ----

const HINT: Partial<Record<StairSection, ReactNode>> = {
  rest: (
    <>
      <b>AS 1851-2012:</b> open and re-close the two doors next to the slowest door, and time the force and velocity coming back.
    </>
  ),
  fan: "AS 1851-2012 functionality record (Figure I4.3).",
  quick: (
    <>
      <b>AS 1851-2012 Table 13.4.2.2.</b> Ribbons and judgement are enough. The same door every time.
    </>
  ),
  noise: (
    <>
      The <b>phone meter</b> is a reference check only: on the report it shows as “phone ref.”, never as the result or pass / fail. The result is the number typed from the calibrated meter.
    </>
  ),
  pa: "Recorded for the report. It's only a limit for a 1979 system (50 Pa).",
};

function Once({ section, sys, stair, stairNo, test, setTest, onBack }: Props & { section: StairSection }) {
  const once = test.once[stair.id] ?? {};
  const l = limits(sys);
  const set = (patch: Partial<StairOnce>) => setTest((t) => ({ ...t, once: { ...t.once, [stair.id]: { ...t.once[stair.id], ...patch } } }));
  const tick = (field: "fan" | "quick", key: string) => {
    const cur = once[field]?.[key];
    const next: Tick | undefined = !cur ? "y" : cur === "y" ? "n" : undefined;
    const ticks = { ...once[field] };
    if (next) ticks[key] = next;
    else delete ticks[key];
    set({ [field]: ticks });
  };
  const num = (v?: string) => (v?.trim() ? Number(v) : null);
  const judge = (v: string | undefined, max: number | null) => {
    const n = num(v);
    return n === null || max === null ? undefined : n <= max;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title={SECTION[section].name} sub={stairName(stair, stairNo)} onBack={onBack} right={<Pill>{SECTION[section].once}</Pill>} />
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 14px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
        {section === "noise" && (
          <>
            <PhoneMeter saved={once.noiseRef} onSave={(v) => set({ noiseRef: v })} />
            <Field label="Noisiest door" sub="level" value={once.noiseLevel} onChange={(v) => set({ noiseLevel: v })} text />
            <Field label="Noise in the stair" sub={`calibrated meter · dB(A) · ≤ ${l.noiseStair}`} value={once.noiseStair} onChange={(v) => set({ noiseStair: v })} ok={judge(once.noiseStair, l.noiseStair)} />
            <Field label="Noise in the occupied space" sub={`calibrated meter · dB(A)${l.noiseOcc === null ? " · recorded" : ` · ≤ ${l.noiseOcc}`}`} value={once.noiseOcc} onChange={(v) => set({ noiseOcc: v })} ok={judge(once.noiseOcc, l.noiseOcc)} />
          </>
        )}
        {section === "rest" && (
          <>
            <Field label="Test door (the slowest)" sub="level" value={once.restLevel} onChange={(v) => set({ restLevel: v })} text />
            <Field label="Doors opened and re-closed" sub="the two next to it" value={once.restDoors} onChange={(v) => set({ restDoors: v })} text />
            <Field label="Time to restore" sub={`s · ≤ ${l.rest}`} value={once.restTime} onChange={(v) => set({ restTime: v })} ok={judge(once.restTime, l.rest)} />
          </>
        )}
        {section === "pa" && <Field label="Stair pressure, all doors closed" sub={l.pa === null ? "Pa · recorded (no limit after 1979)" : `Pa · ≤ ${l.pa}`} value={once.pa} onChange={(v) => set({ pa: v })} ok={judge(once.pa, l.pa)} />}
        {(section === "fan" || section === "quick") && (
          <>
            {section === "fan" && stair.fan.trim() && <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>Fan {stair.fan.trim()}</div>}
            {(section === "fan" ? FAN_CHECKS : QUICK_CHECKS).map(([k, label]) => {
              const t = once[section]?.[k];
              return (
                <button
                  key={k}
                  onClick={() => tick(section, k)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 11, padding: "10px 11px", color: "var(--text)" }}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 800, lineHeight: 1.3 }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, padding: "5px 11px", borderRadius: 8, background: t === "y" ? "rgba(43,212,122,.18)" : t === "n" ? "rgba(255,90,74,.15)" : "#143452", color: t === "y" ? PASS : t === "n" ? FAIL : "var(--muted)" }}>
                    {t === "y" ? "Yes" : t === "n" ? "No" : "Tap"}
                  </span>
                </button>
              );
            })}
          </>
        )}
        {HINT[section] && <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 4 }}>{HINT[section]}</div>}
      </div>
      <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + env(safe-area-inset-bottom))" }}>
        <button onClick={onBack} style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800 }}>
          Done ›
        </button>
      </div>
    </div>
  );
}

function Field({ label, sub, value, onChange, ok, text }: { label: string; sub: string; value?: string; onChange: (v: string) => void; ok?: boolean; text?: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 11, padding: "9px 11px" }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 800, lineHeight: 1.3 }}>
        {label}
        <small style={{ display: "block", fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>{sub}</small>
      </span>
      <input
        aria-label={label}
        inputMode={text ? "text" : "decimal"}
        placeholder="type"
        value={value ?? ""}
        onChange={(e) => onChange(text ? e.target.value : e.target.value.replace(/[^\d.]/g, ""))}
        style={{ width: text ? 120 : 80, background: "none", border: "none", outline: "none", textAlign: "right", fontSize: text ? 15 : 19, fontWeight: 800, color: ok === undefined ? "var(--text)" : ok ? PASS : FAIL }}
      />
    </label>
  );
}

// the phone's microphone as a sound meter: a reference check only
function PhoneMeter({ saved, onSave }: { saved?: string; onSave: (v: string) => void }) {
  const [level, setLevel] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(meterOffset());
  const meter = useRef<Meter | null>(null);

  useEffect(() => () => meter.current?.stop(), []);

  async function toggle() {
    if (meter.current) {
      meter.current.stop();
      meter.current = null;
      setLevel(null);
      return;
    }
    setError("");
    try {
      meter.current = await startMeter((v) => {
        setLevel(v);
        setMax((m) => (m === null || v > m ? Math.round(v * 10) / 10 : m));
      });
    } catch {
      setError("The microphone isn't available. Allow it for Inspecta in the phone's settings.");
    }
  }
  const nudge = (d: number) => {
    const next = offset + d;
    setOffset(next);
    setMeterOffset(next);
  };
  const listening = level !== null;

  return (
    <div style={{ background: "var(--panel)", border: "1px dashed #2a5a82", borderRadius: 12, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <b>Phone meter</b>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "rgba(139,160,181,.15)", color: "var(--muted)" }}>Reference only</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: "#bfd0de", fontVariantNumeric: "tabular-nums" }}>
          {listening ? level.toFixed(1) : "–"}
          <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>dB(A)</span>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
          Max
          <b style={{ display: "block", fontSize: 20, color: "var(--text)" }}>{max ?? "–"}</b>
        </div>
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: "#143452" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.min(100, level ?? 0)}%`, borderRadius: 3, background: "#5f7890", transition: "width .2s" }} />
        <span style={{ position: "absolute", top: -3, left: "80%", width: 2, height: 12, background: "#f7b977" }} />
      </div>
      {error && <div style={{ fontSize: 11.5, color: FAIL }}>{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <MeterButton onClick={() => void toggle()} on={listening}>
          {listening ? "Stop" : "Listen"}
        </MeterButton>
        <MeterButton onClick={() => setMax(null)}>Reset max</MeterButton>
        <MeterButton onClick={() => max !== null && onSave(String(max))} on={!!saved}>
          {saved ? `Ref. ${saved} saved ✓` : "Save max as ref."}
        </MeterButton>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
        Line up with your calibrated meter:
        <MeterButton small onClick={() => nudge(-1)}>
          −1
        </MeterButton>
        <MeterButton small onClick={() => nudge(1)}>
          +1
        </MeterButton>
      </div>
    </div>
  );
}

function MeterButton({ children, onClick, on, small }: { children: ReactNode; onClick: () => void; on?: boolean; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{ flex: small ? "0 0 auto" : 1, padding: small ? "3px 9px" : "7px 4px", borderRadius: 9, background: "var(--panel-2)", border: on ? "1px solid var(--accent)" : "1px solid var(--border-strong)", color: on ? "#5ff0e0" : "#bfd0de", fontSize: 11.5, fontWeight: 800 }}
    >
      {children}
    </button>
  );
}
