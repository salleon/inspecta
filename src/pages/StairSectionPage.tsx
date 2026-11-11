import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { SpfStair, SpfSystem, StairDoor, StairOnce, StairSection, StairTest, Tick } from "../db/types";
import {
  adjacentDoor,
  ALL_SECTIONS,
  doorFails,
  doorKey,
  doorLetter,
  doorMarginal,
  doorsAt,
  doorsEach,
  doorsOpen,
  doorStats,
  doorValue,
  FAN_CHECKS,
  FAN_SOURCE,
  GENERAL_EXTRA,
  isCustomLevel,
  KIND_LABEL,
  latestDoor,
  levelChip,
  limits,
  newRun,
  QUICK_CHECKS,
  runChange,
  runCount,
  runDoors,
  SECTION,
  stairFan,
  stairLabel,
  stairLevels,
  type Every,
} from "../lib/stairTest";
import { startMeter, type Meter, type MeterInfo } from "../lib/soundMeter";
import { useBackHandler } from "../lib/backButton";
import { AMBER, PageHeader, useStairTest } from "../components/StairUi";
import NumPad, { BLANK, k, numberKeys, PadTag, readingKeys } from "../components/NumPad";
import ConfirmDialog from "../components/ConfirmDialog";

// One section of a stair test (design canvas StairTestSimple, phones 3 and 4;
// tidied on SpfTidy; general system testing on the Stair general system
// testing canvas, board 3). A reading at every door is the whole stair, a row
// per level with a cell for each of its doors: tap one and the purple pad
// opens for it; Done ✓ saves it and closes, ▲ ▼ step to the level above or
// below. You move yourself; the app never moves you on. + Door at the end of
// a row adds a door at that level. The stairs are cards across the top;
// general system testing has its runs under them (each run's readings beside
// the last one's) and the tests in the run. A reading done once is a short
// screen of its own, its numbers typed on the same pad. Whatever is added
// can be taken away again: Remove door in the pad's heading (the last door
// added at a level), Delete run in a run's sheet, ⌫ for a Yes / No answer.

const PASS = "#2bd47a";
const FAIL = "#ff7a6a";
const WARN = "#f7c948";

export default function StairSectionPage() {
  const { siteId, testId, section } = useParams<{ siteId: string; testId: string; section: StairSection }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { site, test, setTest, setSpf, flush } = useStairTest(siteId, testId);
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
  // the run being read: the latest, unless one is picked
  const runs = runCount(test);
  const picked = params.get("run");
  const run = test.kind === "general" ? Math.min(runs - 1, Math.max(0, picked === null ? runs - 1 : Number(picked) || 0)) : 0;
  const query = (stairId: string, r: number) => `?stair=${stairId}${test.kind === "general" ? `&run=${r}` : ""}`;
  return SECTION[section].every ? (
    <EveryDoor
      key={`${stair.id} ${section} ${run}`}
      section={section as Every}
      sys={sys}
      stair={stair}
      stairNo={i}
      test={test}
      setTest={setTest}
      setSpf={setSpf}
      onBack={leave}
      run={run}
      onStair={(id) => setParams(query(id, run), { replace: true })}
      onRun={(r) => setParams(query(stair.id, r), { replace: true })}
      onSection={(s) => {
        flush();
        navigate(`/site/${siteId}/spf/${testId}/${s}${query(stair.id, run)}`, { replace: true });
      }}
    />
  ) : (
    <Once section={section} sys={sys} stair={stair} stairNo={i} test={test} setTest={setTest} onBack={leave} />
  );
}

type Props = { sys: SpfSystem; stair: SpfStair; stairNo: number; test: StairTest; setTest: (u: (t: StairTest) => StairTest) => void; onBack: () => void };
type EveryProps = Props & { section: Every; run: number; setSpf: (u: (s: SpfSystem) => SpfSystem) => void; onStair: (id: string) => void; onRun: (run: number) => void; onSection: (s: StairSection) => void };

const chip = (on: boolean, dashed = false) =>
  ({
    flex: "0 0 auto",
    padding: "6px 11px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
    background: on ? "rgba(177,140,255,.18)" : dashed ? "none" : "var(--panel)",
    border: on ? "1px solid #b18cff" : dashed ? "1px dashed #3f5a74" : "1px solid var(--border-strong)",
    color: on ? "#d6c4ff" : dashed ? "var(--muted)" : "#bfd0de",
  }) as const;

