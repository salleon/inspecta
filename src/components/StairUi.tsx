import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Site, SpfSystem, StairTest } from "../db/types";
import { getSite, getStairTest, saveStairTest } from "../db/db";
import { doorsOpen, limitTiles } from "../lib/stairTest";
import { IconChevronLeft } from "./Icons";
import RoundIconButton from "./RoundIconButton";

// Pieces shared by the stair test screens (design canvas StairTestSimple).

export const AMBER = "rgba(245,185,90,";
export const card: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 8 };
export const cardLabel: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" };
export const fieldInput: CSSProperties = { minWidth: 0, background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: "9px 10px", fontSize: 14, fontWeight: 700, color: "var(--text)", outline: "none" };

export function PageHeader({ title, sub, onBack, right }: { title: ReactNode; sub: ReactNode; onBack: () => void; right?: ReactNode }) {
  return (
    <div style={{ flexShrink: 0, minHeight: 64, padding: "8px 12px 4px", display: "flex", alignItems: "center", gap: 6 }}>
      <RoundIconButton ariaLabel="Back" onClick={onBack}>
        <IconChevronLeft size={20} strokeWidth={2.2} />
      </RoundIconButton>
      <div style={{ flexGrow: 1, minWidth: 0, lineHeight: 1.2 }}>
        <div style={{ fontSize: 17, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      {right}
    </div>
  );
}

export function Pill({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "rgba(46,196,182,.14)", color: "#5ff0e0", border: "1px solid rgba(46,196,182,.4)", whiteSpace: "nowrap" }}
    >
      {children}
    </button>
  );
}

export function Seg<T extends string>({ options, value, onChange, label }: { options: T[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", flex: 1, gap: 2, padding: 3, borderRadius: 10, background: "var(--panel-2)", border: "1px solid var(--border-strong)" }}>
      {options.map((o) => (
        <button
          key={o}
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          style={{ flex: "1 1 auto", padding: "8px 3px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", background: o === value ? "var(--accent)" : "none", color: o === value ? "var(--accent-text)" : "var(--muted)" }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// the doors open for velocity, as dot points
export function DoorsOpen({ sys }: { sys: Pick<SpfSystem, "edition" | "type"> }) {
  return (
    <div style={{ fontSize: 12, color: "#d8c4a8", lineHeight: 1.4 }}>
      <b style={{ color: "#ffd9a8" }}>Doors open for velocity</b>
      <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
        {doorsOpen(sys).map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </div>
  );
}

// everything the edition decides, in amber so it's seen as the year's rules
export function RulesBox({ sys, tiles = true, children }: { sys: Pick<SpfSystem, "edition" | "type">; tiles?: boolean; children?: ReactNode }) {
  const key = `${sys.edition} ${sys.type}`;
  const [flash, setFlash] = useState(false);
  const first = useRef(key);
  useEffect(() => {
    if (first.current === key) return;
    first.current = key;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(t);
  }, [key]);
  return (
    <div
      data-testid="spf-rules"
      style={{ background: flash ? `${AMBER}.24)` : `${AMBER}.07)`, border: `1px solid ${AMBER}.45)`, borderRadius: 11, padding: "8px 9px", display: "flex", flexDirection: "column", gap: 6, transition: "background 600ms ease-out" }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#f7b977" }}>
        Rules for <span style={{ color: "#ffd9a8" }}>AS 1668.1-{sys.edition}{sys.type === "One test" ? "" : ` · ${sys.type}`}</span>
      </div>
      <DoorsOpen sys={sys} />
      {tiles && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
          {limitTiles(sys).map(([v, l, on]) => (
            <div key={l} style={{ background: `${AMBER}.1)`, border: `1px solid ${AMBER}.35)`, borderRadius: 9, padding: "4px 6px", fontSize: 10.5, color: "#c9a983", fontWeight: 700, lineHeight: 1.25 }}>
              <b style={{ display: "block", fontSize: 12.5, color: on ? "#ffe0b8" : "#8a7a66" }}>{v}</b>
              {l}
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

// a stair test and its site, loaded; changes are kept straight away and
// written a moment later (and when leaving)
export function useStairTest(siteId: string | undefined, testId: string | undefined) {
  const [site, setSite] = useState<Site | null>(null);
  const [test, setTestState] = useState<StairTest | null>(null);
  const pending = useRef<StairTest | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!siteId || !testId) return;
    let cancelled = false;
    void Promise.all([getSite(siteId), getStairTest(testId)]).then(([s, t]) => {
      if (cancelled) return;
      setSite(s ?? null);
      setTestState(t ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, testId]);

  const flush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const t = pending.current;
    pending.current = null;
    if (t) void saveStairTest(t);
  }, []);

  useEffect(() => flush, [flush]);

  const setTest = useCallback(
    (update: (t: StairTest) => StairTest) => {
      setTestState((cur) => {
        if (!cur) return cur;
        const next = update(cur);
        pending.current = next;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 250);
        return next;
      });
    },
    [flush],
  );

  return { site, test, setTest, flush };
}
