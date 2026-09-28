import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useBackHandler } from "../lib/backButton";

// Full-screen photo viewer for a finding's photos (tap the big photo on the
// finding screen). The photo grows out of the spot it was tapped in and is
// shown whole on black.
//   swipe sideways    the finding's other photos
//   drag down / up    let go to close: it shrinks back into its spot
//   pinch, double-tap zoom in / out; drag to look around while zoomed
//   single tap        show / hide the counter, ✕ and note
//   Android back, ✕   close

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  urls: string[];
  startIndex: number;
  // where the photo sits on the screen now (it grows from / shrinks to here)
  source: Rect;
  radius: number;
  note?: string;
  place?: string;
  onClose: (index: number) => void;
}

const EASE = "cubic-bezier(.2,.8,.2,1)";
const MOVE = ["left", "top", "width", "height", "border-radius", "transform"].map((p) => `${p} 300ms ${EASE}`).join(", ") + ", opacity 250ms ease";
const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;

type Mode = null | "h" | "v" | "pan" | "pinch";
interface Zoom {
  s: number;
  x: number;
  y: number;
}
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };

export default function PhotoViewer({ urls, startIndex, source, radius, note, place, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [phase, setPhase] = useState<"start" | "open" | "closing">("start");
  const [drag, setDrag] = useState<{ mode: Mode; dx: number; dy: number }>({ mode: null, dx: 0, dy: 0 });
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const [controls, setControls] = useState(true);
  // natural size of each photo, once loaded (a 4:3 guess until then)
  const [sizes, setSizes] = useState<Record<string, [number, number]>>({});
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ mode: Mode; sx: number; sy: number; t: number; zoom: Zoom; dist?: number; mid?: { x: number; y: number } } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    // two frames so the photo is drawn at its start spot before it grows
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open")));
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(tapTimer.current);
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  function close() {
    if (phase === "closing") return;
    window.clearTimeout(tapTimer.current);
    setPhase("closing");
    setDrag({ mode: null, dx: 0, dy: 0 });
    setZoom(NO_ZOOM);
    closeTimer.current = window.setTimeout(() => onClose(index), 300);
  }

  useBackHandler(() => {
    close();
    return true;
  });

  const VW = viewport.w;
  const VH = viewport.h;

  // the rect a photo fills when shown whole
  function contain(url: string): Rect {
    const [pw, ph] = sizes[url] ?? [4, 3];
    const a = pw / ph;
    const w = a > VW / VH ? VW : VH * a;
    const h = a > VW / VH ? VW / a : VH;
    return { x: (VW - w) / 2, y: (VH - h) / 2, w, h };
  }

  // keeps a zoomed photo covering the screen where it can (no panning off
  // into black)
  function clampZoom(z: Zoom, url: string): Zoom {
    if (z.s <= 1.01) return NO_ZOOM;
    const c = contain(url);
    const mx = Math.max(0, (c.w * z.s - VW) / 2);
    const my = Math.max(0, (c.h * z.s - VH) / 2);
    return { s: z.s, x: Math.min(mx, Math.max(-mx, z.x)), y: Math.min(my, Math.max(-my, z.y)) };
  }

  const current = urls[index];

  function onDown(e: PointerEvent<HTMLDivElement>) {
    if (phase !== "open" || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // second finger: start a pinch from the zoom as it is now
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: "pinch", sx: 0, sy: 0, t: Date.now(), zoom, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      setDrag({ mode: "pinch", dx: 0, dy: 0 });
      return;
    }
    gesture.current = { mode: null, sx: e.clientX, sy: e.clientY, t: Date.now(), zoom };
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.mode === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = Math.min(MAX_ZOOM, Math.max(1, (g.zoom.s * dist) / g.dist!));
      // keep the point between the fingers under the fingers
      const cx = VW / 2;
      const cy = VH / 2;
      const qx = (g.mid!.x - cx - g.zoom.x) / g.zoom.s;
      const qy = (g.mid!.y - cy - g.zoom.y) / g.zoom.s;
      setZoom({ s, x: mid.x - cx - s * qx, y: mid.y - cy - s * qy });
      return;
    }

    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (g.zoom.s > 1) {
      if (!g.mode && Math.hypot(dx, dy) < 6) return;
      g.mode = "pan";
      setDrag({ mode: "pan", dx: 0, dy: 0 });
      setZoom(clampZoom({ s: g.zoom.s, x: g.zoom.x + dx, y: g.zoom.y + dy }, current));
      return;
    }
    if (!g.mode) {
      if (Math.hypot(dx, dy) < 8) return;
      g.mode = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    setDrag({ mode: g.mode, dx, dy });
  }

  function onUp(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const had = pointers.current.delete(e.pointerId);
    if (!g || !had) return;

    if (g.mode === "pinch") {
      if (pointers.current.size > 0) {
        // one finger still down: carry on as a pan from here
        const [p] = [...pointers.current.values()];
        gesture.current = { mode: "pan", sx: p.x, sy: p.y, t: Date.now(), zoom };
        return;
      }
      gesture.current = null;
      setZoom(clampZoom(zoom, current));
      setDrag({ mode: null, dx: 0, dy: 0 });
      return;
    }

    gesture.current = null;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    const quick = Date.now() - g.t < 250;

    if (!g.mode) {
      // a tap: two quick taps zoom in / out, one shows / hides the controls
      const now = Date.now();
      const tap = lastTap.current;
      if (tap && now - tap.t < 300 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 40) {
        window.clearTimeout(tapTimer.current);
        lastTap.current = null;
        if (zoom.s > 1) setZoom(NO_ZOOM);
        else {
          const s = DOUBLE_TAP_ZOOM;
          setZoom(clampZoom({ s, x: (e.clientX - VW / 2) * (1 - s), y: (e.clientY - VH / 2) * (1 - s) }, current));
        }
        return;
      }
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      window.clearTimeout(tapTimer.current);
      tapTimer.current = window.setTimeout(() => setControls((c) => !c), 300);
      return;
    }

    if (g.mode === "h") {
      const far = Math.abs(dx) > VW * 0.18 || (quick && Math.abs(dx) > 30);
      if (far && dx < 0 && index < urls.length - 1) setIndex(index + 1);
      else if (far && dx > 0 && index > 0) setIndex(index - 1);
    } else if (g.mode === "v") {
      if (Math.abs(dy) > 110 || (quick && Math.abs(dy) > 50)) {
        close();
        return;
      }
    }
    setDrag({ mode: null, dx: 0, dy: 0 });
  }

  const dragging = drag.mode !== null;
  const flying = phase !== "open";
  let dx = drag.mode === "h" ? drag.dx : 0;
  if ((index === 0 && dx > 0) || (index === urls.length - 1 && dx < 0)) dx *= 0.35; // resist at the ends
  const dy = drag.mode === "v" ? drag.dy : 0;

  const background = flying ? 0 : Math.max(0.12, 1 - Math.abs(dy) / 320);
  const showControls = controls && !flying && !dragging;

  return (
    <div
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ position: "fixed", inset: 0, zIndex: 50, touchAction: "none", userSelect: "none", overflow: "hidden" }}
    >
      <div style={{ position: "absolute", inset: 0, background: "#000", opacity: background, transition: dragging ? "none" : "opacity 300ms ease" }} />
      {urls.map((url, i) => {
        const c = contain(url);
        const style: CSSProperties = {
          position: "absolute",
          left: c.x + (i - index) * VW + dx,
          top: c.y,
          width: c.w,
          height: c.h,
          objectFit: "cover",
          borderRadius: 0,
          transformOrigin: "center center",
          transition: dragging ? "none" : MOVE,
          pointerEvents: "none",
          opacity: 1,
        };
        if (i === index) {
          if (flying) Object.assign(style, { left: source.x, top: source.y, width: source.w, height: source.h, borderRadius: radius });
          else if (zoom.s > 1) style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`;
          else if (dy) style.transform = `translate(0px, ${dy}px) scale(${1 - Math.min(Math.abs(dy) / VH, 0.3)})`;
        } else if (flying || Math.abs(i - index) > 1) {
          style.opacity = 0;
        }
        return (
          <img
            key={url}
            src={url}
            alt={`Photo ${i + 1} of ${urls.length}`}
            draggable={false}
            onLoad={(ev) => {
              const img = ev.currentTarget;
              if (img.naturalWidth && img.naturalHeight) setSizes((s) => (s[url] ? s : { ...s, [url]: [img.naturalWidth, img.naturalHeight] }));
            }}
            style={style}
          />
        );
      })}

      {/* counter and ✕ */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          padding: "calc(16px + env(safe-area-inset-top)) 16px 36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0))",
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? "auto" : "none",
          transition: "opacity 200ms",
        }}
      >
        <span style={{ width: 40 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", background: "rgba(20,30,40,0.55)", borderRadius: 999, padding: "5px 12px", visibility: urls.length > 1 ? "visible" : "hidden" }}>
          {index + 1} / {urls.length}
        </span>
        <button
          type="button"
          aria-label="Close photo"
          onClick={close}
          style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(20,30,40,0.6)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      {/* the finding's note, and a dot per photo */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "48px 18px calc(28px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          background: "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.7))",
          opacity: showControls ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity 200ms",
        }}
      >
        {note && <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.35 }}>{note}</div>}
        {place && <div style={{ fontSize: 12, fontWeight: 600, color: "#b9c6d3" }}>{place}</div>}
        {urls.length > 1 && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center", paddingTop: 12 }}>
            {urls.map((url, i) => (
              <span key={url} style={{ height: 6, width: i === index ? 16 : 6, borderRadius: 3, background: i === index ? "#fff" : "rgba(255,255,255,0.45)", transition: "width 200ms" }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
