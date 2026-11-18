import { useEffect, useRef, useState } from "react";
import type { SpfStair } from "../db/types";
import SwipeRow from "../components/SwipeRow";
import { isCustomLevel, joinLevel, LEVEL_TYPES, levelChip, levelEditLabel, levelEdits, levelEditsFitLabel, levelName, levelType, splitLevel, stairLevels, suggestLevels, type LevelEdit, type LevelEditsFit, type LevelType } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import { PageHeader, StairName } from "../components/StairUi";
import NumPad, { BLANK, numberKeys, PadTag } from "../components/NumPad";
import "./LevelReview.css";

// Review level layout (design canvas SpfLevelPlay; the groups and the P / B
// pop-up from the Stair general system testing canvas, 2b and 2c): opens once
// a stair's range is set. The suggested doors top to bottom, in three
// drop-downs: Roof, Levels and Basement (car parks too). A small group starts
// open, a big one closed, so only the part being changed has to be opened.
// Tap a level to Edit it (its type from the list, its number on the purple
// pad), Remove it, or add one above or below it, or a custom name for an odd
// layout. Changing a car park to a basement (or back) offers to change the
// rest to match. Every change is kept on the stair as it's made; Looks right
// ✓ finishes. Once something's changed, a card offers the same changes on
// the other stairs (design canvas "Copy level changes to other stairs",
// revised row): Apply to all does it there and then, with Undo; Choose
// stairs… lists them to tick, each with how many of the changes fit it.

// another stair, and how the changes made here would fit it
export type CopyTarget = { id: string; name: string; fit: LevelEditsFit };

const numeric = (c: string) => /^\d+$/.test(c);

type Group = "Roof" | "Levels" | "Basement";
type Part = { group: Group; key: string; i: number; j: number };
const OPEN_UP_TO = 6;

// the list as runs of one group, top to bottom; a typed name sits with the
// level above it (at the very top, with the one below)
function parts(L: string[]): Part[] {
  const of = (c: string): Group | null => {
    if (isCustomLevel(c)) return null;
    const t = splitLevel(c).type;
    return t === "R" ? "Roof" : t === "B" || t === "P" ? "Basement" : "Levels";
  };
  const g = L.map(of);
  const first = g.find((x) => x) ?? "Levels";
  const out: Part[] = [];
  const seen: Record<string, number> = {};
  L.forEach((_, i) => {
    const group = g[i] ?? (i > 0 ? out[out.length - 1].group : first);
    const last = out[out.length - 1];
    if (last && last.group === group) last.j = i;
    else {
      seen[group] = (seen[group] ?? 0) + 1;
      out.push({ group, key: `${group} ${seen[group]}`, i, j: i });
    }
  });
  return out;
}

// "SPF 2 and SPF 3", "SPF 2, SPF 3 and 2 more"
const names3 = (a: string[]) => (a.length <= 3 ? a.join(", ").replace(/, ([^,]*)$/, " and $1") : `${a.slice(0, 2).join(", ")} and ${a.length - 2} more`);
const list3 = (a: string[]) => (a.length <= 3 ? a.join(", ").replace(/, ([^,]*)$/, " and $1") : `${a[0]} to ${a[a.length - 1]}`);

