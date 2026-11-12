import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Site, SpfStair, SpfSystem, StairTest } from "../db/types";
import { getSite, getStairTest, saveSiteSpf, saveStairTest } from "../db/db";
import { doorsOpen, fanIsDefault, fanName, limitTiles, wellIsDefault, wellName } from "../lib/stairTest";
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

// a placeholder name (SPF-1, Stair 1): amber and italic, so it reads as
// filled in for now, to be replaced once the fans are identified
export const DEFAULT_NAME: CSSProperties = { color: "#f7b977", fontStyle: "italic" };

// a stair's fan and stairwell names, placeholders marked
export function StairName({ stair, i, part = "both", sep = " · " }: { stair: SpfStair; i: number; part?: "both" | "fan" | "well"; sep?: string }) {
  const fan = fanIsDefault(stair) ? <span className="default-name" style={DEFAULT_NAME}>{fanName(stair, i)}</span> : <span>{fanName(stair, i)}</span>;
  const well = wellIsDefault(stair) ? <span className="default-name" style={DEFAULT_NAME}>{wellName(stair, i)}</span> : <span>{wellName(stair, i)}</span>;
  if (part === "fan") return fan;
  if (part === "well") return well;
  return (
    <>
      {fan}
      {sep}
      {well}
    </>
  );
}

export function Pill({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "rgba(var(--accent-rgb), .14)", color: "#5ff0e0", border: "1px solid rgba(var(--accent-rgb), .4)", whiteSpace: "nowrap" }}
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
function DoorsOpen({ sys }: { sys: Pick<SpfSystem, "edition" | "type"> }) {
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

// everything the edition decides (its requirements), in amber so it's seen as the year's
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
        Requirements · <span style={{ color: "#ffd9a8" }}>AS 1668.1-{sys.edition}{sys.type === "One test" ? "" : ` · ${sys.type}`}</span>
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

  // a change to the site's system made from a test (a door added at a level)
  const setSpf = useCallback((update: (s: SpfSystem) => SpfSystem) => {
    setSite((cur) => {
      if (!cur?.spf) return cur;
      const spf = update(cur.spf);
      void saveSiteSpf(cur.id, spf);
      return { ...cur, spf };
    });
  }, []);

  return { site, test, setTest, setSpf, flush };
}

// The chin bar (design: "carousel"): the stair being tested, with the stairs
// either side peeking in at the edges and a dot per stair. Swipe it sideways
// (or tap a peeking stair) to move to the next or previous stair, one-handed.
// Floating, it sits at the bottom of the screen, or just above the keypad
// while one is open (a sibling .np), so a reading can be typed and the stair
// changed without reaching up.
export function StairChin({ stairs, i, onGo, sub, floating = false }: { stairs: SpfStair[]; i: number; onGo: (i: number) => void; sub?: string; floating?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState<number | null>(null);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; on: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!floating) return;
    const pad = root.current?.parentElement?.querySelector<HTMLElement>(".np");
    const b = pad ? pad.offsetHeight + 8 : null;
    if (b !== bottom) setBottom(b);
  });
  if (stairs.length < 2) return null;
  const prev = i > 0 ? stairs[i - 1] : null;
  const next = i < stairs.length - 1 ? stairs[i + 1] : null;
  const peek = (st: SpfStair | null, k: number, side: "left" | "right") =>
    st ? (
      <button
        aria-label={`${side === "left" ? "Previous" : "Next"} stair: ${fanName(st, k)} · ${wellName(st, k)}`}
        onClick={() => onGo(k)}
        style={{ flex: "0 0 84px", alignSelf: "stretch", border: "none", background: "none", padding: side === "left" ? "0 0 0 12px" : "0 12px 0 0", textAlign: side, color: "#8ba0b5", fontSize: 12, fontWeight: 800, lineHeight: 1.2, WebkitMaskImage: `linear-gradient(${side === "left" ? 90 : 270}deg, transparent, #000 75%)`, maskImage: `linear-gradient(${side === "left" ? 90 : 270}deg, transparent, #000 75%)` }}
      >
        {fanName(st, k)}
        <span style={{ display: "block", fontSize: 10, fontWeight: 700 }}>{wellName(st, k)}</span>
      </button>
    ) : (
      <span style={{ flex: "0 0 84px" }} />
    );
  return (
    <div
      ref={root}
      data-testid="stair-chin"
      onPointerDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, on: false })}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const mx = e.clientX - d.x;
        if (!d.on) {
          if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(e.clientY - d.y)) return;
          d.on = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        // a little give at the ends
        setDx(Math.max(-90, Math.min(90, (mx < 0 && !next) || (mx > 0 && !prev) ? mx / 4 : mx)));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d?.on) {
          if (dx < -40 && next) onGo(i + 1);
          else if (dx > 40 && prev) onGo(i - 1);
        }
        setDx(0);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDx(0);
      }}
      onClickCapture={(e) => {
        // a swipe that ends on a peeking stair isn't a tap on it
        if (dx !== 0) e.stopPropagation();
      }}
      style={{
        ...(floating ? { position: "absolute", left: 10, right: 10, bottom: bottom ?? "calc(14px + env(safe-area-inset-bottom))", zIndex: 30 } : {}),
        flexShrink: 0,
        height: 56,
        borderRadius: 16,
        background: "#12304b",
        border: "1px solid #2a5a82",
        boxShadow: "0 -6px 20px rgba(0,0,0,.35)",
        overflow: "hidden",
        touchAction: "pan-y",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", height: "100%", transform: `translateX(${dx}px)`, transition: dx ? "none" : "transform 200ms ease-out" }}>
        {peek(prev, i - 1, "left")}
        <span style={{ flex: 1, minWidth: 0, textAlign: "center", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <b style={{ fontSize: 15 }}>
            <StairName stair={stairs[i]} i={i} />
          </b>
          {sub && <span style={{ display: "block", fontSize: 10.5, color: "#8ba0b5", fontWeight: 700 }}>{sub}</span>}
        </span>
        {peek(next, i + 1, "right")}
      </div>
      <span style={{ position: "absolute", left: "50%", bottom: 5, transform: "translateX(-50%)", display: "flex", gap: 4, pointerEvents: "none" }}>
        {stairs.map((st, k) => (
          <i key={st.id} style={{ width: k === i ? 14 : 5, height: 4, borderRadius: 2, background: k === i ? "#5ff0e0" : "#3f5a74" }} />
        ))}
      </span>
    </div>
  );
}
