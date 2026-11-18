import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
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
      style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: "6px 11px", borderRadius: 999, background: "rgba(var(--accent-rgb), .14)", color: "var(--accent-soft)", border: "1px solid rgba(var(--accent-rgb), .4)", whiteSpace: "nowrap" }}
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

// The chin bar: a strip of the stairs, the one being tested in the middle and
// the next ones half in view either side, a grab handle, arrows and a dot per
// stair. Drag it sideways (or tap an arrow or a half-shown stair) to move to
// the next or previous stair, one-handed. Everything is drawn from one number,
// how far along the stairs the finger has got (0.4 = 40% of the way to the
// next), so the strip, the dots and the page (`follow`, the part of the screen
// that belongs to the stair) all move together and the same way: the page
// slides off and the next stair's card slides in behind it, then the stair
// changes. Letting go springs to the nearest stair; a quick flick goes on to
// the next even short of halfway. Once per phone the bar nudges toward the
// next stair on its own, to show it moves.
// Floating, it sits at the bottom of the screen, or just above the keypad
// while one is open (a sibling .np), so a reading can be typed and the stair
// changed without reaching up.
const HINT_KEY = "inspecta.stairChinHint";
const SLOT = 0.5; // a stair's share of the bar's width
const PAGE_GAP = 12;

