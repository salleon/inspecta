import { useEffect, useRef, useState } from "react";
import type { SpfStair } from "../db/types";
import { isCustomLevel, joinLevel, LEVEL_TYPES, levelChip, levelName, levelType, splitLevel, stairLabel, stairLevels, suggestLevels, type LevelType } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import { PageHeader } from "../components/StairUi";
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
// ✓ finishes.

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

const list3 = (a: string[]) => (a.length <= 3 ? a.join(", ").replace(/, ([^,]*)$/, " and $1") : `${a[0]} to ${a[a.length - 1]}`);

export default function LevelReview({
  stair,
  read,
  onChange,
  onRename,
  onBack,
  onDone,
}: {
  stair: SpfStair;
  n: number;
  read?: Set<string>; // the levels with readings in a stair test
  onChange: (levels: string[] | undefined) => void;
  onRename?: (names: Record<string, string>) => void; // old name to new: their readings go with them
  onBack: () => void;
  onDone: () => void;
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
  const [swap, setSwap] = useState<{ was: string; now: string; from: "P" | "B"; to: "P" | "B" } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useBackHandler(() => {
    if (removing !== null) setRemoving(null);
    else if (swap) setSwap(null);
    else if (edit) setEdit(null);
    else if (named) setNamed(null);
    else onBack();
    return true;
  });
  useEffect(() => {
    list.current?.querySelector(".lr-lv.sel")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

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
      if (named.rename && code !== L[sel]) onRename?.({ [L[sel]]: code });
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
        if (code !== edit.was) onRename?.({ [edit.was]: code });
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
    const isOpen = open[p.key] ?? count <= OPEN_UP_TO;
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
            <button key={`${i} ${code}`} data-level={code} className={`lr-lv${on ? " sel" : suggested.includes(code) ? "" : " new"}`} onClick={() => setSel(on ? null : i)}>
              <span className="c">{levelChip(code)}</span>
              <small>{levelName(code)}</small>
              <span className="ch">{on ? "✓" : "›"}</span>
            </button>
          );
        })}
      </div>,
    ];
  });

  const c = sel === null ? "" : L[sel];
  const et = edit ? levelType(edit.type) : null;
  const ecode = edit && et ? (et.numbered ? (edit.num ? joinLevel(edit.type, edit.num) : "") : edit.type) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title="Review level layout" sub={`${stairLabel(stair)} · ${L.length} doors`} onBack={onBack} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 9, padding: "4px 14px 0" }}>
        <div ref={list} className="lr-list" data-testid="level-list">
          {rows}
        </div>
        {sel !== null && (
          <div className="lr-tools">
            <div className="lr-tl">{levelName(c)}</div>
            <div className="lr-q3" style={{ gridTemplateColumns: "2fr 1fr" }}>
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
              <button
                className="rm"
                onClick={() => {
                  // a level with readings is asked about first
                  if (read?.has(c)) return setRemoving(sel);
                  put(L.filter((_, j) => j !== sel));
                  setSel(null);
                }}
              >
                Remove
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
      <div style={{ flexShrink: 0, padding: "10px 14px calc(24px + env(safe-area-inset-bottom))" }}>
        <button onClick={onDone} style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800 }}>
          Looks right ✓
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

      {removing !== null && (
        <>
          <div className="lr-dim" onClick={() => setRemoving(null)} />
          <div className="lr-dlg" role="dialog" aria-label={`Remove ${L[removing]}?`}>
            <h3>Remove {L[removing]}?</h3>
            <p>It has readings in a stair test. They stay saved, but won't show on the test or its report.</p>
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
                  onRename?.(names);
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
