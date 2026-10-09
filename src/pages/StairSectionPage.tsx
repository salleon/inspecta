import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { SpfStair, SpfSystem, StairDoor, StairOnce, StairSection, StairTest, Tick } from "../db/types";
import { adjacentDoor, doorFails, doorsOpen, doorStats, doorValue, FAN_CHECKS, limits, QUICK_CHECKS, SECTION, stairLevels, stairName } from "../lib/stairTest";
import { meterOffset, setMeterOffset, startMeter, type Meter } from "../lib/soundMeter";
import { useBackHandler } from "../lib/backButton";
import { AMBER, PageHeader, useStairTest } from "../components/StairUi";
import NumPad, { BLANK, k, numberKeys, PadTag } from "../components/NumPad";

// One section of a stair test (design canvas StairTestSimple, phones 3 and 4;
// tidied on SpfTidy). A reading at every door is the whole stair, a button
// per level: tap one and the purple pad opens for it; Done ✓ saves it and
// closes, ▲ ▼ step to the level above or below. You move yourself; the app
// never moves you on. A reading done once is a short screen of its own,
// its numbers typed on the same pad.

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
  const grid = "44px 44px 1fr 50px 12px";
  const rule = (b: ReactNode) => <b style={{ color: "#ffd9a8" }}>{b}</b>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title={info.name} sub={stairName(stair, stairNo)} onBack={onBack} />
      <div style={{ flexShrink: 0, padding: "0 14px" }}>
        <div data-testid="spf-rules" style={{ background: `${AMBER}.07)`, border: `1px solid ${AMBER}.45)`, borderRadius: 11, padding: "7px 9px", display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#d8c4a8", lineHeight: 1.4 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#f7b977" }}>
            Requirements · <span style={{ color: "#ffd9a8" }}>AS 1668.1-{sys.edition}{sys.type === "One test" ? "" : ` · ${sys.type}`}</span>
          </div>
          {section === "vel" ? (
            <>
              <div>
                {rule("Doors open:")} {doorsOpen(sys).map((d) => d.toLowerCase()).join(" · ")}
              </div>
              <div>{rule(`Pass ≥ ${l.vel} m/s`)}</div>
            </>
          ) : section === "force" ? (
            <>
              <div>
                {rule(sys.type === "Zone" ? `The ${word} above open` : "All stair doors closed")}, fan running
              </div>
              <div>{rule(`Pass ≤ ${l.force} N`)}</div>
            </>
          ) : (
            <div>From fully open, each door must {rule("close and latch")}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          <span style={{ whiteSpace: "nowrap" }}>
            <b style={{ color: "var(--text)" }}>
              {stats.done} of {stats.total}
            </b>
            {stats.fails > 0 && <span style={{ color: FAIL }}> · {stats.fails} fail{stats.fails === 1 ? "" : "s"}</span>}
            {stats.done === stats.total && stats.total > 0 && <span style={{ color: PASS }}> · all done ✓</span>}
          </span>
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: "#143452", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${stats.total ? (100 * stats.done) / stats.total : 0}%`, background: "var(--accent)", transition: "width .3s" }} />
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: 6, padding: "8px 14px 4px 7px", fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>Level</span>
          <span>{section === "vel" ? "Open" : ""}</span>
          <span style={{ textAlign: "center" }}>{info.unit ?? "Latches"}</span>
          <span />
          <span />
        </div>
      </div>
      <div ref={list} style={{ flexGrow: 1, overflowY: "auto", padding: `0 14px ${cur === null ? 20 : 360}px`, display: "flex", flexDirection: "column", gap: 6 }}>
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
                gap: 6,
                alignItems: "center",
                width: "100%",
                flexShrink: 0,
                padding: "6px 8px 6px 6px",
                borderRadius: 12,
                border: `1px solid ${editing ? "#b18cff" : bad ? "rgba(255,90,74,.55)" : "var(--border-strong)"}`,
                boxShadow: editing ? "0 0 0 3px rgba(177,140,255,.18)" : "0 1px 0 rgba(0,0,0,.25)",
                background: flash === j ? "rgba(43,212,122,.25)" : "var(--panel)",
                transition: "background 1.2s ease-out",
                color: "var(--text)",
              }}
            >
              <span style={{ height: 30, borderRadius: 8, background: "#143452", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, overflow: "hidden", whiteSpace: "nowrap" }}>{level}</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700, textAlign: "center" }}>{section === "vel" ? adjacentDoor(levels, j, sys) || "–" : ""}</span>
              <span style={{ fontSize: 15, fontWeight: 800, textAlign: "center", color: v ? (bad ? FAIL : PASS) : "#6a8098" }}>{v || "—"}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, textAlign: editing ? "center" : "right", borderRadius: 6, padding: "2px 0", color: editing ? "#1a0d33" : bad ? FAIL : PASS, background: editing ? "#b18cff" : "none" }}>
                {editing ? "Editing" : v ? (bad ? "Fail" : "Pass") : ""}
              </span>
              <span style={{ color: "#5f7890", fontSize: 15, textAlign: "right" }}>{editing ? "" : "›"}</span>
            </button>
          );
        })}
      </div>

      {cur !== null && (
        <NumPad
          tint="spf"
          head={
            <>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: "nowrap" }}>
                  <PadTag />
                  Level {levels[cur]}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, lineHeight: 1.35 }}>
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
              <div data-testid="spf-value" style={{ marginLeft: "auto", fontSize: 34, fontWeight: 800, minWidth: 90, textAlign: "right", color: fails === null ? "var(--text)" : fails ? FAIL : PASS, whiteSpace: "nowrap" }}>
                {value || <span style={{ fontSize: 13, color: "var(--muted)" }}>{section === "latch" ? "Yes / No" : "type"}</span>}
                {value && info.unit && <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 4 }}>{info.unit}</span>}
              </div>
            </>
          }
          keys={
            section === "latch"
              ? [k("y", "Yes", "yes"), k("n", "No", "no"), k("up", "▲", "ins", "Level above"), k("down", "▼", "ins", "Level below"), k("done", "Done ✓", "go", "Done")]
              : numberKeys(k("up", "▲", "ins", "Level above"), k("down", "▼", "ins", "Level below"), k(".", ".", "fn"))
          }
          onKey={key}
        />
      )}
    </div>
  );
}

// ---- once a stair ----

type OnceNum = "noiseStair" | "noiseOcc" | "restTime" | "pa";

function Once({ section, sys, stair, stairNo, test, setTest, onBack }: Props & { section: StairSection }) {
  const once = test.once[stair.id] ?? {};
  const l = limits(sys);
  const [pad, setPad] = useState<{ field: OnceNum; label: string; sub: string } | null>(null);
  const set = (patch: Partial<StairOnce>) => setTest((t) => ({ ...t, once: { ...t.once, [stair.id]: { ...t.once[stair.id], ...patch } } }));
  const tick = (field: "fan" | "quick", key: string, v: Tick) => {
    const ticks = { ...once[field] };
    if (ticks[key] === v) delete ticks[key];
    else ticks[key] = v;
    set({ [field]: ticks });
  };
  const num = (v?: string) => (v?.trim() ? Number(v) : null);
  const judge = (v: string | undefined, max: number | null) => {
    const n = num(v);
    return n === null || max === null ? undefined : n <= max;
  };
  useBackHandler(() => {
    if (!pad) return false;
    setPad(null);
    return true;
  });
  function key(k: string) {
    if (!pad) return;
    if (k === "done") return setPad(null);
    const f = pad.field;
    // from the latest value, so quick taps never drop a digit
    setTest((t) => {
      const cur = t.once[stair.id]?.[f] ?? "";
      let next = cur;
      if (k === "bs") next = cur.slice(0, -1);
      else if (k === "." && cur.includes(".")) return t;
      else if (cur.length >= 6) return t;
      else next = cur === "" && k === "." ? "0." : cur + k;
      return { ...t, once: { ...t.once, [stair.id]: { ...t.once[stair.id], [f]: next } } };
    });
  }
  const numField = (field: OnceNum, label: string, sub: string, max: number | null) => (
    <NumField label={label} sub={sub} value={once[field]} ok={judge(once[field], max)} active={pad?.field === field} onOpen={() => setPad({ field, label, sub })} />
  );
  const fan = stair.fan.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title={SECTION[section].name} sub={`${stairName(stair, stairNo)}${section === "fan" && fan ? ` · ${fan}` : ""}`} onBack={onBack} />
      <div style={{ flexGrow: 1, overflowY: "auto", padding: `4px 14px ${pad ? 360 : 16}px`, display: "flex", flexDirection: "column", gap: 7 }}>
        {section === "noise" && (
          <>
            <PhoneMeter saved={once.noiseRef} onSave={(v) => set({ noiseRef: v })} />
            <Field label="Noisiest door" sub="Level" value={once.noiseLevel} onChange={(v) => set({ noiseLevel: v })} onFocus={() => setPad(null)} />
            {numField("noiseStair", "In the stair", `dB(A) · ≤ ${l.noiseStair}`, l.noiseStair)}
            {numField("noiseOcc", "Occupied space", l.noiseOcc === null ? "dB(A) · recorded" : `dB(A) · ≤ ${l.noiseOcc}`, l.noiseOcc)}
          </>
        )}
        {section === "rest" && (
          <>
            <Field label="Test door (the slowest)" sub="Level" value={once.restLevel} onChange={(v) => set({ restLevel: v })} onFocus={() => setPad(null)} />
            <Field label="Doors opened and re-closed" sub="The two next to it" value={once.restDoors} onChange={(v) => set({ restDoors: v })} onFocus={() => setPad(null)} />
            {numField("restTime", "Time to restore", `s · ≤ ${l.rest}`, l.rest)}
          </>
        )}
        {section === "pa" && numField("pa", "Stair pressure, doors closed", l.pa === null ? "Pa · recorded" : `Pa · ≤ ${l.pa}`, l.pa)}
        {(section === "fan" || section === "quick") &&
          (section === "fan" ? FAN_CHECKS : QUICK_CHECKS).map(([k, label]) => {
            const t = once[section]?.[k];
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "9px 11px" }}>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, lineHeight: 1.3 }}>{label}</span>
                <span role="radiogroup" aria-label={label} style={{ display: "flex", gap: 4 }}>
                  {(["y", "n"] as Tick[]).map((v) => (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={t === v}
                      onClick={() => tick(section, k, v)}
                      style={{ fontSize: 12, fontWeight: 800, padding: "7px 12px", borderRadius: 8, border: "none", background: t === v ? (v === "y" ? "rgba(43,212,122,.18)" : "rgba(255,90,74,.15)") : "#143452", color: t === v ? (v === "y" ? PASS : FAIL) : "var(--muted)" }}
                    >
                      {v === "y" ? "Yes" : "No"}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
      </div>
      {!pad && (
        <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + env(safe-area-inset-bottom))" }}>
          <button onClick={onBack} style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800 }}>
            Done ›
          </button>
        </div>
      )}
      {pad && (
        <NumPad
          tint="spf"
          head={
            <>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: "nowrap" }}>
                  <PadTag />
                  {pad.label}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>{pad.sub}</div>
              </div>
              <div data-testid="spf-value" style={{ marginLeft: "auto", fontSize: 34, fontWeight: 800, whiteSpace: "nowrap" }}>
                {once[pad.field] || <span style={{ fontSize: 13, color: "var(--muted)" }}>type</span>}
              </div>
            </>
          }
          keys={numberKeys(BLANK(1), BLANK(2), k(".", ".", "fn"))}
          onKey={key}
        />
      )}
    </div>
  );
}

const rowStyle = (active: boolean) =>
  ({ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "var(--panel)", border: `1px solid ${active ? "#b18cff" : "var(--border)"}`, boxShadow: active ? "0 0 0 3px rgba(177,140,255,.18)" : "none", borderRadius: 12, padding: "10px 12px", color: "var(--text)" }) as const;

function Label({ label, sub }: { label: string; sub: string }) {
  return (
    <span style={{ flex: 1, fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>
      {label}
      <small style={{ display: "block", fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>{sub}</small>
    </span>
  );
}

// a number, typed on the pad
function NumField({ label, sub, value, ok, active, onOpen }: { label: string; sub: string; value?: string; ok?: boolean; active: boolean; onOpen: () => void }) {
  return (
    <button aria-label={label} onClick={onOpen} style={rowStyle(active)}>
      <Label label={label} sub={sub} />
      <span style={{ fontSize: 20, fontWeight: 800, color: !value ? "#3f5a74" : ok === undefined ? "var(--text)" : ok ? PASS : FAIL }}>{value || "—"}</span>
    </button>
  );
}

// words (a level, which doors): the phone's keyboard
function Field({ label, sub, value, onChange, onFocus }: { label: string; sub: string; value?: string; onChange: (v: string) => void; onFocus: () => void }) {
  return (
    <label style={rowStyle(false)}>
      <Label label={label} sub={sub} />
      <input aria-label={label} value={value ?? ""} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} style={{ width: 120, background: "none", border: "none", outline: "none", textAlign: "right", fontSize: 18, fontWeight: 800, color: "var(--text)" }} />
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
    <div style={{ background: "#0a2135", border: "1px dashed #2a5a82", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <b>Phone meter</b>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "rgba(139,160,181,.15)", color: "var(--muted)" }}>Reference only</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#bfd0de", fontVariantNumeric: "tabular-nums" }}>
          {listening ? level.toFixed(1) : "–"}
          <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>dB(A)</span>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
          Max
          <b style={{ display: "block", fontSize: 19, color: "var(--text)" }}>{max ?? "–"}</b>
        </div>
      </div>
      {error && <div style={{ fontSize: 11.5, color: FAIL }}>{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <MeterButton onClick={() => void toggle()} on={listening}>
          {listening ? "Stop" : "Listen"}
        </MeterButton>
        <MeterButton onClick={() => setMax(null)}>Reset max</MeterButton>
        <MeterButton onClick={() => max !== null && onSave(String(max))} on={!!saved}>
          {saved ? `Ref. ${saved} ✓` : "Save as ref."}
        </MeterButton>
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
      style={{ flex: small ? "0 0 40px" : 1, padding: "8px 4px", borderRadius: 9, background: "#143452", border: on ? "1px solid var(--accent)" : "1px solid var(--border-strong)", color: on ? "#5ff0e0" : "#bfd0de", fontSize: 11.5, fontWeight: 800, lineHeight: 1.2 }}
    >
      {children}
    </button>
  );
}
