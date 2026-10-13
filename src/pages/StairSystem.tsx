import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Site, SpfEdition, SpfStair, SpfSystem, SpfType } from "../db/types";
import { getSite, saveSiteSpf } from "../db/db";
import { defaultSystem, EDITIONS, joinLevel, LEVEL_TYPES, levelChanges, levelName, levelsEdited, levelType, newStair, splitLevel, stairLevels, stairRange, TYPES, typeFor, type LevelType } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import { AMBER, card, cardLabel, fieldInput, PageHeader, RulesBox, Seg } from "../components/StairUi";
import NumPad, { k, numberKeys, PadTag } from "../components/NumPad";
import SiteKindIcon from "../components/SiteKindIcon";
import LevelReview, { typeButton } from "./LevelReview";
import "./LevelReview.css";

// The stair pressurisation system, set once for the site (design canvas
// SpfTidy and SpfStairPad, option A): the edition it was built to and its
// type (the amber requirements: doors open and pass limits follow), then the
// stairs, added one at a time. The stair being worked on is an open card;
// the others fold to one line with Edit. Levels are a type (Level, Basement,
// Ground…) and a number typed on the purple pad. Once the range is set,
// Review level layout opens (LevelReview) to check and change the suggested
// levels; Looks right ✓ folds the stair away. Save and continue at the
// bottom. Kept as it's changed.

type Which = "hi" | "lo";
const label = (w: Which) => (w === "hi" ? "Highest level" : "Lowest level");
const field = (w: Which): "to" | "from" => (w === "hi" ? "to" : "from");
const ready = (st: SpfStair) => !!(st.from.trim() && st.to.trim());
// the fan name before its number is typed
const bareFan = (fan: string) => !fan.trim() || fan.trim().toUpperCase() === "SPF-";

