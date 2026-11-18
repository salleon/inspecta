import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FfcpFan, FfcpMark, FfcpTest, Site } from "../db/types";
import { getSite, saveSiteFfcp } from "../db/db";
import { CONTROL, FAN_TYPES, INDICATION, REASONS, fanKeys, fanStats, modeStats, newFan, seriesNames, type FfcpMode, type Stats } from "../lib/ffcp";
import { useBackHandler } from "../lib/backButton";
import { IconChevronLeft, IconEdit } from "../components/Icons";
import RoundIconButton from "../components/RoundIconButton";
import SiteKindIcon from "../components/SiteKindIcon";
import ConfirmDialog from "../components/ConfirmDialog";
import NumPad, { BLANK, k, numberKeys } from "../components/NumPad";
import { Sheet } from "../components/TestsList";
import "./FfcpTest.css";

// One fire fan control panel test (design canvas: FFCP mock-up v5). Every
// fan is a tile to jump to in any order; the picked one's checks sit in the
// panel below: indication (run, stop, fault) beside control (on, off), and
// notes. Normal mode and fire mode are each checked. A ✗ asks why (or
// later). Add fans: a type, then one number at a time or a batch.

const PASS = "#2bd47a";
const FAIL = "#ff7a6a";

const Tick = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const Cross = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

// a fan's tile, with its checks for the mode shown
type Item = { id: string; name: string; keys: string[]; labels: string[]; marks: FfcpFan["marks"]; notes: FfcpFan["notes"]; stats: Stats };

type Group = { prefix: string; from: number; to: number };

