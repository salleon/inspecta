import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";

// The camera's zoom stops (.5× / 1× / 2×). Tap one to jump to it; hold or
// slide on the bar and it opens into a dial you slide left and right to zoom
// smoothly, one-handed (like Android's camera). Let go and it closes again.

type Props = {
  stops: number[];
  zoom: number;
  min: number;
  max: number;
  onZoom: (z: number) => void;
};

const PX = 70; // px of slide for each e-fold of zoom
const HOLD_MS = 250;
const W = 260, H = 74, MID = W / 2, R = 124;

function fmt(z: number) {
  if (z < 1) return `${z.toFixed(1).replace(/^0/, "")}×`;
  if (z < 10) return `${z.toFixed(1).replace(/\.0$/, "")}×`;
  return `${Math.round(z)}×`;
}

function stopLabel(z: number) {
  return z < 1 ? ".5×" : `${z}×`;
}

export default function ZoomBar({ stops, zoom, min, max, onZoom }: Props) {
  const [open, setOpen] = useState(false);
  const drag = useRef<{ x: number; z: number; on: boolean; timer: number; el: HTMLDivElement; id: number } | null>(null);
  const dragged = useRef(false);

  const nearest = stops.reduce((a, z) => (Math.abs(Math.log(z / zoom)) < Math.abs(Math.log(a / zoom)) ? z : a), stops[0] ?? 1);

  function start(e: ReactPointerEvent<HTMLDivElement>) {
    // the pointer is only taken once it's a hold or a slide, so a plain tap
    // still reaches the stop's button
    dragged.current = false;
    const timer = window.setTimeout(() => {
      if (!drag.current) return;
      grab(drag.current);
    }, HOLD_MS);
    drag.current = { x: e.clientX, z: zoom, on: false, timer, el: e.currentTarget, id: e.pointerId };
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.on && Math.abs(dx) > 6) grab(d);
    if (!d.on) return;
    // slide right to zoom in, left to zoom out (the dial's marks follow the
    // finger, so bigger zooms sit to the left)
    onZoom(Math.min(max, Math.max(min, Math.exp(Math.log(d.z) + dx / PX))));
  }
  function grab(d: NonNullable<typeof drag.current>) {
    d.on = true;
    try {
      d.el.setPointerCapture(d.id);
    } catch {
      // the pointer's already gone
    }
    setOpen(true);
  }
  function end() {
    const d = drag.current;
    if (!d) return;
    window.clearTimeout(d.timer);
    dragged.current = d.on;
    drag.current = null;
    setOpen(false);
  }

  // the dial's tick marks round the arc, centred on the zoom now
  const ticks: ReactElement[] = [];
  if (open) {
    const majors = [...stops, 4, 8, 16].filter((m) => m >= min - 0.01 && m <= max + 0.01);
    for (let s = Math.max(min, 0.5); s <= max + 0.001; s = +(s + (s < 1 ? 0.05 : s < 2 ? 0.1 : s < 4 ? 0.25 : s < 8 ? 0.5 : 1)).toFixed(2)) {
      const x = MID - Math.log(s / zoom) * PX;
      if (x < 14 || x > W - 14) continue;
      const major = majors.some((m) => Math.abs(m - s) < 0.03);
      const y0 = H - Math.sqrt(Math.max(0, 1 - ((x - MID) / R) ** 2)) * (H + 2);
      ticks.push(
        <line key={`t${s}`} x1={x} y1={y0 + 8} x2={x} y2={y0 + (major ? 20 : 14)} stroke={major ? "#fff" : "rgba(255,255,255,.45)"} strokeWidth={major ? 2 : 1} />,
      );
      if (major)
        ticks.push(
          <text key={`l${s}`} x={x} y={y0 + 33} textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(255,255,255,.8)">
            {s < 1 ? ".5" : s}
          </text>,
        );
    }
  }

  return (
    <div className={`cam-zoom${open ? " open" : ""}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <svg className="cam-dial" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
        <path d={`M6 ${H} Q${MID} -6 ${W - 6} ${H}`} fill="rgba(0,0,0,.45)" />
        {ticks}
        <path d={`M${MID - 6} 6 L${MID + 6} 6 L${MID} 13Z`} fill="#f5d36b" />
        <text x={MID} y={62} textAnchor="middle" fontSize="16" fontWeight="800" fill="#f5d36b">
          {fmt(zoom)}
        </text>
      </svg>
      {stops.map((z, i) => (
        <span key={z} style={{ display: "contents" }}>
          {i > 0 && <i className="cam-zoom-dot" />}
          <button
            className={z === nearest ? "on" : ""}
            onClick={() => {
              if (dragged.current) return;
              onZoom(z);
            }}
          >
            {z === nearest && Math.abs(zoom - z) > 0.05 ? fmt(zoom) : stopLabel(z)}
          </button>
        </span>
      ))}
    </div>
  );
}