function reducedMotion() {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// a spring from `from` to `to` (critically damped: no bounce past a stair),
// starting at speed `v` (per second); returns a stop function
function spring(from: number, to: number, v: number, set: (x: number) => void, done?: () => void) {
  const k = 300;
  const c = 2 * Math.sqrt(k);
  let x = from;
  let last = performance.now();
  let raf = 0;
  const step = (t: number) => {
    const dt = Math.min(0.032, (t - last) / 1000);
    last = t;
    v += (-k * (x - to) - c * v) * dt;
    x += v * dt;
    if (Math.abs(x - to) < 0.002 && Math.abs(v) < 0.05) {
      set(to);
      done?.();
      return;
    }
    set(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function StairChin({
  stairs,
  i,
  onGo,
  sub,
  subFor,
  follow,
  peek,
  floating = false,
}: {
  stairs: SpfStair[];
  i: number;
  onGo: (i: number) => void;
  sub?: string;
  // the line under a stair's name, for the stairs either side
  subFor?: (k: number) => string;
  // the part of the page that's the stair's own, slid along with the bar
  follow?: RefObject<HTMLElement | null>;
  // the next stair's own page (that part of it), drawn as it slides in
  peek?: (k: number) => ReactNode;
  floating?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState<number | null>(null);
  const pos = useRef(0); // offset from stair i, in stairs
  const stop = useRef<() => void>(() => {});
  const drag = useRef<{ x: number; y: number; on: boolean; p0: number; t: number; lx: number; v: number } | null>(null);
  const dragged = useRef(false);
  const ghostEl = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ k: number; host: HTMLElement; box: { left: number; top: number; width: number; height: number } } | null>(null);
  const n = stairs.length;
  const iRef = useRef(i);
  iRef.current = i;

  useLayoutEffect(() => {
    if (!floating) return;
    const pad = root.current?.parentElement?.querySelector<HTMLElement>(".np");
    const b = pad ? pad.offsetHeight + 8 : null;
    if (b !== bottom) setBottom(b);
  });

  // the next stair's card, beside the page as it slides
  const showGhost = useCallback(
    (k: number | null) => {
      const el = follow?.current;
      setGhost((g) => {
        if (k === null || !el || !(el.offsetParent instanceof HTMLElement)) return g ? null : g;
        if (g?.k === k) return g;
        return { k, host: el.offsetParent, box: { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } };
      });
    },
    [follow],
  );

  const paint = useCallback(
    (x: number) => {
      pos.current = x;
      const r = root.current;
      if (!r) return;
      const at = iRef.current;
      const sw = r.clientWidth * SLOT;
      r.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
        const d = Number(el.dataset.k) - at - x;
        const a = Math.min(1, Math.abs(d));
        el.style.transform = `translateX(${d * sw}px) scale(${1 - 0.14 * a})`;
        el.style.opacity = String(1 - 0.5 * a);
        const s = el.querySelector<HTMLElement>("[data-sub]");
        if (s) s.style.opacity = String(1 - a);
      });
      r.querySelectorAll<HTMLElement>("[data-dot]").forEach((el) => {
        const near = Math.max(0, 1 - Math.abs(Number(el.dataset.dot) - at - x));
        el.style.width = `${5 + 11 * near}px`;
        el.style.background = near > 0.5 ? "var(--accent-soft)" : "#3f5a74";
      });
      const l = r.querySelector<HTMLElement>("[data-chev=l]");
      const rt = r.querySelector<HTMLElement>("[data-chev=r]");
      if (l) l.style.opacity = String(Math.max(0, Math.min(1, at + x)));
      if (rt) rt.style.opacity = String(Math.max(0, Math.min(1, n - 1 - at - x)));
      const page = follow?.current;
      if (page) {
        const pw = page.offsetWidth + PAGE_GAP;
        page.style.transform = x ? `translateX(${-x * pw}px)` : "";
        const k = x > 0.001 && at < n - 1 ? at + 1 : x < -0.001 && at > 0 ? at - 1 : null;
        showGhost(k);
        if (ghostEl.current && k !== null) ghostEl.current.style.transform = `translateX(${(Math.sign(x) - x) * pw}px)`;
      }
    },
    [follow, n, showGhost],
  );

  // a new stair (or back on this one): everything back in the middle
  useLayoutEffect(() => {
    stop.current();
    paint(0);
    return () => {
      const page = follow?.current;
      if (page) page.style.transform = "";
    };
  }, [i, n, paint, follow]);
  useLayoutEffect(() => {
    if (!ghostEl.current) return;
    // the next stair's page scrolled as far as this one, as it will open
    const sc = ghostEl.current.firstElementChild;
    if (peek && sc && follow?.current) sc.scrollTop = follow.current.scrollTop;
    paint(pos.current);
  }, [ghost, paint, peek, follow]);
  useEffect(() => () => stop.current(), []);

  // springs to the stair `to` places along (-1, 0 or 1), then moves to it
  const settle = useCallback(
    (to: number, v = 0) => {
      stop.current();
      const at = iRef.current;
      if (at + to < 0 || at + to > n - 1) to = 0;
      if (reducedMotion()) {
        paint(0);
        if (to) onGo(at + to);
        return;
      }
      stop.current = spring(pos.current, to, v, paint, () => {
        if (to) onGo(at + to);
      });
    },
    [n, onGo, paint],
  );

  // once per phone, a nudge toward the next stair and back
  useEffect(() => {
    if (n < 2 || reducedMotion()) return;
    let store: Storage | null = null;
    try {
      store = localStorage;
      if (store.getItem(HINT_KEY)) return;
    } catch {
      return;
    }
    const dir = iRef.current < n - 1 ? 1 : -1;
    const t = setTimeout(() => {
      if (drag.current || pos.current) return;
      store?.setItem(HINT_KEY, "1");
      stop.current = spring(0, dir * 0.22, 0, paint, () => {
        stop.current = spring(pos.current, 0, 0, paint);
      });
    }, 700);
    return () => clearTimeout(t);
  }, [n, paint]);

  if (n < 2) return null;
  const near = stairs.map((st, k) => ({ st, k })).filter(({ k }) => Math.abs(k - i) <= 2);
  const chev = (side: "l" | "r") => (
    <button
      data-chev={side}
      aria-label={side === "l" ? "Previous stair" : "Next stair"}
      disabled={side === "l" ? i === 0 : i === n - 1}
      onClick={() => settle(side === "l" ? -1 : 1)}
      style={{ position: "absolute", top: 0, bottom: 0, [side === "l" ? "left" : "right"]: 0, width: 32, border: "none", background: "none", padding: 0, color: "var(--accent-soft)", fontSize: 24, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}
    >
      {side === "l" ? "‹" : "›"}
    </button>
  );
  const ghostSub = ghost && subFor?.(ghost.k);
  return (
    <>
      <div
        ref={root}
        data-testid="stair-chin"
        onPointerDown={(e) => {
          stop.current();
          dragged.current = false;
          drag.current = { x: e.clientX, y: e.clientY, on: false, p0: pos.current, t: performance.now(), lx: e.clientX, v: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const mx = e.clientX - d.x;
          if (!d.on) {
            if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(e.clientY - d.y)) return;
            d.on = true;
            dragged.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          const t = performance.now();
          d.v = 0.7 * d.v + (0.3 * (e.clientX - d.lx)) / Math.max(1, t - d.t);
          d.t = t;
          d.lx = e.clientX;
          const sw = e.currentTarget.clientWidth * SLOT;
          let x = d.p0 - mx / sw;
          // a little give past the first and last stair
          if ((x > 0 && i === n - 1) || (x < 0 && i === 0)) x /= 4;
          paint(Math.max(-1, Math.min(1, x)));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.on) return;
          const v = (-d.v * 1000) / (e.currentTarget.clientWidth * SLOT); // stairs a second
          const x = pos.current;
          settle(Math.abs(v) > 1.2 ? Math.sign(v) : Math.round(x), v);
        }}
        onPointerCancel={() => {
          drag.current = null;
          settle(0);
        }}
        onClickCapture={(e) => {
          // a swipe that ends on a button isn't a tap on it
          if (dragged.current) e.stopPropagation();
        }}
        style={{
          ...(floating ? { position: "absolute", left: 10, right: 10, bottom: bottom ?? "calc(14px + var(--sa-bottom))", zIndex: 30 } : { position: "relative" }),
          flexShrink: 0,
          height: 58,
          borderRadius: 16,
          background: "#12304b",
          border: "1px solid #2a5a82",
          boxShadow: "0 -6px 20px rgba(0,0,0,.35)",
          overflow: "hidden",
          touchAction: "pan-y",
          userSelect: "none",
          cursor: "grab",
        }}
      >
        {near.map(({ st, k }) => (
          <button
            key={st.id}
            data-k={k}
            tabIndex={k === i ? -1 : 0}
            aria-label={k === i ? undefined : `${k < i ? "Previous" : "Next"} stair: ${fanName(st, k)} · ${wellName(st, k)}`}
            onClick={() => k !== i && settle(Math.sign(k - i))}
            style={{ position: "absolute", top: 0, bottom: 0, left: "25%", width: "50%", border: "none", background: "none", padding: "2px 0 0", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.15, whiteSpace: "nowrap", cursor: "inherit" }}
          >
            <b style={{ fontSize: 15 }}>
              <StairName stair={st} i={k} />
            </b>
            {(k === i ? sub : subFor?.(k)) && (
              <span data-sub style={{ display: "block", fontSize: 10.5, color: "#8ba0b5", fontWeight: 700 }}>
                {k === i ? sub : subFor?.(k)}
              </span>
            )}
          </button>
        ))}
        {/* the stairs either side fade out under the arrows */}
        <span style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(90deg, #12304b 0, rgba(18,48,75,0) 24%, rgba(18,48,75,0) 76%, #12304b 100%)" }} />
        <span style={{ position: "absolute", top: 5, left: "50%", width: 30, height: 4, marginLeft: -15, borderRadius: 2, background: "#3f6a90", pointerEvents: "none" }} />
        {chev("l")}
        {chev("r")}
        <span style={{ position: "absolute", left: "50%", bottom: 5, transform: "translateX(-50%)", display: "flex", gap: 4, pointerEvents: "none" }}>
          {stairs.map((st, k) => (
            <i key={st.id} data-dot={k} style={{ height: 4, borderRadius: 2 }} />
          ))}
        </span>
      </div>
      {ghost &&
        createPortal(
          <div
            ref={ghostEl}
            aria-hidden
            style={{ position: "absolute", left: ghost.box.left, top: ghost.box.top, width: ghost.box.width, height: ghost.box.height, pointerEvents: "none", zIndex: 1, ...(peek ? { display: "flex", flexDirection: "column", overflow: "hidden" } : { padding: "8px 14px" }) }}
          >
            {peek ? (
              peek(ghost.k)
            ) : (
              <>
                <div style={{ borderRadius: 14, background: "var(--panel)", border: "1px solid var(--border)", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                <b style={{ fontSize: 17 }}>
                  <StairName stair={stairs[ghost.k]} i={ghost.k} />
                </b>
                {ghostSub && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{ghostSub}</span>}
              </div>
              {/* the outline of a page, filled in once the stair has changed */}
              {[0, 1, 2, 3, 4].map((r) => (
                <div key={r} style={{ height: 44, marginTop: 7, borderRadius: 12, background: "var(--panel)", border: "1px solid var(--border)", opacity: 0.55 - r * 0.09 }} />
              ))}
              </>
            )}
          </div>,
          ghost.host,
        )}
    </>
  );
}