function EveryDoor({ section, sys, stair, test, setTest, setSpf, onBack, run, onStair, onRun, onSection }: EveryProps) {
  const general = test.kind === "general";
  const levels = stairLevels(stair);
  const mine = runDoors(test, run)[stair.id] ?? {};
  const [cur, setCur] = useState<{ li: number; n: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ edit: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [ask, setAsk] = useState<{ title: string; message: string; label: string; go: () => void } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const info = SECTION[section];
  const stats = doorStats(test, stair, section, sys);
  const l = limits(sys);
  const word = sys.edition === "1979" ? "storey" : sys.edition === "1991" ? "floor" : "compartment";
  const runs = runCount(test);

  useBackHandler(() => {
    if (ask) setAsk(null);
    else if (sheet) setSheet(null);
    else if (cur !== null) setCur(null);
    else return false;
    return true;
  });

  // the level being typed stays in view above the keypad
  useEffect(() => {
    if (cur === null || !list.current) return;
    const row = list.current.querySelector<HTMLElement>(`[data-i="${cur.li}"]`);
    if (!row) return;
    const box = list.current.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const visible = box.height - 330;
    if (r.top < box.top || r.bottom > box.top + visible) list.current.scrollTop += r.top - box.top - Math.max(0, visible - 3 * r.height);
  }, [cur]);

  // a door's reading in this run, from the latest so quick taps never drop a digit
  const write = (key: string, change: (d: StairDoor) => StairDoor | null) =>
    setTest((t) => {
      const all = runDoors(t, run);
      const forStair = { ...all[stair.id] };
      const next = change({ ...forStair[key] });
      if (!next) return t;
      if (!next.vel) delete next.vel;
      if (!next.force) delete next.force;
      if (!next.latch) delete next.latch;
      forStair[key] = next;
      const doors = { ...all, [stair.id]: forStair };
      return run === 0 ? { ...t, doors } : { ...t, runs: (t.runs ?? []).map((x, j) => (j === run - 1 ? { ...x, doors } : x)) };
    });

  const curKey = cur === null ? "" : doorKey(levels[cur.li], cur.n);
  function key(k: string) {
    if (cur === null) return;
    if (k === "done") {
      if (doorValue(section, mine[curKey])) {
        setFlash(curKey);
        setTimeout(() => setFlash(null), 1400);
      }
      setCur(null);
      return;
    }
    if (k === "up" || k === "down") {
      const li = Math.max(0, Math.min(levels.length - 1, cur.li + (k === "up" ? -1 : 1)));
      return setCur({ li, n: Math.min(cur.n, doorsAt(stair, levels[li]) - 1) });
    }
    if (section === "latch") {
      if (k === "y" || k === "n") write(curKey, (d) => ({ ...d, latch: k }));
      // ⌫: back to not tested
      else if (k === "bs") write(curKey, (d) => ({ ...d, latch: undefined }));
      return;
    }
    const field = section;
    write(curKey, (d) => {
      const v = d[field] ?? "";
      const below = v.startsWith("<");
      const body = below ? v.slice(1) : v;
      let next: string;
      // below what the meter reads: "<" and then its lowest reading
      if (k === "lt") next = below ? body : `<${body}`;
      else if (k === "bs") next = v.slice(0, -1);
      else if (k === "." && body.includes(".")) return null;
      else if (body.length >= 6) return null;
      else next = (below ? "<" : "") + (body === "" && k === "." ? "0." : body + k);
      return { ...d, [field]: next };
    });
  }

  const addDoor = (level: string) => setSpf((s) => ({ ...s, stairs: s.stairs.map((st) => (st.id === stair.id ? { ...st, more: { ...st.more, [level]: (st.more?.[level] ?? 0) + 1 } } : st)) }));

  // the last door added at a level comes off again, with its readings in this test
  const removeDoor = (level: string, key: string) => {
    setSpf((s) => ({
      ...s,
      stairs: s.stairs.map((st) => {
        if (st.id !== stair.id) return st;
        const more = { ...st.more };
        if ((more[level] ?? 0) > 1) more[level]--;
        else delete more[level];
        return { ...st, more: Object.keys(more).length ? more : undefined };
      }),
    }));
    const drop = (all: StairTest["doors"]) => {
      if (!all[stair.id]?.[key]) return all;
      const forStair = { ...all[stair.id] };
      delete forStair[key];
      return { ...all, [stair.id]: forStair };
    };
    setTest((t) => ({ ...t, doors: drop(t.doors), runs: t.runs?.map((x) => ({ ...x, doors: drop(x.doors) })) }));
    setCur(null);
  };
  // only the last door on a level, and only one that was added here (the stair's own count is set in the system)
  const removable = cur !== null && cur.n > 0 && cur.n === doorsAt(stair, levels[cur.li]) - 1 && cur.n >= doorsEach(stair);
  const askRemoveDoor = () => {
    if (cur === null) return;
    const level = levels[cur.li];
    const key = curKey;
    const read = Array.from({ length: runs }, (_, r) => runDoors(test, r)[stair.id]?.[key]).some((d) => d && (d.vel || d.force || d.latch));
    if (!read) return removeDoor(level, key);
    setCur(null);
    setAsk({ title: `Remove door ${doorLetter(cur.n)} on ${level}?`, message: "Its readings in this test go with it.", label: "Remove", go: () => removeDoor(level, key) });
  };
  const deleteRun = () => {
    setSheet(null);
    setAsk({
      title: `Delete run ${run + 1}?`,
      message: `Its readings go with it.${run < runs - 1 ? " The runs after it move up one." : ""}`,
      label: "Delete",
      go: () => {
        setTest((t) => ({ ...t, runs: (t.runs ?? []).filter((_, j) => j !== run - 1) }));
        onRun(run - 1);
      },
    });
  };

  const value = cur === null ? "" : doorValue(section, mine[curKey]);
  const fails = cur === null ? null : doorFails(section, mine[curKey], sys);
  const close = cur !== null && doorMarginal(section, mine[curKey], sys);
  const before = cur !== null && run > 0 ? doorValue(section, latestDoor(test, stair.id, curKey, section, run - 1)) : "";
  const rule = (b: ReactNode) => <b style={{ color: "#ffd9a8" }}>{b}</b>;
  const colour = (d: StairDoor | undefined) => (doorFails(section, d, sys) ? FAIL : doorMarginal(section, d, sys) ? WARN : PASS);
  const missing = GENERAL_EXTRA.filter((s) => !test.sections.includes(s));
  const lead = section === "vel" ? "44px 44px" : "44px";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title={general ? KIND_LABEL.general : info.name} sub={general ? `${info.name} · ${stairLabel(stair)}` : stairLabel(stair)} onBack={onBack} />
      <div style={{ flexShrink: 0, padding: "0 14px", display: "flex", flexDirection: "column", gap: 7 }}>
        {/* the stairs: the main thing to switch */}
        {sys.stairs.length > 1 && (
          <div data-testid="spf-stairs" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", margin: "0 -14px", padding: "0 14px" }}>
            {sys.stairs.map((st) => {
              const x = doorStats(test, st, section, sys);
              const on = st.id === stair.id;
              return (
                <button
                  key={st.id}
                  onClick={() => onStair(st.id)}
                  style={{ flex: "1 0 auto", minWidth: 84, textAlign: "left", padding: "7px 10px", borderRadius: 10, background: on ? "rgba(177,140,255,.18)" : "var(--panel)", border: on ? "1px solid #b18cff" : "1px solid var(--border-strong)", color: "var(--text)" }}
                >
                  <b style={{ display: "block", fontSize: 12.5, whiteSpace: "nowrap" }}>
                    {stairFan(st) || "No fan name"}
                  </b>
                  <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", color: x.fails ? FAIL : x.marginal ? WARN : x.done ? PASS : "var(--muted)" }}>
                    {x.done} of {x.total}
                    {x.fails ? ` · ${x.fails} fail${x.fails === 1 ? "" : "s"}` : x.done ? " · pass" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {general && (
          <>
            <div data-testid="spf-runs" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", flexShrink: 1, minWidth: 0 }}>
                {Array.from({ length: runs }, (_, r) => (
                  <button
                    key={r}
                    aria-pressed={r === run}
                    onClick={() => onRun(r)}
                    style={{ flex: "0 0 auto", padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 800, background: r === run ? "rgba(var(--accent-rgb), .14)" : "#0a2135", border: r === run ? "1px solid var(--accent)" : "1px solid var(--border-strong)", color: r === run ? "var(--text)" : "var(--muted)" }}
                  >
                    Run {r + 1}
                  </button>
                ))}
              </div>
              <button
                disabled={run === 0}
                onClick={() => setSheet({ edit: true, text: runChange(test, run) })}
                style={{ flex: "1 1 0", minWidth: 0, textAlign: "left", border: "none", background: "none", padding: "6px 2px", fontSize: 11.5, fontWeight: 700, color: "#9eeee5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {runChange(test, run) || "What changed?"}
              </button>
              <button onClick={() => setSheet({ edit: false, text: "" })} style={{ flex: "0 0 auto", padding: "8px 12px", borderRadius: 10, background: "none", border: "1px dashed var(--accent)", color: "#5ff0e0", fontSize: 13, fontWeight: 800 }}>
                + Run
              </button>
            </div>
            <div data-testid="spf-tests" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {test.sections.map((s) => (
                <button key={s} aria-pressed={s === section} onClick={() => s !== section && onSection(s)} style={chip(s === section)}>
                  {SECTION[s].name}
                </button>
              ))}
              {missing.length > 0 && (
                <button aria-expanded={adding} onClick={() => setAdding(!adding)} style={chip(false, true)}>
                  + Test
                </button>
              )}
              {adding &&
                missing.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setTest((t) => ({ ...t, sections: ALL_SECTIONS.filter((x) => t.sections.includes(x) || x === s) }));
                      setAdding(false);
                      if (SECTION[s].every) onSection(s);
                    }}
                    style={chip(false, true)}
                  >
                    + {SECTION[s].name}
                  </button>
                ))}
            </div>
          </>
        )}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
          <span style={{ whiteSpace: "nowrap" }}>
            <b style={{ color: "var(--text)" }}>
              {stats.done} of {stats.total}
            </b>
            {stats.fails > 0 && <span style={{ color: FAIL }}> · {stats.fails} fail{stats.fails === 1 ? "" : "s"}</span>}
            {stats.marginal > 0 && <span style={{ color: WARN }}> · {stats.marginal} marginal</span>}
            {stats.done === stats.total && stats.total > 0 && <span style={{ color: PASS }}> · all done ✓</span>}
          </span>
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--panel-2)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${stats.total ? (100 * stats.done) / stats.total : 0}%`, background: "var(--accent)", transition: "width .3s" }} />
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `${lead} 1fr 54px`, gap: 6, padding: "1px 0 4px", fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span style={{ textAlign: "center" }}>Level</span>
          {section === "vel" && <span style={{ textAlign: "center" }}>Open</span>}
          <span style={{ textAlign: "center" }}>{info.unit ?? "Latches"}</span>
          <span />
        </div>
      </div>
      <div ref={list} style={{ flexGrow: 1, overflowY: "auto", padding: `0 14px ${cur === null ? 20 : 360}px`, display: "flex", flexDirection: "column", gap: 6 }}>
        {levels.map((level, li) => {
          const of = doorsAt(stair, level);
          return (
            <div key={level} data-i={li} style={{ display: "grid", gridTemplateColumns: `${lead} 1fr 54px`, gap: 6, alignItems: "center", flexShrink: 0 }}>
              <span style={{ height: 40, borderRadius: 8, background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, overflow: "hidden", whiteSpace: "nowrap" }}>{levelChip(level)}</span>
              {section === "vel" && <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700, textAlign: "center" }}>{adjacentDoor(levels, li, sys) || "–"}</span>}
              <span style={{ display: "flex", gap: 6, minWidth: 0 }}>
                {Array.from({ length: of }, (_, n) => {
                  const dk = doorKey(level, n);
                  const d = mine[dk];
                  const v = doorValue(section, d);
                  const bad = doorFails(section, d, sys);
                  const editing = cur?.li === li && cur.n === n;
                  const was = run > 0 ? doorValue(section, latestDoor(test, stair.id, dk, section, run - 1)) : "";
                  const up = v && was && section !== "latch" ? (parseFloat(v.replace("<", "")) >= parseFloat(was.replace("<", "")) ? " ↑" : " ↓") : "";
                  return (
                    <button
                      key={n}
                      aria-label={`${isCustomLevel(level) ? level : `Level ${level}`}${of > 1 ? ` door ${doorLetter(n)}` : ""}`}
                      onClick={() => setCur({ li, n })}
                      style={{
                        flex: "1 1 0",
                        minWidth: 0,
                        height: 40,
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "center",
                        gap: 5,
                        padding: "0 4px",
                        borderRadius: 9,
                        border: `1px solid ${editing ? "#b18cff" : bad ? "rgba(255,90,74,.55)" : v && doorMarginal(section, d, sys) ? "rgba(247,201,72,.55)" : "var(--border-strong)"}`,
                        boxShadow: editing ? "0 0 0 3px rgba(177,140,255,.18)" : "none",
                        background: flash === dk ? "rgba(43,212,122,.25)" : "var(--panel)",
                        transition: "background 1.2s ease-out",
                        color: v ? colour(d) : "#6a8098",
                        lineHeight: "38px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      {of > 1 && <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 800 }}>{doorLetter(n)}</span>}
                      <b style={{ fontSize: 16 }}>{v || "—"}</b>
                      {of <= 2 &&
                        (editing ? (
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#1a0d33", background: "#b18cff", borderRadius: 6, padding: "2px 5px", lineHeight: 1.2 }}>Editing</span>
                        ) : was ? (
                          <span style={{ fontSize: 11, color: "#6a8098", fontWeight: 700 }}>
                            {was}
                            {up}
                          </span>
                        ) : v ? (
                          <span style={{ fontSize: 11, fontWeight: 800 }}>{bad ? "Fail" : "Pass"}</span>
                        ) : null)}
                    </button>
                  );
                })}
              </span>
              <button
                aria-label={`Add a door on ${isCustomLevel(level) ? level : `level ${level}`}`}
                onClick={() => addDoor(level)}
                style={{ height: 40, borderRadius: 9, background: "none", border: "1px dashed #3f5a74", color: "var(--muted)", fontSize: 10.5, fontWeight: 800, padding: 0 }}
              >
                + Door
              </button>
            </div>
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
                  {isCustomLevel(levels[cur.li]) ? levels[cur.li] : `Level ${levels[cur.li]}`}
                  {doorsAt(stair, levels[cur.li]) > 1 ? ` · Door ${doorLetter(cur.n)}` : ""}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, lineHeight: 1.35 }}>
                  {section === "vel" && (
                    <>
                      Open: {levels[cur.li]}
                      {adjacentDoor(levels, cur.li, sys) ? ` + ${adjacentDoor(levels, cur.li, sys)}` : ""} + discharge
                      <br />
                    </>
                  )}
                  {general ? `Run ${run + 1} · ` : ""}
                  {section === "vel" ? `≥ ${l.vel} m/s` : section === "force" ? `≤ ${l.force} N` : "Yes to pass"}
                  {before ? ` · before: ${before}` : ""}
                </div>
                {removable && (
                  <button onClick={askRemoveDoor} style={{ marginTop: 4, padding: "5px 10px", borderRadius: 8, background: "rgba(255,92,106,.12)", border: "1px solid rgba(255,120,130,.45)", color: "#ff9aa4", fontSize: 11.5, fontWeight: 800 }}>
                    Remove door {doorLetter(cur.n)}
                  </button>
                )}
              </div>
              <div data-testid="spf-value" style={{ marginLeft: "auto", fontSize: 34, fontWeight: 800, minWidth: 90, textAlign: "right", color: fails === null ? "var(--text)" : fails ? FAIL : close ? WARN : PASS, whiteSpace: "nowrap" }}>
                {value || <span style={{ fontSize: 13, color: "var(--muted)" }}>{section === "latch" ? "Yes / No" : "type"}</span>}
                {value && info.unit && <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 4 }}>{info.unit}</span>}
              </div>
            </>
          }
          keys={
            section === "latch"
              ? [k("y", "Yes", "yes"), k("n", "No", "no"), k("bs", "⌫", "bs", "Clear"), k("up", "▲", "ins", "Level above"), k("down", "▼", "ins", "Level below"), k("done", "Done ✓", "go1", "Done")]
              : readingKeys(k(".", ".", "fn"), null)
          }
          onKey={key}
        />
      )}

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)} style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end", zIndex: 6 }}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "18px 18px calc(24px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <b style={{ fontSize: 18 }}>Run {sheet.edit ? run + 1 : runs + 1}</b>
              <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700 }}>after run {sheet.edit ? run : runs}</span>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>What changed</span>
              <textarea
                aria-label="What changed"
                autoFocus
                rows={2}
                value={sheet.text}
                onChange={(e) => setSheet({ ...sheet, text: e.target.value })}
                style={{ resize: "none", padding: "11px 12px", borderRadius: 11, background: "#0a2135", border: "1px solid var(--accent)", color: "var(--text)", fontSize: 15, fontWeight: 700, fontFamily: "inherit", lineHeight: 1.4, outline: "none" }}
              />
            </label>
            {sheet.edit && (
              <button onClick={deleteRun} style={{ alignSelf: "flex-start", padding: "8px 12px", borderRadius: 10, background: "rgba(255,92,106,.12)", border: "1px solid rgba(255,120,130,.45)", color: "#ff9aa4", fontSize: 13, fontWeight: 800 }}>
                Delete run {run + 1}
              </button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSheet(null)} style={{ flex: 1, padding: "15px 0", borderRadius: 13, background: "none", border: "1px solid var(--border-strong)", color: "#bfd0de", fontSize: 15, fontWeight: 800 }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  const text = sheet.text;
                  if (sheet.edit) setTest((t) => ({ ...t, runs: (t.runs ?? []).map((x, j) => (j === run - 1 ? { ...x, change: text.trim() } : x)) }));
                  else {
                    setTest((t) => ({ ...t, runs: [...(t.runs ?? []), newRun(text)] }));
                    onRun(runs);
                  }
                  setSheet(null);
                }}
                style={{ flex: 2, padding: "15px 0", borderRadius: 13, background: "var(--accent)", border: "none", color: "var(--accent-text)", fontSize: 15, fontWeight: 800 }}
              >
                {sheet.edit ? "Save" : `Start run ${runs + 1}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {ask && (
        <div style={{ position: "absolute", inset: 0, zIndex: 8 }}>
          <ConfirmDialog
            title={ask.title}
            message={ask.message}
            confirmLabel={ask.label}
            onCancel={() => setAsk(null)}
            onConfirm={() => {
              ask.go();
              setAsk(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---- once a stair ----

type OnceNum = "noiseStair" | "noiseOcc" | "ambient" | "restTime" | "pa" | "noiseRefAvg" | "noiseRef";

function Once({ section, sys, stair, test, setTest, onBack }: Props & { section: StairSection }) {
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
      const o = { ...t.once[stair.id], [f]: next };
      // a new ambient reading is at the noisiest door as it stands
      if (f === "ambient" && cur === "") o.ambientLevel = o.noiseLevel?.trim() || undefined;
      // a typed average or max is from a calibrated meter
      if (f === "noiseRefAvg" || f === "noiseRef") o.noiseRefSource = "meter";
      return { ...t, once: { ...t.once, [stair.id]: o } };
    });
  }
  const numField = (field: OnceNum, label: string, sub: string, max: number | null) => (
    <NumField label={label} sub={sub} value={once[field]} ok={judge(once[field], max)} active={pad?.field === field} onOpen={() => setPad({ field, label, sub })} />
  );
  const fan = stair.fan.trim();
  // the noisiest door has changed since the ambient was taken
  const moved = !!once.ambient?.trim() && !!once.noiseLevel?.trim() && once.noiseLevel.trim() !== (once.ambientLevel ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title={SECTION[section].name} sub={`${stairLabel(stair)}${section === "fan" && fan ? ` · ${fan}` : ""}`} onBack={onBack} />
      <div style={{ flexGrow: 1, overflowY: "auto", padding: `4px 14px ${pad ? 360 : 16}px`, display: "flex", flexDirection: "column", gap: 7 }}>
        {section === "noise" && (
          <>
            <PhoneMeter
              saved={{ avg: once.noiseRefAvg, max: once.noiseRef, meter: once.noiseRefSource === "meter" }}
              onSave={(avg, max) => set({ noiseRefAvg: avg, noiseRef: max, noiseRefSource: avg || max ? "phone" : undefined })}
              editing={pad?.field === "noiseRefAvg" || pad?.field === "noiseRef" ? pad.field : null}
              onEdit={(field) => setPad({ field, label: field === "noiseRef" ? "Max" : "Average", sub: "dB(A) · from a calibrated meter" })}
              onListen={() => setPad(null)}
            />
            <Field label="Noisiest door" sub="Level" value={once.noiseLevel} onChange={(v) => set({ noiseLevel: v })} onFocus={() => setPad(null)} />
            {numField("noiseStair", "In the stair", `dB(A) · ≤ ${l.noiseStair}`, l.noiseStair)}
            {numField("noiseOcc", "Occupied space", l.noiseOcc === null ? "dB(A) · recorded" : `dB(A) · ≤ ${l.noiseOcc}`, l.noiseOcc)}
            {numField("ambient", "Ambient, fan off", `dB(A)${once.ambient?.trim() && once.ambientLevel ? ` · at ${once.ambientLevel}` : " · recorded"}`, null)}
            {once.ambient?.trim() && (
              <button
                onClick={() => {
                  set({ ambient: "", ambientLevel: once.noiseLevel?.trim() || undefined });
                  setPad({ field: "ambient", label: "Ambient, fan off", sub: `dB(A)${once.noiseLevel?.trim() ? ` · at ${once.noiseLevel.trim()}` : ""}` });
                }}
                style={{ alignSelf: "flex-end", fontSize: 12, fontWeight: 800, padding: "7px 12px", borderRadius: 9, background: "var(--panel-2)", border: `1px solid ${moved ? "#b18cff" : "var(--border-strong)"}`, color: moved ? "#d6c4ff" : "#bfd0de" }}
              >
                {moved ? `Re-record ambient at ${once.noiseLevel!.trim()}` : "Re-record ambient"}
              </button>
            )}
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
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, lineHeight: 1.3 }}>
                  {label}
                  {section === "fan" && <small style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#6a8098", marginTop: 2 }}>AS 1851-2012 {FAN_SOURCE[k]}</small>}
                </span>
                <span role="radiogroup" aria-label={label} style={{ display: "flex", gap: 4 }}>
                  {(["y", "n"] as Tick[]).map((v) => (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={t === v}
                      onClick={() => tick(section, k, v)}
                      style={{ fontSize: 12, fontWeight: 800, padding: "7px 12px", borderRadius: 8, border: "none", background: t === v ? (v === "y" ? "rgba(43,212,122,.18)" : "rgba(255,90,74,.15)") : "var(--panel-2)", color: t === v ? (v === "y" ? PASS : FAIL) : "var(--muted)" }}
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

// The stair's average and max sound level. The phone's microphone gives an
// indicative measure: Listen, then Stop saves the average (the energy
// average, as a sound level meter's Leq) and max of that listen to the
// stair. With a calibrated meter on hand, tap Average or Max to type them
// instead. Either prints on the report under the stair's max noise, saying
// which it was. Listening again replaces typed ones.
function PhoneMeter({
  saved,
  onSave,
  editing,
  onEdit,
  onListen,
}: {
  saved: { avg?: string; max?: string; meter: boolean };
  onSave: (avg: string | undefined, max: string | undefined) => void;
  editing: "noiseRefAvg" | "noiseRef" | null;
  onEdit: (field: "noiseRefAvg" | "noiseRef") => void;
  onListen: () => void;
}) {
  const [level, setLevel] = useState<number | null>(null);
  const [raw, setRaw] = useState<number | null>(null);
  const [info, setInfo] = useState<MeterInfo | null>(null);
  // this listen: its max, and the running energy sum for the average
  const [max, setMax] = useState<number | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const energy = useRef({ sum: 0, n: 0, max: -Infinity });
  const [error, setError] = useState("");
  const meter = useRef<Meter | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const stop = () => {
    if (!meter.current) return;
    meter.current.stop();
    meter.current = null;
    setLevel(null);
    const e = energy.current;
    if (e.n) onSaveRef.current(round(10 * Math.log10(e.sum / e.n)), round(e.max));
  };
  // leaving the page while listening just lets go of the microphone
  useEffect(() => () => meter.current?.stop(), []);

  async function toggle() {
    if (meter.current) return stop();
    onListen();
    setError("");
    energy.current = { sum: 0, n: 0, max: -Infinity };
    setMax(null);
    setAvg(null);
    try {
      meter.current = await startMeter((v, r) => {
        const e = energy.current;
        e.sum += 10 ** (v / 10);
        e.n++;
        e.max = Math.max(e.max, v);
        setLevel(v);
        setRaw(r);
        setMax(e.max);
        setAvg(10 * Math.log10(e.sum / e.n));
      });
      setInfo((meter.current as Meter & { info: MeterInfo }).info);
    } catch {
      setError("The microphone isn't available. Allow it for Inspecta in the phone's settings.");
    }
  }
  const listening = level !== null;
  // while listening: this listen; otherwise what's saved for the stair
  const shownAvg = listening ? (avg === null ? "–" : avg.toFixed(1)) : saved.avg || "–";
  const shownMax = listening ? (max === null ? "–" : max.toFixed(1)) : saved.max || "–";
  const hasSaved = !!(saved.avg || saved.max);

  return (
    <div style={{ background: "#0a2135", border: "1px dashed #2a5a82", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <b>Sound level</b>
        <span data-testid="meter-source" style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: !listening && saved.meter ? "rgba(var(--accent-rgb), .16)" : "rgba(139,160,181,.15)", color: !listening && saved.meter ? "var(--accent)" : "var(--muted)" }}>
          {!listening && saved.meter ? "Calibrated meter" : "Indicative"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#bfd0de", fontVariantNumeric: "tabular-nums", marginRight: "auto" }}>
          {listening ? level.toFixed(1) : "–"}
          <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>dB(A)</span>
        </div>
        <MeterStat label="Average" value={shownAvg} active={editing === "noiseRefAvg"} onClick={listening ? undefined : () => onEdit("noiseRefAvg")} />
        <MeterStat label="Max" value={shownMax} active={editing === "noiseRef"} onClick={listening ? undefined : () => onEdit("noiseRef")} />
      </div>
      <div data-testid="meter-status" style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, minHeight: 15 }}>
        {listening
          ? "Listening… Stop saves the average and max to this stair."
          : saved.meter
            ? "From a calibrated meter. Tap a number to change it."
            : hasSaved
              ? "Saved to this stair. Listen again to replace, or tap a number to type a calibrated meter's."
              : "Listen with the phone, or tap Average or Max to type a calibrated meter's."}
      </div>
      {error && <div style={{ fontSize: 11.5, color: FAIL }}>{error}</div>}
      {/* diagnostics, for now: the level with no weighting, and whether the
          phone really turned its noise suppression, automatic gain and echo
          cancelling off (a quiet room reading near 0 unweighted too means
          the phone is cleaning up the sound before the app gets it) */}
      {info && (
        <div data-testid="meter-diagnostics" style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700, lineHeight: 1.4 }}>
          Unweighted {listening && raw !== null ? `${raw.toFixed(1)} dB` : "–"} · Noise suppr. {onOff(info.noiseSuppression)} · Auto gain {onOff(info.autoGainControl)} · Echo cancel {onOff(info.echoCancellation)} · {Math.round(info.sampleRate / 100) / 10} kHz
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <MeterButton onClick={() => void toggle()} on={listening}>
          {listening ? "Stop" : "Listen"}
        </MeterButton>
        {!listening && hasSaved && (
          <MeterButton small label="Clear the saved reading" onClick={() => onSave(undefined, undefined)}>
            Clear
          </MeterButton>
        )}
      </div>
    </div>
  );
}

const round = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

// Average or Max: tap to type one from a calibrated meter (not while listening)
function MeterStat({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={`${label}, dB(A)`}
      onClick={onClick}
      disabled={!onClick}
      style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", fontWeight: 700, background: active ? "rgba(var(--accent-rgb), .12)" : "none", border: active ? "1px solid var(--accent)" : "1px solid transparent", borderRadius: 8, padding: "2px 6px" }}
    >
      {label}
      <b style={{ display: "block", fontSize: 19, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</b>
    </button>
  );
}

const onOff = (v: boolean | undefined) => (v === undefined ? "?" : v ? "ON" : "off");

function MeterButton({ children, onClick, on, small, label }: { children: ReactNode; onClick: () => void; on?: boolean; small?: boolean; label?: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{ flex: small ? "0 0 64px" : 1, padding: "8px 4px", borderRadius: 9, background: "var(--panel-2)", border: on ? "1px solid var(--accent)" : "1px solid var(--border-strong)", color: on ? "#5ff0e0" : "#bfd0de", fontSize: 11.5, fontWeight: 800, lineHeight: 1.2 }}
    >
      {children}
    </button>
  );
}
