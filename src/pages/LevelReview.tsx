import { useEffect, useRef, useState } from "react";
import type { SpfStair } from "../db/types";
import { isCustomLevel, joinLevel, LEVEL_TYPES, levelChip, levelName, levelType, splitLevel, stairLevels, suggestLevels, type LevelType } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import { PageHeader } from "../components/StairUi";
import NumPad, { BLANK, numberKeys, PadTag } from "../components/NumPad";
import "./LevelReview.css";

// Review level layout (design canvas SpfLevelPlay): opens once a stair's
// range is set. The suggested doors top to bottom, runs of numbered levels
// folded to one line (tap to open, ▴ Fold to close). Tap a level to Edit it
// (its type from the list, its number on the purple pad), Remove it, or add
// one above or below it, or a custom name for an odd layout. Every change is
// kept on the stair as it's made; Looks right ✓ finishes.

type Item = { run: true; i: number; j: number; key: string } | { fold: string; i: number; j: number } | { i: number };
const numeric = (c: string) => /^\d+$/.test(c);

// numbered runs (four or more) fold to one line; a picked level splits its
// run, the parts either side staying folded; an opened run can fold back up
function items(L: string[], sel: number | null, open: Record<string, boolean>): Item[] {
  const out: Item[] = [];
  let i = 0;
  while (i < L.length) {
    let j = i;
    if (numeric(L[i]) && i > 0) while (j + 1 < L.length - 1 && numeric(L[j + 1]) && +L[j + 1] < +L[j]) j++;
    const key = `${L[i]}-${L[j]}`;
    const parts =
      sel !== null && sel >= i && sel <= j && !open[key]
        ? [
            [i, sel - 1],
            [sel, sel],
            [sel + 1, j],
          ]
        : [[i, j]];
    for (const [a, b] of parts) {
      if (b < a) continue;
      const k2 = `${L[a]}-${L[b]}`;
      if (b - a + 1 >= 4 && !open[key] && !open[k2]) out.push({ run: true, i: a, j: b, key: k2 });
      else {
        if (b - a + 1 >= 4) out.push({ fold: open[key] ? key : k2, i: a, j: b });
        for (let x = a; x <= b; x++) out.push({ i: x });
      }
    }
    i = j + 1;
  }
  return out;
}

export default function LevelReview({ stair, n, onChange, onBack, onDone }: { stair: SpfStair; n: number; onChange: (levels: string[] | undefined) => void; onBack: () => void; onDone: () => void }) {
  const L = stairLevels(stair);
  const suggested = suggestLevels(stair);
  const edited = !!stair.levels && stair.levels.join("\n") !== suggested.join("\n");
  const [sel, setSel] = useState<number | null>(null);
  const [above, setAbove] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<{ i: number; was: string; type: LevelType; num: string; menu: boolean } | null>(null);
  const [named, setNamed] = useState<{ rename: boolean; value: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useBackHandler(() => {
    if (edit) setEdit(null);
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
      }
      setEdit(null);
      return;
    }
    if (!t.numbered) return;
    if (key === "bs") setEdit({ ...edit, num: edit.num.slice(0, -1) });
    else if (/^\d$/.test(key) && edit.num.length < 3) setEdit({ ...edit, num: edit.num + key });
  }

  const rows = items(L, sel, open).map((it) => {
    if ("fold" in it)
      return (
        <button key={`f${it.fold}`} className="lr-lv run fold" onClick={() => (setOpen({}), setSel(null))}>
          <span className="c">▴</span>
          <small>
            Fold levels {L[it.i]} to {L[it.j]}
          </small>
          <span className="ch">▴</span>
        </button>
      );
    if ("run" in it) {
      const top = +L[it.i];
      const bot = +L[it.j];
      const have = L.slice(it.i, it.j + 1);
      const miss: number[] = [];
      for (let x = top; x >= bot; x--) if (!have.includes(String(x))) miss.push(x);
      return (
        <button key={`r${it.key}`} className="lr-lv run" onClick={() => setOpen({ ...open, [it.key]: true })}>
          <span className="c">
            {top}–{bot}
          </span>
          <small>
            Levels {top} to {bot}
            {miss.length ? ` · no ${miss.join(", ")}` : ""}
          </small>
          <span className="ch">▾</span>
        </button>
      );
    }
    const c = L[it.i];
    const on = sel === it.i;
    return (
      <button key={`l${it.i}`} data-level={c} className={`lr-lv${on ? " sel" : suggested.includes(c) ? "" : " new"}`} onClick={() => setSel(on ? null : it.i)}>
        <span className="c">{levelChip(c)}</span>
        <small>{levelName(c)}</small>
        <span className="ch">{on ? "✓" : "›"}</span>
      </button>
    );
  });

  const c = sel === null ? "" : L[sel];
  const et = edit ? levelType(edit.type) : null;
  const ecode = edit && et ? (et.numbered ? (edit.num ? joinLevel(edit.type, edit.num) : "") : edit.type) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title="Review level layout" sub={`Stair ${n}${stair.name.trim() ? ` · ${stair.name.trim()}` : ""} · ${L.length} doors`} onBack={onBack} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 9, padding: "4px 14px 0" }}>
        <div ref={list} className="lr-list" data-testid="level-list">
          <div className="lr-end">Top</div>
          {rows}
          <div className="lr-end">Bottom</div>
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

      {named && (
        <>
          <div className="lr-dim" onClick={() => setNamed(null)} />
          <div className="lr-dlg" role="dialog" aria-label={named.rename ? `Rename ${c}` : "Custom level"}>
            <h3>{named.rename ? `Rename ${c}` : `Custom level, ${above ? "above" : "below"} ${levelChip(c)}`}</h3>
            <input
              autoFocus
              aria-label="Level name"
              maxLength={24}
              placeholder="e.g. Plant room"
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
                      <span style={{ ...numBox, borderColor: "#2ec4b6", boxShadow: "0 0 0 2px rgba(46,196,182,.18)" }}>
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