export default function StairSystem() {
  const { siteId } = useParams<{ siteId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [sys, setSys] = useState<SpfSystem | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [pad, setPad] = useState<{ id: string; which: Which } | null>(null);
  const [menu, setMenu] = useState<{ id: string; which: Which } | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [guard, setGuard] = useState<{ id: string; go: () => void } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<SpfSystem | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const focusName = useRef<string | null>(null);

  useEffect(() => {
    if (!siteId) return;
    void getSite(siteId).then((s) => {
      if (!s) return;
      setSite(s);
      const saved = s.spf ?? defaultSystem();
      // a type the edition no longer offers (e.g. the old 2015 "Car park") → its first
      const next = { ...saved, type: typeFor(saved.edition, saved.type) };
      setSys(next);
      latest.current = next;
    });
  }, [siteId]);

  const back = params.get("back") || `/site/${siteId}/findings?tab=flow`;
  const save = async () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    // a stair added and left completely empty isn't kept
    const blank = (st: SpfStair) => !st.name.trim() && !st.from.trim() && !st.to.trim() && bareFan(st.fan) && !st.extra.length;
    // a fan name with no number isn't one
    if (latest.current && siteId)
      await saveSiteSpf(siteId, { ...latest.current, stairs: latest.current.stairs.filter((st) => !blank(st)).map((st) => (bareFan(st.fan) ? { ...st, fan: "" } : st)) });
  };
  // written before leaving, so the next screen reads it
  const leave = () => void save().then(() => navigate(back, { replace: true }));
  useBackHandler(() => {
    if (guard) setGuard(null);
    else if (menu) setMenu(null);
    else if (pad) setPad(null);
    else leave();
    return true;
  });
  useEffect(
    () => () => {
      void save();
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // the stair being typed in sits just above the pad
  useLayoutEffect(() => {
    if (!pad || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>(`[data-stair="${pad.id}"]`);
    const padEl = document.querySelector<HTMLElement>(".np");
    if (!el) return;
    const box = scroller.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const bottom = box.bottom - (padEl?.offsetHeight ?? 330) - 10;
    if (r.bottom > bottom) scroller.current.scrollTop += Math.min(r.bottom - bottom, r.top - box.top - 6);
    else if (r.top < box.top) scroller.current.scrollTop += r.top - box.top - 6;
  }, [pad]);

  useEffect(() => {
    if (!focusName.current) return;
    document.querySelector<HTMLInputElement>(`[data-stair="${focusName.current}"] input[aria-label="Stair name"]`)?.focus();
    focusName.current = null;
  });

  function change(next: SpfSystem) {
    setSys(next);
    latest.current = next;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), 300);
  }

  if (!sys) return <div style={{ height: "100%" }} />;
  // from the latest, so changes one after another all count
  const setStair = (id: string, patch: Partial<SpfStair>) => {
    const base = latest.current ?? sys;
    change({ ...base, stairs: base.stairs.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  };
  // a new range makes a new suggestion: asked first if the levels were edited
  const rangeEdit = (st: SpfStair, then: () => void) => (levelsEdited(st) ? setGuard({ id: st.id, go: then }) : then());
  // the pad or the type list closed: a stair with its range set and not yet reviewed goes to its review
  const toReview = (id: string) => {
    const st = (latest.current ?? sys).stairs.find((s) => s.id === id);
    if (st && ready(st) && !st.reviewed) setReview(id);
  };
  const addStair = () => {
    const s = newStair();
    change({ ...sys, stairs: [...sys.stairs, s] });
    setOpen(s.id);
    setPad(null);
    focusName.current = s.id;
  };
  const doors = sys.stairs.reduce((n, s) => n + (ready(s) ? stairLevels(s).length : 0), 0);
  const padStair = pad ? sys.stairs.find((s) => s.id === pad.id) : undefined;

  function padKey(key: string) {
    if (!pad || !padStair) return;
    const f = field(pad.which);
    const { type, num } = splitLevel(padStair[f]);
    const close = () => {
      setPad(null);
      toReview(pad.id);
    };
    if (key === "done") return close();
    if (key === "prev") return setPad({ ...pad, which: "hi" });
    if (key === "next") {
      if (pad.which === "hi" && levelType(splitLevel(padStair.from).type).numbered) return setPad({ ...pad, which: "lo" });
      close();
      if (padStair.reviewed) document.querySelector<HTMLInputElement>(`[data-stair="${pad.id}"] input[aria-label="Fan name"]`)?.focus();
      return;
    }
    if (!levelType(type).numbered) return;
    const next = key === "bs" ? num.slice(0, -1) : num.length >= 3 ? num : num + key;
    setStair(pad.id, { [f]: joinLevel(type, next), levels: undefined, reviewed: false });
  }

  const hasStairs = sys.stairs.length > 0;
  const reviewing = review ? sys.stairs.find((s) => s.id === review) : undefined;
  if (reviewing)
    return (
      <LevelReview
        stair={reviewing}
        n={sys.stairs.indexOf(reviewing) + 1}
        onChange={(levels) => setStair(reviewing.id, { levels })}
        onBack={() => setReview(null)}
        onDone={() => {
          setStair(reviewing.id, { reviewed: true });
          setReview(null);
          setOpen(null);
        }}
      />
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title="The system" sub={site?.name ?? ""} onBack={leave} />
      <div ref={scroller} onClick={() => menu && setMenu(null)} style={{ flexGrow: 1, overflowY: "auto", padding: `4px 14px ${pad ? 360 : 20}px`, display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={card}>
          <div style={cardLabel}>Built to</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={rowLabel}>AS 1668.1</span>
            <Seg<SpfEdition> label="AS 1668.1 edition" options={EDITIONS} value={sys.edition} onChange={(edition) => change({ ...sys, edition, type: typeFor(edition, sys.type) })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={rowLabel}>System type</span>
            <Seg<SpfType> label="System type" options={TYPES[sys.edition]} value={sys.type} onChange={(type) => change({ ...sys, type })} />
          </div>
          {!hasStairs || rules ? (
            <div onClick={() => hasStairs && setRules(false)}>
              <RulesBox sys={sys} />
            </div>
          ) : (
            <button onClick={() => setRules(true)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: `${AMBER}.07)`, border: `1px solid ${AMBER}.45)`, borderRadius: 11, padding: "7px 9px", textAlign: "left" }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", color: "#f7b977" }}>
                Requirements · <span style={{ color: "#ffd9a8" }}>AS 1668.1-{sys.edition}{sys.type === "One test" ? "" : ` · ${sys.type}`}</span>
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "#f7b977" }}>Show ▾</span>
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, fontWeight: 800, color: "#bfd0de", marginTop: 4 }}>
          Stairs
          {hasStairs && (
            <small style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>
              {sys.stairs.length} stair{sys.stairs.length === 1 ? "" : "s"} · {doors} door{doors === 1 ? "" : "s"}
            </small>
          )}
        </div>
        {!hasStairs ? (
          <div style={{ border: "1.5px dashed #2a5a82", borderRadius: 14, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <SiteKindIcon kind="spf" size={34} />
            <div style={{ fontSize: 14, fontWeight: 800, color: "#bfd0de" }}>No stairs yet</div>
            <button onClick={addStair} style={{ ...addButton, alignSelf: "stretch" }}>
              + Add a stair
            </button>
          </div>
        ) : (
          <>
            {sys.stairs.map((st, i) =>
              open === st.id ? (
                <StairCard
                  key={st.id}
                  stair={st}
                  n={i + 1}
                  pad={pad?.id === st.id ? pad.which : null}
                  menu={menu?.id === st.id ? menu.which : null}
                  onChange={(patch) => setStair(st.id, patch)}
                  onPad={(which) =>
                    rangeEdit(st, () => {
                      setMenu(null);
                      setPad({ id: st.id, which });
                    })
                  }
                  onMenu={(which) => (menu?.id === st.id && menu.which === which ? setMenu(null) : rangeEdit(st, () => (setPad(null), setMenu({ id: st.id, which }))))}
                  onType={(which, type) => {
                    const f = field(which);
                    const { num } = splitLevel(st[f]);
                    setStair(st.id, { [f]: joinLevel(type, levelType(type).numbered ? num : ""), levels: undefined, reviewed: false });
                    setMenu(null);
                    if (levelType(type).numbered) setPad({ id: st.id, which });
                    else {
                      setPad(null);
                      toReview(st.id);
                    }
                  }}
                  onReview={() => (setPad(null), setMenu(null), setReview(st.id))}
                  onClose={() => (setOpen(null), setPad(null), setMenu(null))}
                  onText={() => (setPad(null), setMenu(null))}
                  onRemove={() => {
                    change({ ...sys, stairs: sys.stairs.filter((s) => s.id !== st.id) });
                    setOpen(null);
                    setPad(null);
                  }}
                />
              ) : (
                <button
                  key={st.id}
                  data-stair={st.id}
                  onClick={() => {
                    if (!st.fan.trim()) setStair(st.id, { fan: "SPF-" });
                    setOpen(st.id);
                    setPad(null);
                    setMenu(null);
                  }}
                  style={summaryRow}
                >
                  <span style={numBadge}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 800 }}>
                    {st.name.trim() || `Stair ${i + 1}`}
                    {levelsEdited(st) && <span className="lr-tag" style={{ marginLeft: 6 }}>levels edited</span>}
                    <small style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                      {stairRange(st)} · {stairLevels(st).length} doors{bareFan(st.fan) ? "" : ` · Fan ${st.fan.trim()}`}
                    </small>
                  </span>
                  <span style={editPill}>Edit</span>
                </button>
              ),
            )}
            <button onClick={addStair} className={open === null ? "pulse-teal" : undefined} style={open === null ? addHot : addButton}>
              + Add another stair
            </button>
          </>
        )}

        <div style={{ fontSize: 13, fontWeight: 800, color: "#bfd0de", marginTop: 4 }}>Site notes</div>
        <Notes value={sys.notes} onChange={(notes) => change({ ...sys, notes })} />
      </div>

      {!pad && (
        <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + env(safe-area-inset-bottom))" }}>
          <button
            onClick={leave}
            disabled={!hasStairs}
            className={hasStairs ? "glow-sweep" : undefined}
            style={{ position: "relative", overflow: "hidden", width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: hasStairs ? "var(--accent)" : "#143452", color: hasStairs ? "var(--accent-text)" : "var(--muted)", fontSize: 16, fontWeight: 800 }}
          >
            {hasStairs ? "Save and continue ›" : "Add a stair to continue"}
          </button>
        </div>
      )}

      {guard && (
        <>
          <div className="lr-dim" onClick={() => setGuard(null)} />
          <div className="lr-dlg" role="dialog" aria-label="Replace the edited levels?">
            <h3>Replace the edited levels?</h3>
            <p>{levelChanges(sys.stairs.find((s) => s.id === guard.id) ?? newStair()).join(", ")}</p>
            <div className="bb">
              <button onClick={() => setGuard(null)}>Keep my edits</button>
              <button
                className="warn"
                onClick={() => {
                  setStair(guard.id, { levels: undefined, reviewed: false });
                  setGuard(null);
                  guard.go();
                }}
              >
                Change the range
              </button>
            </div>
          </div>
        </>
      )}

      {pad && padStair && (
        <NumPad
          tint="spf"
          testId="level-pad"
          head={
            <>
              <div style={{ minWidth: 0, whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  <PadTag />
                  {label(pad.which)}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                  Stair {sys.stairs.indexOf(padStair) + 1}
                  {padStair.name.trim() ? ` · ${padStair.name.trim()}` : ""}
                  {padStair[field(pad.which)] ? ` · ${levelName(padStair[field(pad.which)])}` : ""}
                </div>
              </div>
              <div data-testid="level-value" style={{ marginLeft: "auto", fontSize: 30, fontWeight: 800 }}>
                {padStair[field(pad.which)] || <span style={{ fontSize: 13, color: "var(--muted)" }}>type</span>}
              </div>
            </>
          }
          keys={numberKeys(k("prev", "‹", "ins", "Previous field"), k("next2", "›", "ins", "Next field"), k("next", "Next ›", "fn", "Next"))}
          onKey={(key) => padKey(key === "next2" ? "next" : key)}
        />
      )}
    </div>
  );
}

function StairCard({
  stair,
  n,
  pad,
  menu,
  onChange,
  onPad,
  onMenu,
  onType,
  onRemove,
  onText,
  onReview,
  onClose,
}: {
  stair: SpfStair;
  n: number;
  pad: Which | null;
  menu: Which | null;
  onChange: (patch: Partial<SpfStair>) => void;
  onPad: (which: Which) => void;
  onMenu: (which: Which) => void;
  onType: (which: Which, type: LevelType) => void;
  onRemove: () => void;
  onText: () => void;
  onReview: () => void;
  onClose: () => void;
}) {
  const count = ready(stair) ? stairLevels(stair).length : 0;
  const edited = levelsEdited(stair);
  return (
    <div data-stair={stair.id} style={{ background: "var(--panel)", border: "1px solid var(--accent)", boxShadow: "0 0 0 3px rgba(46,196,182,.12)", borderRadius: 14, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={numBadge}>{n}</span>
        <span style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>Stair {n}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "5px 10px", whiteSpace: "nowrap", color: count ? "#5ff0e0" : "#6a8098", background: count ? "rgba(46,196,182,.1)" : "#143452" }}>
          {count ? `${count} door${count === 1 ? "" : "s"}` : "— doors"}
        </span>
        <button onClick={onRemove} style={{ border: "none", background: "none", color: "#ff7a6a", fontSize: 12, fontWeight: 800, padding: "2px 0 2px 4px" }}>
          Remove
        </button>
        <button aria-label="Close the stair" onClick={onClose} style={{ ...editPill, padding: "4px 9px", fontSize: 13, lineHeight: 1 }}>
          ▴
        </button>
      </div>
      <Field label="Name">
        <input aria-label="Stair name" value={stair.name} onChange={(e) => onChange({ name: e.target.value })} onFocus={onText} style={inputStyle(false)} />
      </Field>
      {(["hi", "lo"] as Which[]).map((w) => {
        const { type, num } = splitLevel(stair[field(w)]);
        const t = levelType(type);
        return (
          <Field key={w} label={label(w)}>
            <div style={{ display: "flex", gap: 7, position: "relative" }}>
              <button
                aria-label={`${label(w)} type`}
                onClick={(e) => {
                  e.stopPropagation();
                  onMenu(w);
                }}
                style={typeButton(menu === w)}
              >
                {t.name}
                <span style={{ color: "#b18cff", fontSize: 11 }}>▾</span>
              </button>
              {t.numbered ? (
                <button aria-label={label(w)} onClick={() => onPad(w)} style={{ ...inputStyle(pad === w), flex: 1, textAlign: "left" }}>
                  {num}
                  {pad === w && <span style={{ display: "inline-block", width: 2, height: 18, background: "#5ff0e0", marginLeft: 1, verticalAlign: -3 }} />}
                </button>
              ) : (
                <span style={{ flex: 1, height: 40, boxSizing: "border-box", border: "1px dashed var(--border-strong)", borderRadius: 10, display: "flex", alignItems: "center", padding: "0 12px", fontSize: 12.5, fontWeight: 700, color: "#5f7890" }}>no number</span>
              )}
              {menu === w && (
                <div role="listbox" aria-label={`${label(w)} type`} className="lr-menu" onClick={(e) => e.stopPropagation()} style={{ top: 44 }}>
                  {LEVEL_TYPES.map((x) => (
                    <button key={x.id || "level"} role="option" aria-selected={x.id === type} onClick={() => onType(w, x.id)}>
                      {x.name}
                      <small>{x.example}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        );
      })}
      <Field label="Fan name">
        <input
          aria-label="Fan name"
          value={stair.fan}
          onChange={(e) => onChange({ fan: e.target.value })}
          onFocus={(e) => {
            onText();
            // straight on to the number after "SPF-" (not if the text was selected)
            const el = e.currentTarget;
            window.setTimeout(() => el.selectionStart === el.selectionEnd && el.setSelectionRange(el.value.length, el.value.length), 0);
          }}
          style={inputStyle(false)}
        />
      </Field>
      {count > 0 && (
        <button className={`lr-row${stair.reviewed ? " done" : " pulse"}`} onClick={onReview}>
          <span className="ic">☰</span>
          <span className="t">
            Review level layout
            <small>
              {count} doors{edited ? " · edited" : ""}
            </small>
          </span>
          <span className="go">Review ›</span>
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", whiteSpace: "nowrap" }}>{label}</span>
      {children}
    </div>
  );
}

// site notes: grows with what's typed, and can't be dragged shut
function Notes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(64, el.scrollHeight + 2)}px`;
  }, [value]);
  return <textarea ref={ref} aria-label="Site notes" value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={{ ...fieldInput, fontWeight: 600, fontSize: 13, lineHeight: 1.45, resize: "none", overflow: "hidden", fontFamily: "inherit", minHeight: 64 }} />;
}

const rowLabel: CSSProperties = { width: 78, flexShrink: 0, fontSize: 12, fontWeight: 700, color: "var(--muted)" };
const numBadge: CSSProperties = { width: 26, height: 26, borderRadius: "50%", background: "rgba(46,196,182,.16)", color: "#5ff0e0", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const addButton: CSSProperties = { border: "1.5px dashed rgba(46,196,182,.6)", borderRadius: 12, padding: 12, background: "rgba(46,196,182,.05)", color: "#5ff0e0", fontWeight: 800, fontSize: 14 };
const addHot: CSSProperties = { ...addButton, background: "rgba(46,196,182,.14)", border: "1.5px solid rgba(46,196,182,.6)", fontSize: 15, padding: 15, boxShadow: "0 0 0 3px rgba(46,196,182,.12)" };
const summaryRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 12px", color: "var(--text)" };
const editPill: CSSProperties = { flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "rgba(46,196,182,.14)", color: "#5ff0e0", border: "1px solid rgba(46,196,182,.4)" };
const inputStyle = (focus: boolean): CSSProperties => ({
  height: 40,
  boxSizing: "border-box",
  minWidth: 0,
  background: "#0a2135",
  border: `1px solid ${focus ? "#2ec4b6" : "var(--border-strong)"}`,
  boxShadow: focus ? "0 0 0 2px rgba(46,196,182,.18)" : "none",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text)",
  outline: "none",
});
