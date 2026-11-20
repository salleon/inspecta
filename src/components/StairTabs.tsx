import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { SpfStair } from "../db/types";

// The stair tabs along the top of a stair test (design canvas "Reorder
// stairs", option A). A tap opens a stair and a swipe scrolls the row, as
// before; holding a stair still for a moment lifts it (with a buzz) to drag
// along the row. As it goes, the stairs it passes slide aside to open a gap
// where it would land, and near either end the row scrolls on its own.
// Letting go settles it into the gap, then the new order is saved. Lifting
// and dropping change nothing else: the open stair stays open.

const HOLD_MS = 420;
const SLOP = 8; // px a finger can wander before a hold becomes a scroll
const EDGE = 44; // px from the row's ends where it scrolls by itself
const EASE = "transform 200ms cubic-bezier(.2,.8,.2,1)";

type Box = { left: number; w: number };
type Drag = {
  k: number; // the stair lifted
  boxes: Box[]; // every tab where it was when lifted, in row coordinates
  x0: number; // finger x when lifted
  s0: number; // row scroll when lifted
  x: number; // finger x now
  t: number; // where it would land
  phase: "drag" | "drop";
};

function reducedMotion() {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// where the lifted tab lands: past the middle of a neighbour, it takes its place
function landing(boxes: Box[], k: number, centre: number) {
  let t = k;
  for (let j = k + 1; j < boxes.length; j++) if (centre > boxes[j].left + boxes[j].w / 2) t = j;
  for (let j = k - 1; j >= 0; j--) if (centre < boxes[j].left + boxes[j].w / 2) t = j;
  return t;
}

export default function StairTabs({
  stairs,
  render,
  onOpen,
  onReorder,
  after,
}: {
  stairs: SpfStair[];
  // a stair's tab content and look
  render: (st: SpfStair, i: number, lifted: boolean) => { style: CSSProperties; body: ReactNode };
  onOpen: (st: SpfStair) => void;
  onReorder: (stairs: SpfStair[]) => void;
  // after the tabs, not draggable (the + button)
  after?: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const hold = useRef<{ timer: number; x: number; y: number; lx: number } | null>(null);
  // a hold isn't a tap: the click that follows it is dropped
  const swallowClick = useRef(false);
  const raf = useRef(0);

  const scroll = () => row.current?.scrollLeft ?? 0;
  const gapPx = (boxes: Box[]) => (boxes.length > 1 ? boxes[1].left - (boxes[0].left + boxes[0].w) : 5);
  // how far the lifted tab is from where it started, scrolling included
  const moved = (d: Drag) => d.x - d.x0 + scroll() - d.s0;

  const update = (patch: Partial<Drag>) =>
    setDrag((d) => {
      if (!d || d.phase !== "drag") return d;
      const n = { ...d, ...patch };
      const b = n.boxes[n.k];
      return { ...n, t: landing(n.boxes, n.k, b.left + b.w / 2 + moved(n)) };
    });

  // a finger resting on the row stops it scrolling, once a stair is lifted
  // (a non-passive listener: React's touch handlers can't preventDefault)
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (dragRef.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  // near either end, the row scrolls under the finger
  const lifted = drag?.phase === "drag";
  useEffect(() => {
    if (!lifted) return;
    const step = () => {
      const el = row.current;
      const d = dragRef.current;
      if (el && d) {
        const r = el.getBoundingClientRect();
        const into = d.x < r.left + EDGE ? -(r.left + EDGE - d.x) : d.x > r.right - EDGE ? d.x - (r.right - EDGE) : 0;
        if (into) {
          const before = el.scrollLeft;
          el.scrollLeft += Math.sign(into) * Math.min(14, 2 + Math.abs(into) / 3);
          if (el.scrollLeft !== before) update({});
        }
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [lifted]);

  const cancelHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };
  useEffect(() => cancelHold, []);

  const lift = (k: number, x: number, pointerId: number) => {
    const el = row.current;
    hold.current = null;
    if (!el) return;
    const tabs = Array.from(el.querySelectorAll<HTMLElement>("[data-tab]"));
    const boxes = tabs.map((t) => ({ left: t.offsetLeft, w: t.offsetWidth }));
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // the finger has already gone
    }
    try {
      navigator.vibrate?.(12);
    } catch {
      // no buzz on this phone
    }
    swallowClick.current = true;
    setDrag({ k, boxes, x0: x, s0: el.scrollLeft, x, t: k, phase: "drag" });
  };

  const drop = (keep: boolean) => {
    cancelHold();
    const d = dragRef.current;
    if (!d || d.phase !== "drag") return;
    const t = keep ? d.t : d.k;
    const commit = () => {
      setDrag(null);
      if (t !== d.k) {
        const next = stairs.slice();
        const [st] = next.splice(d.k, 1);
        next.splice(t, 0, st);
        onReorder(next);
      }
    };
    if (reducedMotion()) return commit();
    setDrag({ ...d, t, phase: "drop" });
    window.setTimeout(commit, 200);
  };

  // where each tab is drawn, from the lifted one and its landing spot
  const offset = (j: number): number => {
    if (!drag) return 0;
    const { k, t, boxes } = drag;
    const shift = boxes[k].w + gapPx(boxes);
    if (j === k) {
      if (drag.phase === "drag") return moved(drag);
      // into the gap
      return t > k ? boxes[t].left + boxes[t].w - (boxes[k].left + boxes[k].w) : boxes[t].left - boxes[k].left;
    }
    if (k < j && j <= t) return -shift;
    if (t <= j && j < k) return shift;
    return 0;
  };

  const motion = !reducedMotion();
  return (
    <div
      ref={row}
      data-testid="stair-tabs"
      onPointerDown={(e) => {
        const tab = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
        if (!tab || drag || (e.pointerType === "mouse" && e.button !== 0)) return;
        cancelHold();
        swallowClick.current = false;
        const k = Number(tab.dataset.tab);
        const { clientX: x, clientY: y, pointerId: id } = e;
        hold.current = { timer: window.setTimeout(() => lift(k, hold.current?.lx ?? x, id), HOLD_MS), x, y, lx: x };
      }}
      onPointerMove={(e) => {
        const h = hold.current;
        if (h && !drag) {
          h.lx = e.clientX;
          if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > SLOP) cancelHold();
          return;
        }
        if (drag?.phase === "drag") update({ x: e.clientX });
      }}
      onPointerUp={() => {
        if (dragRef.current) drop(true);
        else cancelHold();
      }}
      onPointerCancel={() => {
        if (dragRef.current) drop(false);
        else cancelHold();
      }}
      onClickCapture={(e) => {
        if (swallowClick.current) {
          e.stopPropagation();
          swallowClick.current = false;
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "relative",
        flexShrink: 0,
        display: "flex",
        gap: 5,
        overflowX: drag ? "hidden" : "auto",
        // room for the lifted tab's lift and shadow
        padding: "6px 14px 6px",
        margin: "-2px 0 -4px",
        scrollbarWidth: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {stairs.map((st, j) => {
        const up = drag?.k === j;
        const { style, body } = render(st, j, up);
        const dx = offset(j);
        return (
          <button
            key={st.id}
            data-tab={j}
            aria-roledescription="stair tab, hold to move"
            onClick={() => onOpen(st)}
            style={{
              ...style,
              position: "relative",
              zIndex: up ? 2 : undefined,
              transform: dx ? `translateX(${dx}px)` : undefined,
              scale: up && drag.phase === "drag" ? "1.08" : undefined,
              boxShadow: up && drag.phase === "drag" ? "0 8px 20px rgba(0,0,0,.55), 0 0 0 1px var(--accent-soft)" : style.boxShadow,
              // the lifted tab follows the finger exactly; the rest glide
              transition: !motion || !drag ? "none" : up ? (drag.phase === "drop" ? `${EASE}, scale 200ms, box-shadow 200ms` : "scale 150ms, box-shadow 150ms") : EASE,
              touchAction: drag ? "none" : "pan-x",
            }}
          >
            {body}
          </button>
        );
      })}
      {after}
    </div>
  );
}