export default function FfcpTestPage() {
  const { siteId, testId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Site | null>(null);
  const [test, setTest] = useState<FfcpTest | null>(null);
  const [mode, setMode] = useState<FfcpMode>("normal");
  const [cur, setCur] = useState<string | null>(null);
  const [show, setShow] = useState<"all" | "todo" | "fails">("all");
  const [sheet, setSheet] = useState<null | "add" | "note" | "fan" | "panel" | "delete">(null);
  const [note, setNote] = useState<{ key: string; isNew: boolean; text: string } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const tilesRef = useRef<HTMLDivElement>(null);
  const advance = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getSite(siteId!).then((s) => {
      if (cancelled || !s) return;
      const t = s.ffcp?.find((x) => x.id === testId) ?? null;
      setJob(s);
      setTest(t);
      if (t) {
        setCur(t.fans[0]?.id ?? null);
        if (!t.fans.length) setSheet("add");
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(advance.current);
    };
  }, [siteId, testId]);

  // every change saves the job's tests at once
  function save(next: FfcpTest) {
    const stamped = { ...next, updatedAt: Date.now() };
    setTest(stamped);
    setJob((j) => {
      if (!j) return j;
      const all = (j.ffcp ?? []).map((t) => (t.id === stamped.id ? stamped : t));
      void saveSiteFfcp(j.id, all);
      return { ...j, ffcp: all };
    });
  }

  const back = () => navigate(`/site/${siteId}/findings`);
  useBackHandler(() => {
    if (sheet === "note") {
      cancelNote();
      return true;
    }
    if (sheet) {
      setSheet(null);
      return true;
    }
    return false;
  });

  // keep the picked tile in view above the checks
  useEffect(() => {
    const el = tilesRef.current?.querySelector<HTMLElement>(`[data-id="${cur}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cur, mode]);

  if (!test) return <div style={{ height: "100%", background: "var(--bg)" }} />;

  const fanItem = (f: FfcpFan): Item => {
    const keys = fanKeys(mode);
    return { id: f.id, name: f.name, keys, labels: [...INDICATION, ...CONTROL].map(([, l]) => l), marks: f.marks, notes: f.notes, stats: fanStats(f, mode) };
  };
  const items = test.fans.map(fanItem);
  const open = (s: Stats) => s.done < s.total;
  const shown = show === "todo" ? items.filter((i) => open(i.stats)) : show === "fails" ? items.filter((i) => i.stats.fails) : items;
  const item = items.find((i) => i.id === cur) ?? null;
  const fan = test.fans.find((f) => f.id === cur);

  function nextOpen(from: string | null) {
    const i = items.findIndex((x) => x.id === from);
    const order = [...items.slice(i + 1), ...items.slice(0, Math.max(i, 0))];
    return order.find((x) => open(x.stats))?.id ?? null;
  }

  // write one check of the picked tile (null clears it)
  function write(key: string, mark: FfcpMark | null, noteText?: string) {
    if (!test || !cur) return test;
    const apply = <T extends { marks: FfcpFan["marks"]; notes: FfcpFan["notes"] }>(o: T): T => {
      const marks = { ...o.marks };
      const notes = { ...o.notes };
      if (mark) marks[key] = mark;
      else delete marks[key];
      if (mark !== "n") delete notes[key];
      else if (noteText !== undefined) {
        if (noteText.trim()) notes[key] = noteText.trim();
        else delete notes[key];
      }
      return { ...o, marks, notes };
    };
    const next = { ...test, fans: test.fans.map((f) => (f.id === cur ? apply(f) : f)) };
    save(next);
    return next;
  }

  // once the picked tile is complete, the next open one comes up
  function moveOnIfDone(next: FfcpTest) {
    const id = cur;
    const it = next.fans.find((f) => f.id === id);
    if (!it || open(fanStats(it, mode))) return;
    window.clearTimeout(advance.current);
    advance.current = window.setTimeout(() => {
      setCur((c) => {
        if (c !== id) return c;
        const ids = next.fans.map((f) => ({ id: f.id, s: fanStats(f, mode) }));
        const i = ids.findIndex((x) => x.id === id);
        return [...ids.slice(i + 1), ...ids.slice(0, i)].find((x) => open(x.s))?.id ?? c;
      });
    }, 500);
  }

  function tap(key: string, mark: FfcpMark) {
    if (!item) return;
    if (item.marks[key] === mark) {
      write(key, null);
      return;
    }
    const next = write(key, mark);
    if (mark === "n") {
      setNote({ key, isNew: true, text: "" });
      setSheet("note");
      return;
    }
    if (next) moveOnIfDone(next);
  }

  function saveNote(later = false) {
    if (!note) return;
    const next = write(note.key, "n", later ? undefined : note.text);
    setSheet(null);
    setNote(null);
    if (next) moveOnIfDone(next);
  }
  function cancelNote() {
    if (note?.isNew) write(note.key, null);
    setSheet(null);
    setNote(null);
  }

  function setFanNote(text: string) {
    if (!fan) return;
    save({ ...test!, fans: test!.fans.map((f) => (f.id === fan.id ? { ...f, note: text } : f)) });
  }

  function addFans(names: string[]) {
    if (!names.length) return;
    const fresh = names.map(newFan);
    save({ ...test!, fans: [...test!.fans, ...fresh] });
    setShow("all");
    setCur(fresh[0].id);
    setSheet(null);
  }

  const label = (key: string) => {
    const i = item?.keys.indexOf(key) ?? -1;
    return i >= 0 ? item!.labels[i] : "";
  };
  const reasons = note && /\.(on|off)$/.test(note.key) ? REASONS.control : REASONS.indication;
  const nx = nextOpen(cur);
  const firstOpen = item?.keys.find((key) => !item.marks[key]);

  const check = (key: string, text: string) => {
    const m = item!.marks[key];
    const why = item!.notes[key];
    return (
      <div key={key} style={{ display: "contents" }}>
        <div className="ff-ck">
          <span>{text}</span>
          <button className={`ff-chip y${m === "y" ? " on" : ""}${key === firstOpen ? " cur" : ""}`} aria-label={`${text} pass`} aria-pressed={m === "y"} onClick={() => tap(key, "y")}>
            <Tick />
          </button>
          <button className={`ff-chip n${m === "n" ? " on" : ""}`} aria-label={`${text} fail`} aria-pressed={m === "n"} onClick={() => tap(key, "n")}>
            <Cross />
          </button>
        </div>
        {m === "n" && (
          <button
            className={`ff-why${why ? "" : " add"}`}
            onClick={() => {
              setNote({ key, isNew: false, text: why ?? "" });
              setSheet("note");
            }}
          >
            {why || "Add why it failed"}
          </button>
        )}
      </div>
    );
  };

  const modeLine = (m: FfcpMode) => {
    const s = modeStats(test, m);
    return (
      <small>
        {s.done} of {s.total}
        {s.fails > 0 && <span style={{ color: FAIL }}> · {s.fails} fail{s.fails === 1 ? "" : "s"}</span>}
      </small>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", background: "var(--bg)" }}>
      <div style={{ flexShrink: 0, height: 64, padding: "0 12px", display: "flex", alignItems: "center", gap: 6 }}>
        <RoundIconButton ariaLabel="Back to panel tests" onClick={back}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <button
          aria-label="Edit panel location"
          onClick={() => {
            setNameDraft(test.location);
            setSheet("panel");
          }}
          style={{ flexGrow: 1, minWidth: 0, background: "none", border: "none", color: "inherit", textAlign: "left", padding: "4px 2px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 800 }}>
            <SiteKindIcon kind="ffcp" size={16} />
            FFCP test
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {test.location || job?.name || "Panel location"}
            <IconEdit size={12} color="var(--muted-2)" />
          </div>
        </button>
      </div>

      <div style={{ flexShrink: 0, padding: "0 16px 8px" }}>
        <div className="ff-seg">
          {(["normal", "fire"] as FfcpMode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? "on" : ""}
              onClick={() => setMode(m)}
            >
              {m === "normal" ? "Normal mode" : "Fire mode"}
              {modeLine(m)}
            </button>
          ))}
        </div>
      </div>

      <div ref={tilesRef} style={{ flexGrow: 1, minHeight: 90, overflowY: "auto", padding: "2px 16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="ff-filter">
          <button className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All {items.length}</button>
          <button className={show === "todo" ? "on" : ""} onClick={() => setShow("todo")}>To do {items.filter((i) => open(i.stats)).length}</button>
          <button className={show === "fails" ? "on" : ""} onClick={() => setShow("fails")}>Fails {items.filter((i) => i.stats.fails).length}</button>
        </div>
        <div className="ff-tiles">
          {shown.map((i) => {
            const s = i.stats;
            const done = !open(s);
            const cls = i.id === cur ? "on" : s.fails ? "bad" : done ? "done" : "";
            const text = s.fails ? `${s.fails} fail${s.fails === 1 ? "" : "s"}${s.noNote ? " · no note" : ""}` : done ? "pass" : s.done ? `${s.done} of ${s.total}` : "to do";
            return (
              <button key={i.id} data-id={i.id} className={`ff-tile ${cls}`} onClick={() => setCur(i.id)}>
                <b>{i.name}</b>
                <span style={{ color: s.fails ? FAIL : done ? PASS : undefined }}>{text}</span>
              </button>
            );
          })}
          <button className="ff-tile add" onClick={() => setSheet("add")}>
            + Add fans
          </button>
        </div>
      </div>

      <div className="ff-pad">
        {item ? (
          <>
            <div className="ff-head">
              <span className="ff-tag">Testing</span>
              <b>{item.name}</b>
              {fan && (
                <button
                  aria-label="Edit fan"
                  onClick={() => {
                    setNameDraft(fan.name);
                    setSheet("fan");
                  }}
                  style={{ background: "none", border: "none", padding: 4, display: "flex" }}
                >
                  <IconEdit size={14} color="var(--muted-2)" />
                </button>
              )}
              {nx && (
                <button className="ff-next" onClick={() => setCur(nx)}>
                  Next to do ›
                </button>
              )}
            </div>
              <div className="ff-cols">
                <div>
                  <h4>INDICATION</h4>
                  {item.keys.slice(0, 3).map((key, j) => check(key, item.labels[j]))}
                </div>
                <div>
                  <h4>CONTROL</h4>
                  {item.keys.slice(3).map((key, j) => check(key, item.labels[j + 3]))}
                  <div className="ff-notes">
                    <h4>NOTES</h4>
                    <textarea rows={2} value={fan?.note ?? ""} placeholder="Quick note" onChange={(e) => setFanNote(e.target.value)} />
                  </div>
                </div>
              </div>
          </>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center", padding: "6px 0" }}>{test.fans.length ? "Pick a fan above" : "Add the panel's fans to start"}</div>
        )}
        <button onClick={back} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800 }}>
          Done
        </button>
      </div>

      {sheet === "add" && <AddFans onAdd={addFans} onClose={() => setSheet(null)} />}

      {sheet === "note" && note && (
        <Sheet onClose={cancelNote}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 800 }}>
            <span style={{ color: FAIL, display: "flex" }}>
              <Cross size={18} />
            </span>
            {item?.name} · {label(note.key)}
          </div>
          <div className="ff-chips">
            {reasons.map((r) => (
              <button key={r} className={note.text === r ? "on" : ""} onClick={() => setNote({ ...note, text: r })}>
                {r}
              </button>
            ))}
          </div>
          <textarea className="ff-text" rows={3} value={note.text} placeholder="Why it failed" onChange={(e) => setNote({ ...note, text: e.target.value })} style={{ borderColor: "rgba(255,122,106,.6)" }} />
          <button
            disabled={!note.text.trim()}
            onClick={() => saveNote()}
            style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 15.5, fontWeight: 800, opacity: note.text.trim() ? 1 : 0.4 }}
          >
            Save
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={cancelNote} style={ghost}>
              {note.isNew ? "Undo ✗" : "Cancel"}
            </button>
            {note.isNew && (
              <button onClick={() => saveNote(true)} style={{ ...ghost, color: "#ff9a8c", borderColor: "rgba(255,122,106,.5)" }}>
                Note later
              </button>
            )}
          </div>
        </Sheet>
      )}

      {(sheet === "fan" || sheet === "panel") && (
        <Sheet onClose={() => setSheet(null)}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{sheet === "fan" ? "Fan" : "Panel location"}</div>
          <input
            className="ff-text"
            value={nameDraft}
            placeholder={sheet === "fan" ? "Fan name" : "e.g. Ground floor, fire control room"}
            onChange={(e) => setNameDraft(e.target.value)}
            style={{ padding: "12px 14px", fontSize: 15 }}
          />
          <button
            onClick={() => {
              if (sheet === "fan" && fan && nameDraft.trim()) save({ ...test, fans: test.fans.map((f) => (f.id === fan.id ? { ...f, name: nameDraft.trim() } : f)) });
              if (sheet === "panel") save({ ...test, location: nameDraft.trim() });
              setSheet(null);
            }}
            style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 15.5, fontWeight: 800 }}
          >
            Save
          </button>
          {sheet === "fan" && (
            <button onClick={() => setSheet("delete")} style={{ ...ghost, color: FAIL, borderColor: "rgba(255,93,93,.4)" }}>
              Delete fan
            </button>
          )}
        </Sheet>
      )}

      {sheet === "delete" && fan && (
        <ConfirmDialog
          title={`Delete ${fan.name}?`}
          message="Its checks and notes will be permanently deleted. This can't be undone."
          onCancel={() => setSheet(null)}
          onConfirm={() => {
            const fans = test.fans.filter((f) => f.id !== fan.id);
            save({ ...test, fans });
            setCur(fans[0]?.id ?? null);
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}

const ghost = { flex: 1, width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid var(--border-strong)", background: "none", color: "var(--text)", fontSize: 14.5, fontWeight: 800 } as const;

// Add fans: a type, then one number at a time (− + or typed) or a batch
// (from – to); each goes in a list, then all are added at once
function AddFans({ onAdd, onClose }: { onAdd: (names: string[]) => void; onClose: () => void }) {
  const [prefix, setPrefix] = useState("SPF-");
  const [one, setOne] = useState(true);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(4);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pad, setPad] = useState<null | "one" | "from" | "to">(null);
  const [typed, setTyped] = useState("");
  const type = FAN_TYPES.find((t) => prefix === `${t}-`);

  const range = one ? seriesNames(prefix, from, from) : seriesNames(prefix, from, to);
  const total = groups.reduce((n, g) => n + g.to - g.from + 1, 0);
  const span = (g: Group) => {
    const n = seriesNames(g.prefix, g.from, g.to);
    return n.length > 1 ? `${n[0]} – ${n[n.length - 1]}` : n[0];
  };

  function addGroup() {
    setGroups((gs) => [...gs, { prefix, from, to: one ? from : to }]);
    if (one) setFrom((n) => n + 1);
  }

  function commit() {
    if (!typed) return;
    const v = Math.max(1, Number(typed));
    if (pad === "to") setTo(Math.max(v, from));
    else {
      setFrom(v);
      if (v > to) setTo(v);
    }
    setTyped("");
  }
  function key(kk: string) {
    if (kk === "bs") setTyped((t) => t.slice(0, -1));
    else if (kk === "done") {
      commit();
      setPad(null);
    } else if (kk === "swap") {
      commit();
      setPad((p) => (p === "from" ? "to" : "from"));
    } else if (/^\d$/.test(kk) && typed.length < 3) setTyped((t) => t + kk);
  }
  useBackHandler(() => {
    if (pad) {
      setPad(null);
      return true;
    }
    return false;
  });

  const shownNum = (which: "from" | "to") => (pad === which || (which === "from" && pad === "one") ? typed || (which === "to" ? to : from) : which === "to" ? to : from);

  return (
    <div className="ff-sheet">
      <div className="in">
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ fontSize: 16 }}>Add fans</b>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", padding: 6, display: "flex" }}>
            <Cross size={18} />
          </button>
        </div>
        <div className="ff-lbl">TYPE</div>
        <div className="ff-chips">
          {FAN_TYPES.map((t) => (
            <button
              key={t}
              className={type === t ? "on" : ""}
              onClick={() => {
                // a new type starts again at 01
                if (type !== t) setFrom(1);
                setPrefix(`${t}-`);
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="ff-lbl">NUMBERS</span>
          <span className="ff-nmode">
            <button className={one ? "on" : ""} onClick={() => setOne(true)}>
              One
            </button>
            <button className={one ? "" : "on"} onClick={() => setOne(false)}>
              Batch
            </button>
          </span>
        </div>
        <div className="ff-nums">
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} aria-label="Fan name before the number" />
          {one ? (
            <>
              <button className="ff-step" aria-label="One less" onClick={() => setFrom((n) => Math.max(1, n - 1))}>
                −
              </button>
              <button className={`ff-nbox${pad === "one" ? " on" : ""}`} onClick={() => setPad("one")}>
                <small>NUMBER</small>
                {shownNum("from")}
              </button>
              <button className="ff-step" aria-label="One more" onClick={() => setFrom((n) => n + 1)}>
                +
              </button>
            </>
          ) : (
            <>
              <button className={`ff-nbox${pad === "from" ? " on" : ""}`} onClick={() => setPad("from")}>
                <small>FROM</small>
                {shownNum("from")}
              </button>
              <span style={{ color: "var(--muted-2)", fontWeight: 800 }}>–</span>
              <button className={`ff-nbox${pad === "to" ? " on" : ""}`} onClick={() => setPad("to")}>
                <small>TO</small>
                {shownNum("to")}
              </button>
            </>
          )}
        </div>
        <button className="ff-addgrp" onClick={addGroup}>
          + Add {range.length > 1 ? `${range[0]} – ${range[range.length - 1]}` : range[0]}
        </button>
        {groups.map((g, i) => (
          <div key={i} className="ff-grow">
            <SiteKindIcon kind="ffcp" size={16} />
            {span(g)}
            <em>{g.to - g.from + 1}</em>
            <button aria-label="Remove" onClick={() => setGroups((gs) => gs.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="ft">
        <button
          disabled={!total}
          onClick={() => onAdd(groups.flatMap((g) => seriesNames(g.prefix, g.from, g.to)))}
          style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800, opacity: total ? 1 : 0.4 }}
        >
          {total ? `Add ${total} fan${total === 1 ? "" : "s"} to the test` : "Add a fan above first"}
        </button>
      </div>
      {pad && (
        <NumPad
          tint="ffcp"
          head={
            <span style={{ fontSize: 15, fontWeight: 800 }}>
              <span className="np-tag">{pad === "one" ? "Number" : pad === "from" ? "From" : "To"}</span>
              {typed || (pad === "to" ? to : from)}
            </span>
          }
          keys={numberKeys(pad === "one" ? BLANK(1) : k("swap", pad === "from" ? "To ›" : "‹ From", "fn"), BLANK(2), BLANK(3))}
          onKey={key}
        />
      )}
    </div>
  );
}
