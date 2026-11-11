import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Site, SpfEdition, SpfStair, SpfSystem, SpfType, StairTest } from "../db/types";
import { getSite, listStairTests, saveSiteSpf, saveStairTest } from "../db/db";
import { defaultSystem, doorsEach, EDITIONS, joinLevel, LEVEL_TYPES, levelChanges, levelName, levelsEdited, levelsRead, levelType, newStair, fanIsDefault, renameDoorLevels, splitLevel, stairLabel, stairDoors, stairRange, TYPES, typeFor, type LevelType } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import { AMBER, card, cardLabel, fieldInput, PageHeader, RulesBox, Seg, StairName } from "../components/StairUi";
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
// bottom. Kept as it's changed. Every level has one door unless Doors on
// each level says more (the Stair general system testing canvas, board 2).

type Which = "hi" | "lo";
const label = (w: Which) => (w === "hi" ? "Highest level" : "Lowest level");
const field = (w: Which): "to" | "from" => (w === "hi" ? "to" : "from");
const ready = (st: SpfStair) => !!(st.from.trim() && st.to.trim());
// the fan name before its number is typed
const bareFan = (fan: string) => !fan.trim() || fan.trim().toUpperCase() === "SPF-";
// a stair nothing was entered for (dropped on save)
const blank = (st: SpfStair) => !st.name.trim() && !st.from.trim() && !st.to.trim() && bareFan(st.fan) && !st.extra.length;

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
  // a stair with readings, asked about before it's removed
  const [removing, setRemoving] = useState<string | null>(null);
  // the site's stair tests: a renamed level takes its readings with it, and
  // a level with readings is asked about before it's removed
  const [tests, setTests] = useState<StairTest[]>([]);
  // the stairs already asked about changing their range, this visit
  const asked = useRef(new Set<string>());
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<SpfSystem | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const focusName = useRef<string | null>(null);
  // back from reviewing a stair's levels: on to its fan name, if it has none
  const focusFan = useRef<string | null>(null);

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

  useEffect(() => {
    if (siteId) void listStairTests(siteId).then(setTests);
  }, [siteId]);

  const back = params.get("back") || `/site/${siteId}/findings?tab=flow`;
  const save = async () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    // a stair added and left completely empty isn't kept
    // a fan name with no number isn't one
    if (latest.current && siteId)
      await saveSiteSpf(siteId, { ...latest.current, stairs: latest.current.stairs.filter((st) => !blank(st)).map((st) => (bareFan(st.fan) ? { ...st, fan: "" } : st)) });
  };
  // written before leaving, so the next screen reads it
  const leave = () => void save().then(() => navigate(back, { replace: true }));
  useBackHandler(() => {
    if (removing) setRemoving(null);
    else if (guard) setGuard(null);
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

  useEffect(() => {
    if (!focusFan.current) return;
    const input = document.querySelector<HTMLInputElement>(`[data-stair="${focusFan.current}"] input[aria-label="Fan name"]`);
    input?.scrollIntoView({ block: "center" });
    input?.focus();
    focusFan.current = null;
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
  // changing a stair's range rebuilds its levels: asked first when the levels
  // were edited or the stair has readings (once per stair, per visit)
  const hasRead = (st: SpfStair) => levelsRead(tests, st.id).size > 0;
  const removeStair = (id: string) => {
    change({ ...sys, stairs: sys.stairs.filter((s) => s.id !== id) });
    setOpen(null);
    setPad(null);
    setRemoving(null);
  };
  const rangeEdit = (st: SpfStair, then: () => void) => (!asked.current.has(st.id) && (levelsEdited(st) || hasRead(st)) ? setGuard({ id: st.id, go: then }) : then());
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
  const doors = sys.stairs.reduce((n, s) => n + (ready(s) ? stairDoors(s).length : 0), 0);
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
  // names can come later: an unnamed stair goes by its placeholders (SPF-2, Stair 2)
  const canSave = hasStairs;
  const guardStair = sys.stairs.find((s) => s.id === guard?.id) ?? newStair();
  const guardEdited = levelsEdited(guardStair);
  const reviewing = review ? sys.stairs.find((s) => s.id === review) : undefined;
  if (reviewing)
    return (
      <LevelReview
        stair={reviewing}
        n={sys.stairs.indexOf(reviewing) + 1}
        read={levelsRead(tests, reviewing.id)}
        onChange={(levels) => setStair(reviewing.id, { levels })}
        onRename={(names) => {
          // doors added at a level, and every test's readings there, follow the new name
          const st = (latest.current ?? sys).stairs.find((s) => s.id === reviewing.id);
          if (st?.more) setStair(reviewing.id, { more: Object.fromEntries(Object.entries(st.more).map(([level, v]) => [names[level] ?? level, v])) });
          setTests((all) =>
            all.map((t) => {
              const next = renameDoorLevels(t, reviewing.id, names);
              if (next) void saveStairTest(next);
              return next ?? t;
            }),
          );
        }}
        onBack={() => setReview(null)}
        onDone={() => {
          setStair(reviewing.id, { reviewed: true });
          setReview(null);
          // the levels were the last step only if the fan's named already;
          // otherwise the stair stays open, on its fan name
          if (fanIsDefault(reviewing)) focusFan.current = reviewing.id;
          else setOpen(null);
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
                  onRemove={() => (hasRead(st) ? setRemoving(st.id) : removeStair(st.id))}
                />
              ) : (
                <button
                  key={st.id}
                  data-stair={st.id}
                  onClick={() => {
                    setOpen(st.id);
                    setPad(null);
                    setMenu(null);
                  }}
                  style={summaryRow}
                >
                  <span style={numBadge}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 800 }}>
                    <StairName stair={st} i={i} />
                    {levelsEdited(st) && <span className="lr-tag" style={{ marginLeft: 6 }}>levels edited</span>}
                    <small style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>
                      {stairRange(st)} · {stairDoors(st).length} doors
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
            disabled={!canSave}
            className={canSave ? "glow-sweep" : undefined}
            style={{ position: "relative", overflow: "hidden", width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: canSave ? "var(--accent)" : "var(--panel-2)", color: canSave ? "var(--accent-text)" : "var(--muted)", fontSize: 16, fontWeight: 800 }}
          >
            {!hasStairs ? "Add a stair to continue" : "Save and continue ›"}
          </button>
        </div>
      )}

      {removing && (
        <>
          <div className="lr-dim" onClick={() => setRemoving(null)} />
          <div className="lr-dlg" role="dialog" aria-label="Remove this stair?">
            <h3>Remove {stairLabel(sys.stairs.find((s) => s.id === removing) ?? newStair(), Math.max(0, sys.stairs.findIndex((s) => s.id === removing)))}?</h3>
            <p>It has readings in a stair test. They stay saved, but won't show on the test or its report.</p>
            <div className="bb">
              <button onClick={() => setRemoving(null)}>Keep it</button>
              <button className="warn" onClick={() => removeStair(removing)}>
                Remove
              </button>
            </div>
          </div>
        </>
      )}

      {guard && (
        <>
          <div className="lr-dim" onClick={() => setGuard(null)} />
          <div className="lr-dlg" role="dialog" aria-label={guardEdited ? "Replace the edited levels?" : "Change the range?"}>
            <h3>{guardEdited ? "Replace the edited levels?" : "Change the range?"}</h3>
            {guardEdited && <p>{levelChanges(guardStair).join(", ")}</p>}
            {hasRead(guardStair) && <p>This stair has readings. Any at a level outside the new range stay saved, but won't show on the test or its report.</p>}
            <div className="bb">
              <button onClick={() => setGuard(null)}>{guardEdited ? "Keep my edits" : "Cancel"}</button>
              <button
                className="warn"
                onClick={() => {
                  asked.current.add(guard.id);
                  if (guardEdited) setStair(guard.id, { levels: undefined, reviewed: false });
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
                  <StairName stair={padStair} i={sys.stairs.indexOf(padStair)} />
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
  const count = ready(stair) ? stairDoors(stair).length : 0;
  const each = doorsEach(stair);
  const added = Object.entries(stair.more ?? {}).filter(([, v]) => v > 0);
  const step: CSSProperties = { width: 44, height: 36, borderRadius: 8, background: "var(--panel-2)", border: "none", fontSize: 18, fontWeight: 800 };
  const edited = levelsEdited(stair);
  return (
    <div data-stair={stair.id} style={{ background: "var(--panel)", border: "1px solid var(--accent)", boxShadow: "0 0 0 3px rgba(var(--accent-rgb), .12)", borderRadius: 14, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={numBadge}>{n}</span>
        <span style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          <StairName stair={stair} i={n - 1} />
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "5px 10px", whiteSpace: "nowrap", color: count ? "#5ff0e0" : "#6a8098", background: count ? "rgba(var(--accent-rgb), .1)" : "var(--panel-2)" }}>
          {count ? `${count} door${count === 1 ? "" : "s"}` : "— doors"}
        </span>
        <button onClick={onRemove} style={{ border: "none", background: "none", color: "#ff7a6a", fontSize: 12, fontWeight: 800, padding: "2px 0 2px 4px" }}>
          Remove
        </button>
        <button aria-label="Close the stair" onClick={onClose} style={{ ...editPill, padding: "4px 9px", fontSize: 13, lineHeight: 1 }}>
          ▴
        </button>
      </div>
      {/* the names first: they're what the stair goes by, and what's
          filled in later, once the fans are identified */}
      <Field label="Name">
        <input aria-label="Stair name" className="default-ph" placeholder={`Stair ${n}`} value={stair.name} onChange={(e) => onChange({ name: e.target.value })} onFocus={onText} style={inputStyle(false)} />
      </Field>
      <Field label="Fan name">
        <input
          aria-label="Fan name"
          className="default-ph"
          placeholder={`SPF-${n}`}
          value={stair.fan}
          onChange={(e) => onChange({ fan: e.target.value })}
          onBlur={() => {
            // just "SPF-": back to the placeholder
            if (/^SPF-?\s*$/i.test(stair.fan.trim())) onChange({ fan: "" });
          }}
          onFocus={(e) => {
            onText();
            // typing starts after "SPF-", for the fan's number
            if (!stair.fan.trim()) onChange({ fan: "SPF-" });
            // straight on to the number after "SPF-" (not if the text was selected)
            const el = e.currentTarget;
            window.setTimeout(() => el.selectionStart === el.selectionEnd && el.setSelectionRange(el.value.length, el.value.length), 0);
          }}
          style={inputStyle(false)}
        />
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px 5px 11px", borderRadius: 10, background: "#0a2135", border: "1px solid var(--border-strong)" }}>
        <span style={{ flexGrow: 1, fontSize: 13, fontWeight: 800 }}>Doors on each level</span>
        <button aria-label="One door fewer" disabled={each <= 1} onClick={() => onChange({ doors: each - 1 })} style={{ ...step, color: each <= 1 ? "#3f5a74" : "var(--text)" }}>
          −
        </button>
        <b data-testid="doors-each" style={{ minWidth: 18, textAlign: "center", fontSize: 15 }}>
          {each}
        </b>
        <button aria-label="Add a door" disabled={each >= 9} onClick={() => onChange({ doors: each + 1 })} style={{ ...step, color: "#5ff0e0" }}>
          +
        </button>
      </div>
      {added.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 2px", fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>
          <span style={{ flexGrow: 1 }}>Added while testing: {added.map(([level, v]) => `${level} +${v}`).join(", ")}</span>
          <button onClick={() => onChange({ more: undefined })} style={{ padding: "2px 4px", border: "none", background: "none", color: "var(--muted)", fontSize: 11.5, fontWeight: 800, textDecoration: "underline" }}>
            Remove
          </button>
        </div>
      )}
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
const numBadge: CSSProperties = { width: 26, height: 26, borderRadius: "50%", background: "rgba(var(--accent-rgb), .16)", color: "#5ff0e0", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const addButton: CSSProperties = { border: "1.5px dashed rgba(var(--accent-rgb), .6)", borderRadius: 12, padding: 12, background: "rgba(var(--accent-rgb), .05)", color: "#5ff0e0", fontWeight: 800, fontSize: 14 };
const addHot: CSSProperties = { ...addButton, background: "rgba(var(--accent-rgb), .14)", border: "1.5px solid rgba(var(--accent-rgb), .6)", fontSize: 15, padding: 15, boxShadow: "0 0 0 3px rgba(var(--accent-rgb), .12)" };
const summaryRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 12px", color: "var(--text)" };
const editPill: CSSProperties = { flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "rgba(var(--accent-rgb), .14)", color: "#5ff0e0", border: "1px solid rgba(var(--accent-rgb), .4)" };
const inputStyle = (focus: boolean): CSSProperties => ({
  height: 40,
  boxSizing: "border-box",
  minWidth: 0,
  background: "#0a2135",
  border: `1px solid ${focus ? "var(--accent)" : "var(--border-strong)"}`,
  boxShadow: focus ? "0 0 0 2px rgba(var(--accent-rgb), .18)" : "none",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text)",
  outline: "none",
});