export default function LevelReview({
  stair,
  n,
  read,
  onChange,
  onRename,
  onBack,
  onDone,
  step,
  doneLabel,
  copy,
}: {
  stair: SpfStair;
  n: number;
  read?: Set<string>; // the levels with readings in a stair test
  onChange: (levels: string[] | undefined) => void;
  onRename?: (names: Record<string, string>) => void; // old name to new: their readings go with them
  onBack: () => void;
  onDone: () => void;
  step?: string; // "2 of 3", reviewing every stair in turn
  doneLabel?: string;
  // the same changes on other stairs: how they'd fit each, make them, take them back
  copy?: { targets: (edits: LevelEdit[]) => CopyTarget[]; apply: (edits: LevelEdit[], ids: string[]) => void; undo: () => void };
}) {
  const L = stairLevels(stair);
  const suggested = suggestLevels(stair);
  const edited = !!stair.levels && stair.levels.join("\n") !== suggested.join("\n");
  const [sel, setSel] = useState<number | null>(null);
  const [above, setAbove] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<{ i: number; was: string; type: LevelType; num: string; menu: boolean } | null>(null);
  const [named, setNamed] = useState<{ rename: boolean; value: string } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [openSwipe, setOpenSwipe] = useState<number | null>(null);
  const [swap, setSwap] = useState<{ was: string; now: string; from: "P" | "B"; to: "P" | "B" } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  // the levels as the review opened, and the renames since: what's changed here
  const [start] = useState(() => stairLevels(stair));
  const renames = useRef<Record<string, string>[]>([]);
  const rename = (names: Record<string, string>) => {
    renames.current.push(names);
    onRename?.(names);
  };
  // the card for these changes: put away (✕), or applied (with the stairs' names, for Undo)
  const [card, setCard] = useState<{ sig: string; applied?: string[] } | null>(null);
  const [picking, setPicking] = useState<Set<string> | null>(null);

  useBackHandler(() => {
    if (picking) setPicking(null);
    else if (removing !== null) setRemoving(null);
    else if (swap) setSwap(null);
    else if (edit) setEdit(null);
    else if (named) setNamed(null);
    else onBack();
    return true;
  });
  useEffect(() => {
    list.current?.querySelector(".lr-lv.sel")?.scrollIntoView({ block: "nearest" });
  }, [sel]);
  // a group with a picked level stays open after, even once it's grown past
  // the size that starts closed: nothing folds away under the finger
  useEffect(() => {
    if (sel === null) return;
    const p = parts(L).find((x) => sel >= x.i && sel <= x.j);
    if (p && open[p.key] === undefined) setOpen((o) => ({ ...o, [p.key]: true }));
  }, [sel, L, open]);

  // kept only when it isn't the suggestion
  const put = (next: string[]) => onChange(next.join("\n") === suggested.join("\n") ? undefined : next);
  const at = () => (above ? sel! : sel! + 1);
  const nextNum = (t: "P" | "B") => t + (Math.max(0, ...L.map(splitLevel).filter((x, j) => x.type === t && !isCustomLevel(L[j])).map((x) => Number(x.num) || 0)) + 1);

  function add(what: "level" | "P" | "B" | "G" | "M" | "R") {
    if (sel === null) return;
    const c = L[sel];
    let code: string;
    if (what === "level") {
      const s = splitLevel(c);
      code = String(Math.max(1, numeric(c) && s.type === "" ? Number(s.num) + (above ? 1 : -1) : 1));
    } else if (what === "P" || what === "B") code = nextNum(what);
    else code = what;
    const next = [...L];
    next.splice(at(), 0, code);
    put(next);
    setSel(at());
  }
  function saveName() {
    const v = named?.value.trim();
    if (named && v && sel !== null) {
      const code = v.length <= 3 ? v.toUpperCase() : v;
      const next = [...L];
      if (named.rename) next[sel] = code;
      else next.splice(at(), 0, code);
      put(next);
      if (named.rename && code !== L[sel]) rename({ [L[sel]]: code });
      if (!named.rename) setSel(at());
    }
    setNamed(null);
  }
  function editKey(key: string) {
    if (!edit) return;
    const t = levelType(edit.type);
    if (key === "done") {
      const code = t.numbered ? (edit.num ? joinLevel(edit.type, edit.num) : "") : edit.type;
      if (code) {
        const next = [...L];
        next[edit.i] = code;
        put(next);
        if (code !== edit.was) rename({ [edit.was]: code });
        // a car park made a basement (or back): the rest can follow
        const was = isCustomLevel(edit.was) ? null : splitLevel(edit.was).type;
        const now = splitLevel(code).type;
        if ((was === "P" || was === "B") && (now === "P" || now === "B") && was !== now && next.some((c) => !isCustomLevel(c) && splitLevel(c).type === was)) setSwap({ was: edit.was, now: code, from: was, to: now });
      }
      setEdit(null);
      return;
    }
    if (!t.numbered) return;
    if (key === "bs") setEdit({ ...edit, num: edit.num.slice(0, -1) });
    else if (/^\d$/.test(key) && edit.num.length < 3) setEdit({ ...edit, num: edit.num + key });
  }

  const others = swap ? L.filter((x) => !isCustomLevel(x) && splitLevel(x).type === swap.from) : [];
  const matched = (x: string) => swap!.to + splitLevel(x).num;

  const rows = parts(L).flatMap((p) => {
    const count = p.j - p.i + 1;
    // a small group starts open, and one stays open while a level in it is picked
    const isOpen = open[p.key] ?? (count <= OPEN_UP_TO || (sel !== null && sel >= p.i && sel <= p.j));
    const head = (
      <button
        key={`g${p.key}`}
        data-group={p.group}
        aria-expanded={isOpen}
        className={`lr-lv grp${isOpen ? " on" : ""}`}
        onClick={() => {
          if (isOpen && sel !== null && sel >= p.i && sel <= p.j) setSel(null);
          setOpen({ ...open, [p.key]: !isOpen });
        }}
      >
        <b>{p.group}</b>
        <small>
          {count === 1 ? levelChip(L[p.i]) : `${levelChip(L[p.i])} to ${levelChip(L[p.j])}`} · {count} level{count === 1 ? "" : "s"}
        </small>
        <span className="ch">{isOpen ? "▴" : "▾"}</span>
      </button>
    );
    if (!isOpen) return [head];
    return [
      head,
      <div key={`l${p.key}`} className="lr-in">
        {L.slice(p.i, p.j + 1).map((code, k) => {
          const i = p.i + k;
          const on = sel === i;
          return (
            // swipe a level left to remove it, asked first
            <div key={`${i} ${code}`} data-level={code}>
              <SwipeRow
                label={`Remove ${levelName(code)}`}
                action="Remove"
                swipeOpen={openSwipe === i}
                onSwipeOpen={() => setOpenSwipe(i)}
                onSwipeClose={() => setOpenSwipe((x) => (x === i ? null : x))}
                onOpen={() => setSel(on ? null : i)}
                onDelete={() => {
                  setOpenSwipe(null);
                  setRemoving(i);
                }}
                className={`lr-lv${on ? " sel" : suggested.includes(code) ? "" : " new"}`}
                chevron={false}
                radius={10}
              >
                <span className="c">{levelChip(code)}</span>
                <small>{levelName(code)}</small>
                <span className="ch">{on ? "✓" : "›"}</span>
              </SwipeRow>
            </div>
          );
        })}
      </div>,
    ];
  });

  const c = sel === null ? "" : L[sel];
  const edits = copy ? levelEdits(start, L, renames.current) : [];
  const sig = JSON.stringify(edits);
  const targets = edits.length && copy ? copy.targets(edits) : [];
  const able = targets.filter((t) => t.fit.done > 0);
  const applied = card?.sig === sig ? card.applied : undefined;
  // shown once something's changed that another stair can take, until put away
  const showCard = !!copy && sel === null && (applied ? true : able.length > 0 && card?.sig !== sig);
  const applyTo = (ids: string[]) => {
    copy?.apply(edits, ids);
    setCard({ sig, applied: targets.filter((t) => ids.includes(t.id)).map((t) => t.name) });
    setPicking(null);
  };
  const et = edit ? levelType(edit.type) : null;
  const ecode = edit && et ? (et.numbered ? (edit.num ? joinLevel(edit.type, edit.num) : "") : edit.type) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title="Review level layout" sub={
          <>
            {step ? `${step} · ` : ""}
            <StairName stair={stair} i={n - 1} /> · {L.length} doors
          </>
        } onBack={onBack} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 9, padding: "4px 14px 0" }}>
        <div ref={list} className="lr-list" data-testid="level-list">
          {rows}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", textAlign: "center" }}>Swipe a level left to remove it.</div>
        {sel !== null && (
          <div className="lr-tools">
            <div className="lr-tl">{levelName(c)}</div>
            <div className="lr-q3" style={{ gridTemplateColumns: "1fr" }}>
              <button
                className="fn"
                onClick={() => {
                  if (isCustomLevel(c)) return setNamed({ rename: true, value: c });
                  const s = splitLevel(c);
                  setEdit({ i: sel, was: c, type: s.type, num: s.num, menu: false });
                }}
              >
                Edit
              </button>
            </div>
            <div className="lr-tl">
              Add a level
              <span className="lr-seg">
                <button className={above ? "on" : ""} onClick={() => setAbove(true)}>
                  Above {levelChip(c)}
                </button>
                <button className={above ? "" : "on"} onClick={() => setAbove(false)}>
                  Below {levelChip(c)}
                </button>
              </span>
            </div>
            <div className="lr-q3">
              <button onClick={() => add("level")}>+ Level</button>
              <button onClick={() => add("P")}>+ Car park</button>
              <button onClick={() => add("G")}>+ Ground</button>
              <button onClick={() => add("M")}>+ Mezzanine</button>
              <button onClick={() => add("B")}>+ Basement</button>
              <button onClick={() => add("R")}>+ Roof</button>
              <button className="cu" onClick={() => setNamed({ rename: false, value: "" })}>
                + Custom name…
              </button>
            </div>
          </div>
        )}
      </div>
      {showCard && (
        <div data-testid="copy-card" style={{ flexShrink: 0, margin: "10px 14px 0", display: "flex", flexDirection: "column", gap: 10, padding: "11px 12px 12px", borderRadius: 13, background: applied ? "var(--panel-2)" : "rgba(var(--accent-rgb), .1)", border: applied ? "1px solid var(--border-strong)" : "1px solid rgba(var(--accent-rgb), .55)" }}>
          {applied ? (
            // the same shape as the offer, so nothing moves when it turns into Undo
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30 }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, background: "var(--accent)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 }}>✓</span>
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>Applied</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>To {names3(applied)}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  copy?.undo();
                  setCard(null);
                }}
                style={{ height: 44, borderRadius: 11, border: "1px solid rgba(var(--accent-rgb), .55)", background: "none", color: "#5ff0e0", fontSize: 13.5, fontWeight: 800 }}
              >
                Undo
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5ff0e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                </svg>
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>Same changes on other stairs?</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>
                    {edits.length} change{edits.length === 1 ? "" : "s"} · {able.length} other stair{able.length === 1 ? "" : "s"}
                  </div>
                </div>
                <button aria-label="Not now" onClick={() => setCard({ sig })} style={{ width: 36, height: 36, margin: "-6px -6px -6px 0", border: "none", background: "none", color: "var(--muted)", fontSize: 16 }}>
                  ✕
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <button onClick={() => applyTo(able.map((t) => t.id))} style={{ height: 44, borderRadius: 11, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 13.5, fontWeight: 800 }}>
                  Apply to all {able.length}
                </button>
                <button onClick={() => setPicking(new Set())} style={{ height: 44, borderRadius: 11, border: "1px solid rgba(var(--accent-rgb), .55)", background: "none", color: "#5ff0e0", fontSize: 13.5, fontWeight: 800 }}>
                  Choose stairs…
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <div style={{ flexShrink: 0, padding: "10px 14px calc(24px + var(--sa-bottom))" }}>
        <button onClick={onDone} style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800 }}>
          {doneLabel ?? "Looks right ✓"}
          {edited && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
                setSel(null);
                setOpen({});
              }}
              style={{ fontWeight: 700, fontSize: 12.5, textDecoration: "underline", marginLeft: 6 }}
            >
              · Reset
            </span>
          )}
        </button>
      </div>

      {picking && (
        <>
          <div className="lr-dim" onClick={() => setPicking(null)} />
          <div className="lr-dlg" role="dialog" aria-label="Choose stairs" style={{ top: 70, maxHeight: "calc(100% - 100px)", overflowY: "auto" }}>
            <h3>Choose stairs</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, background: "#0a2135", border: "1px solid var(--border-strong)" }}>
              {edits.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, fontWeight: 700, color: "#dbe6ef" }}>
                  <i style={{ fontStyle: "normal", color: "#5ff0e0", fontWeight: 800, width: 14 }}>{e.kind === "add" ? "+" : e.kind === "remove" ? "−" : "↔"}</i>
                  <span>{levelEditLabel(e)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                {picking.size} of {able.length} ticked
              </span>
              <button onClick={() => setPicking(picking.size === able.length ? new Set() : new Set(able.map((t) => t.id)))} style={{ border: "none", background: "none", padding: "6px 2px", color: "#5ff0e0", fontSize: 12.5, fontWeight: 800 }}>
                {picking.size === able.length ? "Untick all" : "Tick all"}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: -4 }}>
              {targets.map((t) => {
                const on = picking.has(t.id);
                const can = t.fit.done > 0;
                const part = can && t.fit.fits < t.fit.total;
                return (
                  <button
                    key={t.id}
                    role="checkbox"
                    aria-checked={on}
                    disabled={!can}
                    onClick={() => {
                      const next = new Set(picking);
                      if (on) next.delete(t.id);
                      else next.add(t.id);
                      setPicking(next);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 11, minHeight: 48, padding: "6px 10px", borderRadius: 11, textAlign: "left", color: "var(--text)", background: on ? "rgba(var(--accent-rgb), .08)" : "var(--panel-2)", border: on ? "1px solid rgba(var(--accent-rgb), .6)" : "1px solid var(--border-strong)", opacity: can ? 1 : 0.5 }}
                  >
                    <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, ...(on ? { background: "var(--accent)", color: "var(--accent-text)" } : { border: "1.5px solid #3f6a90" }) }}>{on ? "✓" : ""}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: "block", fontSize: 13.5, fontWeight: 800 }}>{t.name}</b>
                      <small style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: part ? "#f7b977" : "var(--muted)" }}>{levelEditsFitLabel(t.fit)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="bb">
              <button onClick={() => setPicking(null)}>Cancel</button>
              <button className="go" disabled={!picking.size} style={picking.size ? undefined : { opacity: 0.45 }} onClick={() => applyTo([...picking])}>
                {picking.size ? `Apply to ${picking.size} stair${picking.size === 1 ? "" : "s"}` : "Apply"}
              </button>
            </div>
          </div>
        </>
      )}

      {removing !== null && (
        <>
          <div className="lr-dim" onClick={() => setRemoving(null)} />
          <div className="lr-dlg" role="dialog" aria-label={`Remove ${L[removing]}?`}>
            <h3>Remove {L[removing]}?</h3>
            <p>{read?.has(L[removing]) ? "It has readings in a stair test. They stay saved, but won't show on the test or its report." : "Its door comes off this stair."}</p>
            <div className="bb">
              <button onClick={() => setRemoving(null)}>Keep it</button>
              <button
                className="warn"
                onClick={() => {
                  put(L.filter((_, j) => j !== removing));
                  setSel(null);
                  setRemoving(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </>
      )}

      {swap && (
        <>
          <div className="lr-dim" onClick={() => setSwap(null)} />
          <div className="lr-dlg" role="dialog" aria-label={`${swap.was} is now ${swap.now}`}>
            <h3>
              {swap.was} is now {swap.now}
            </h3>
            <p>
              Do you want to change the other basement levels to match? {list3(others)} would become {list3(others.map(matched))}.
            </p>
            <div className="bb">
              <button onClick={() => setSwap(null)}>Just {swap.now}</button>
              <button
                className="warn"
                onClick={() => {
                  // one that would double up with a level already there is left as it is
                  const next = [...L];
                  const names: Record<string, string> = {};
                  next.forEach((x, i) => {
                    if (isCustomLevel(x) || splitLevel(x).type !== swap.from) return;
                    const to = matched(x);
                    if (!next.includes(to)) {
                      next[i] = to;
                      names[x] = to;
                    }
                  });
                  put(next);
                  rename(names);
                  setSwap(null);
                }}
              >
                Change all
              </button>
            </div>
          </div>
        </>
      )}

      {named && (
        <>
          <div className="lr-dim" onClick={() => setNamed(null)} />
          <div className="lr-dlg" role="dialog" aria-label={named.rename ? `Rename ${c}` : "Custom level"}>
            <h3>{named.rename ? `Rename ${c}` : `Custom level, ${above ? "above" : "below"} ${levelChip(c)}`}</h3>
            <input
              autoFocus
              aria-label="Level name"
              maxLength={24}
              placeholder="Level name"
              value={named.value}
              onChange={(e) => setNamed({ ...named, value: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
            />
            <div className="bb">
              <button onClick={() => setNamed(null)}>Cancel</button>
              <button className="go" onClick={saveName}>
                {named.rename ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </>
      )}

      {edit && et && (
        <>
          <div className="lr-dim" onClick={() => setEdit(null)} />
          <div style={{ position: "absolute", inset: "auto 0 0 0", zIndex: 10 }}>
            <NumPad
              tint="spf"
              testId="edit-level-pad"
              head={
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ minWidth: 0, whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>
                        <PadTag />
                        Edit level
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                        Was {edit.was} · {levelName(edit.was)}
                      </div>
                    </div>
                    <div data-testid="edit-level-value" style={{ marginLeft: "auto", fontSize: 30, fontWeight: 800 }}>
                      {ecode || <span style={{ fontSize: 13, color: "var(--muted)" }}>type</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 7, position: "relative" }}>
                    <button aria-label="Level type" onClick={() => setEdit({ ...edit, menu: !edit.menu })} style={typeButton(edit.menu)}>
                      {et.name}
                      <span style={{ color: "#b18cff", fontSize: 11 }}>▾</span>
                    </button>
                    {et.numbered ? (
                      <span style={{ ...numBox, borderColor: "var(--accent)", boxShadow: "0 0 0 2px rgba(var(--accent-rgb), .18)" }}>
                        {edit.num}
                        <span style={{ display: "inline-block", width: 2, height: 18, background: "#5ff0e0", marginLeft: 1 }} />
                      </span>
                    ) : (
                      <span style={{ ...numBox, borderStyle: "dashed", color: "#5f7890", fontSize: 12.5 }}>no number</span>
                    )}
                    {edit.menu && (
                      <div role="listbox" aria-label="Level type" className="lr-menu" style={{ bottom: 46 }}>
                        {LEVEL_TYPES.map((x) => (
                          <button key={x.id || "level"} role="option" aria-selected={x.id === edit.type} onClick={() => setEdit({ ...edit, type: x.id, num: x.id === edit.type ? edit.num : "", menu: false })}>
                            {x.name}
                            <small>{x.example}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              }
              keys={numberKeys(BLANK(1), BLANK(2), BLANK(3))}
              onKey={editKey}
            />
          </div>
        </>
      )}
    </div>
  );
}

export const typeButton = (on: boolean): React.CSSProperties => ({
  flex: "0 0 132px",
  height: 40,
  boxSizing: "border-box",
  borderRadius: 10,
  background: "rgba(177,140,255,.10)",
  border: `1px solid ${on ? "#b18cff" : "rgba(177,140,255,.40)"}`,
  color: "#e6dcff",
  fontSize: 13.5,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 10px",
});
const numBox: React.CSSProperties = { flex: 1, height: 40, boxSizing: "border-box", borderRadius: 10, background: "#0a2135", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 15, fontWeight: 700 };
