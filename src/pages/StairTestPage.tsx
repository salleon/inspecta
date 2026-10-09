import { useState, type CSSProperties } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { StairSection } from "../db/types";
import { ALL_SECTIONS, doorStats, KIND_LABEL, onceStatus, SECTION, stairLevels } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import { card, cardLabel, fieldInput, PageHeader, Pill, useStairTest } from "../components/StairUi";

// A stair test (design canvas StairTestSimple, "2 · The sections"; tidied on
// SpfTidy): a tab per stair (scrolls sideways for any number), then only the
// sections this test has, each with its progress and fails. The rest are
// under Additional tests; every one is optional, and anything not tested is
// left blank on the report.

const ICON: Record<StairSection, string> = { vel: "≋", force: "⇥", latch: "⊡", noise: "◖", rest: "↻", pa: "▣", fan: "✻", quick: "✓" };
const formatDay = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export default function StairTestPage() {
  const { siteId, testId } = useParams<{ siteId: string; testId: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { site, test, setTest, flush } = useStairTest(siteId, testId);
  const [notesOpen, setNotesOpen] = useState(false);

  const back = () => {
    flush();
    navigate(`/site/${siteId}/findings?tab=flow`);
  };
  useBackHandler(() => {
    if (notesOpen) {
      setNotesOpen(false);
      return true;
    }
    return false;
  });

  if (!site || !test) return <div style={{ height: "100%" }} />;
  const sys = site.spf;
  const stairs = sys?.stairs ?? [];
  const stair = stairs.find((s) => s.id === params.get("stair")) ?? stairs[0];
  const editSystem = () => navigate(`/site/${siteId}/spf-system?back=${encodeURIComponent(`/site/${siteId}/spf/${testId}`)}`);
  const missing = ALL_SECTIONS.filter((s) => s !== "quick" && !test.sections.includes(s));

  const sectionCard = (s: StairSection) => {
    const info = SECTION[s];
    let sub = "";
    let right: string;
    let colour: string;
    let pct: number;
    if (!sys || !stair) return null;
    if (info.every) {
      const x = doorStats(test, stair, s as "vel" | "force" | "latch", sys);
      sub = `${x.done} of ${x.total}`;
      right = x.fails ? `${x.fails} fail${x.fails === 1 ? "" : "s"}` : x.done ? (x.done === x.total ? "All pass" : "OK so far") : "—";
      colour = x.fails ? "#ff7a6a" : x.done ? "#2bd47a" : "#5f7890";
      pct = x.total ? Math.round((100 * x.done) / x.total) : 0;
    } else {
      const o = onceStatus(s, test.once[stair.id], sys);
      right = o.text || "—";
      colour = o.fail ? "#ff7a6a" : o.text ? "#2bd47a" : "#5f7890";
      pct = o.done ? 100 : o.text ? 50 : 0;
    }
    return (
      <button
        key={s}
        onClick={() => {
          flush();
          navigate(`/site/${siteId}/spf/${testId}/${s}?stair=${stair.id}`);
        }}
        style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 13, background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        <span style={{ width: 34, height: 34, borderRadius: 10, background: pct === 100 ? "rgba(43,212,122,.16)" : "#143452", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{ICON[s]}</span>
        <span style={{ flexGrow: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{info.name}</span>
          {sub && <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>{sub}</span>}
          {info.every && (
            <span style={{ display: "block", height: 4, borderRadius: 2, background: "#143452", marginTop: 5, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: colour, whiteSpace: "nowrap" }}>{right}</span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title="Stair pressurisation" sub={`${site.name} · ${formatDay(test.testedAt)}`} onBack={back} right={<Pill>{KIND_LABEL[test.kind]}</Pill>} />
      {!stairs.length ? (
        <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
          Set up the system first: the edition, the stairs and their levels.
          <div style={{ marginTop: 14 }}>
            <Pill onClick={editSystem}>Set up the system</Pill>
          </div>
        </div>
      ) : (
        <>
          {/* a tab per stair, sideways for any number of them */}
          <div style={{ flexShrink: 0, display: "flex", gap: 5, overflowX: "auto", padding: "4px 14px 2px", scrollbarWidth: "none" }}>
            {stairs.map((s, i) => {
              const on = s.id === stair.id;
              const every = test.sections.find((x) => SECTION[x].every) as "vel" | "force" | "latch" | undefined;
              const done = every && sys ? doorStats(test, s, every, sys).done : 0;
              return (
                <button
                  key={s.id}
                  onClick={() => setParams({ stair: s.id }, { replace: true })}
                  style={{ flex: "0 0 auto", textAlign: "left", fontSize: 12, fontWeight: 800, padding: "7px 11px", borderRadius: 9, lineHeight: 1.25, background: on ? "rgba(46,196,182,.14)" : "var(--panel-2)", border: on ? "1px solid var(--accent)" : "1px solid var(--border-strong)", color: on ? "#5ff0e0" : "var(--muted)" }}
                >
                  {s.name.trim() || `Stair ${i + 1}`}
                  <small style={{ display: "block", fontSize: 10.5, fontWeight: 700 }}>{every ? `${done} of ${stairLevels(s).length}` : `${stairLevels(s).length} doors`}</small>
                </button>
              );
            })}
            <button aria-label="Add a stair" onClick={editSystem} style={{ flex: "0 0 auto", padding: "0 14px", borderRadius: 9, background: "var(--panel-2)", border: "1px solid var(--border-strong)", color: "#5ff0e0", fontSize: 18 }}>
              +
            </button>
          </div>

          <div style={{ flexGrow: 1, overflowY: "auto", padding: "8px 14px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
            {test.sections.map(sectionCard)}
            {missing.length > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: "#bfd0de", marginTop: 4 }}>Additional tests</div>}
            {missing.map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 13, border: "1px dashed var(--border-strong)" }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(46,196,182,.1)", color: "#5ff0e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>+</span>
                <span style={{ flexGrow: 1, fontSize: 14, fontWeight: 800, color: "#bfd0de" }}>{SECTION[s].name}</span>
                <Pill onClick={() => setTest((t) => ({ ...t, sections: ALL_SECTIONS.filter((x) => t.sections.includes(x) || x === s) }))}>+ Add</Pill>
              </div>
            ))}
            <button
              onClick={() => setNotesOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 13, background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", marginTop: 4 }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "#143452", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✎</span>
              <span style={{ flexGrow: 1 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>Notes</span>
                {test.notes.length > 0 && (
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>
                    {test.notes.length} note{test.notes.length === 1 ? "" : "s"}
                  </span>
                )}
              </span>
              <span style={{ color: "var(--muted-2)", fontSize: 18 }}>›</span>
            </button>
          </div>
          <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + env(safe-area-inset-bottom))" }}>
            <button
              onClick={() => {
                flush();
                navigate(`/site/${siteId}/spf/${testId}/report`);
              }}
              style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800 }}
            >
              Preview the report
            </button>
          </div>
        </>
      )}

      {notesOpen && (
        <div className="sheet-backdrop" onClick={() => setNotesOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end", zIndex: 5 }}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "80%", overflowY: "auto", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "20px 18px calc(24px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Notes</div>
            {test.notes.map((n, i) => (
              <div key={i} style={{ ...card, background: "var(--panel-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...cardLabel, color: "#5ff0e0" }}>{i + 1}</span>
                  <input
                    aria-label={`Note ${i + 1} location`}
                    placeholder="Where (e.g. L.16)"
                    value={n.location}
                    onChange={(e) => setTest((t) => ({ ...t, notes: t.notes.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)) }))}
                    style={{ ...fieldInput, flex: 1, padding: "7px 9px", fontSize: 13 }}
                  />
                  <button aria-label={`Delete note ${i + 1}`} onClick={() => setTest((t) => ({ ...t, notes: t.notes.filter((_, j) => j !== i) }))} style={{ border: "none", background: "none", color: "var(--muted-2)", fontSize: 15 }}>
                    ✕
                  </button>
                </div>
                <textarea
                  aria-label={`Note ${i + 1}`}
                  placeholder="The note"
                  rows={2}
                  value={n.text}
                  onChange={(e) => setTest((t) => ({ ...t, notes: t.notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))}
                  style={{ ...fieldInput, fontWeight: 600, fontSize: 13, resize: "vertical", fontFamily: "inherit" } as CSSProperties}
                />
              </div>
            ))}
            <button onClick={() => setTest((t) => ({ ...t, notes: [...t.notes, { location: "", text: "" }] }))} style={{ alignSelf: "flex-start", border: "none", background: "none", color: "var(--accent)", fontSize: 13, fontWeight: 800 }}>
              + Add a note
            </button>
            <button onClick={() => setNotesOpen(false)} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 15, fontWeight: 800 }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
