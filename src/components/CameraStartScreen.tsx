import { useEffect, useRef, useState } from "react";

// What shows while the in-app camera starts, only if it's slow: nothing for
// the first moment (usually the picture is there by then, and just appears),
// then the EnFact camera with its swoosh being traced round it. When the
// picture comes through, an aperture opens from the lens to show it.

const WAIT_MS = 300; // before the start screen shows at all
const OPEN_MS = 520; // the aperture opening

type Phase = "wait" | "splash" | "opening" | "gone";

export default function CameraStartScreen({ live }: { live: boolean }) {
  const [phase, setPhase] = useState<Phase>(live ? "gone" : "wait");

  useEffect(() => {
    if (phase !== "wait" || live) return;
    const id = window.setTimeout(() => setPhase("splash"), WAIT_MS);
    return () => window.clearTimeout(id);
  }, [phase, live]);

  useEffect(() => {
    if (!live) return;
    if (phase === "wait") setPhase("gone");
    else if (phase === "splash") setPhase("opening");
  }, [live, phase]);

  useEffect(() => {
    if (phase !== "opening") return;
    const id = window.setTimeout(() => setPhase("gone"), OPEN_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase === "gone" || phase === "wait") return null;
  const opening = phase === "opening";
  return (
    <div className={`cam-start${opening ? " opening" : ""}`} data-testid="camera-start" aria-label={opening ? undefined : "Starting camera"}>
      {/* the aperture: six navy blades round the lens (closed, they cover the
          screen), each sliding straight out from it while they all turn.
          Plain slides and turns of one-colour blades, so the phone's
          graphics chip runs it smoothly even while the camera is starting. */}
      <div className="cam-blades" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="cam-blade-arm" style={{ transform: `rotate(${k * 60}deg)` }}>
            <div className="cam-blade">
              <i />
            </div>
          </div>
        ))}
      </div>
      <div className="cam-dots" aria-hidden="true" />
      <div className="cam-start-icon">
        <CameraIcon size={150} paused={opening} />
        <div className="cam-start-wait">
          Starting camera<b>.</b>
          <b>.</b>
          <b>.</b>
        </div>
      </div>
    </div>
  );
}

// The EnFact camera: camera body, and the swoosh traced round it by a
// moving point (behind the camera over the top, in front underneath).
export function CameraIcon({ size, paused = false }: { size: number; paused?: boolean }) {
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // stopped while the aperture opens, so it has the phone to itself
    if (paused) return;
    let frame = 0;
    const draw = (now: number) => {
      if (back.current && front.current) traceSwoosh(back.current, front.current, now);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [paused]);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const c = Math.round(size * 1.5);
  const canvasStyle = { position: "absolute" as const, left: -size / 4, top: -size / 4, width: c, height: c };
  return (
    <div className="cam-icon" style={{ position: "relative", width: size, height: size }}>
      <canvas ref={back} width={Math.round(c * dpr)} height={Math.round(c * dpr)} style={canvasStyle} />
      <svg width={size} height={size} viewBox="-8 -4 136 136" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <path d="M42 36l7-11h22l7 11" fill="#143452" stroke="#f4f7f9" strokeWidth="4.5" strokeLinejoin="round" />
        <rect x="12" y="36" width="96" height="66" rx="16" fill="#143452" stroke="#f4f7f9" strokeWidth="4.5" />
        <circle cx="93" cy="50" r="4" fill="#f5d36b" />
        <circle cx="60" cy="66" r="23" fill="none" stroke="#f4f7f9" strokeWidth="4.5" />
        <circle cx="60" cy="66" r="15" fill="#0e2740" />
        <circle cx="54" cy="60" r="4.5" fill="rgba(255,255,255,.4)" />
      </svg>
      <canvas ref={front} width={Math.round(c * dpr)} height={Math.round(c * dpr)} style={canvasStyle} />
    </div>
  );
}

// ---- the swoosh ----
// A tilted ellipse round the lens, open at the lower right like EnFact's,
// thick on the left and tapering to points. One loop: the point draws it
// (0–55%), it holds, then it lets go from its tail.

const TILT = (-12 * Math.PI) / 180;
const A0 = 100, A1 = 385; // degrees round the ellipse it spans
const CYCLE = 2400;

type Pt = [number, number];
interface Orbit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  wmax: number;
}

function along(u: number, o: Orbit): Pt {
  const a = ((A0 + (A1 - A0) * u) * Math.PI) / 180;
  const x = o.rx * Math.cos(a), y = o.ry * Math.sin(a);
  return [o.cx + x * Math.cos(TILT) - y * Math.sin(TILT), o.cy + x * Math.sin(TILT) + y * Math.cos(TILT)];
}

function widthAt(u: number, wmax: number) {
  return Math.max(0.4, wmax * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.85));
}

function band(g: CanvasRenderingContext2D, from: number, to: number, o: Orbit) {
  if (to - from < 0.003) return;
  const n = Math.max(4, Math.round((to - from) * 160));
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = from + ((to - from) * i) / n;
    const p = along(u, o), q = along(Math.min(1, u + 0.002), o), r = along(Math.max(0, u - 0.002), o);
    const dx = q[0] - r[0], dy = q[1] - r[1], l = Math.hypot(dx, dy) || 1;
    let w = widthAt(u, o.wmax) / 2;
    if (i < 3 && from > 0) w *= i / 3; // taper the tail while it lets go
    left.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w]);
    right.push([p[0] + (dy / l) * w, p[1] - (dx / l) * w]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left.slice(1)) g.lineTo(x, y);
  for (const [x, y] of right.reverse()) g.lineTo(x, y);
  g.closePath();
  g.fill();
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function traceSwoosh(back: HTMLCanvasElement, front: HTMLCanvasElement, now: number) {
  const S = back.width;
  // the canvas is 1.5× the icon, centred on it; the icon's viewBox is 136 wide, lens at (60, 66)
  const base = S / 1.5, off = (S - base) / 2, k = base / 136;
  const o: Orbit = { cx: off + 68 * k, cy: off + 70 * k, rx: 72 * k, ry: 40 * k, wmax: 11 * k };
  const t = (now % CYCLE) / CYCLE;
  const head = t < 0.55 ? ease(t / 0.55) : 1;
  const tail = t < 0.68 ? 0 : ease((t - 0.68) / 0.32);
  for (const cv of [back, front]) {
    const g = cv.getContext("2d")!;
    g.clearRect(0, 0, S, S);
    g.save();
    // top half behind the camera, bottom half in front
    g.translate(o.cx, o.cy);
    g.rotate(TILT);
    g.beginPath();
    if (cv === back) g.rect(-S, -S, 2 * S, S);
    else g.rect(-S, 0, 2 * S, S);
    g.clip();
    g.rotate(-TILT);
    g.translate(-o.cx, -o.cy);
    const grad = g.createLinearGradient(o.cx - o.rx, 0, o.cx + o.rx, 0);
    grad.addColorStop(0, "#2f9d90");
    grad.addColorStop(1, "#5ff0e0");
    g.fillStyle = grad;
    g.shadowColor = "rgba(46,196,182,.7)";
    g.shadowBlur = 6 * k;
    band(g, tail, head, o);
    // the point itself, while it draws
    if (t < 0.62) {
      const p = along(head, o), fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.07;
      g.shadowBlur = 14 * k;
      g.shadowColor = `rgba(143,240,230,${fade})`;
      g.fillStyle = `rgba(220,255,250,${fade})`;
      g.beginPath();
      g.arc(p[0], p[1], 3.2 * k, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}
