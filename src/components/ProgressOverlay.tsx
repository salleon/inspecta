import { useEffect, useRef } from "react";
import AnimationVideo from "./AnimationVideo";
import { mountArt } from "./loaderArt";

// Full-screen loading overlay with a big percentage, shown while a long
// export or backup is prepared: an animation for the job when one is given,
// otherwise a filling progress ring.
// - Exports (PDF, Excel, photos zip): the picture is drawn live in the app
//   (see loaderArt), as before the videos. Backups play its video (see
//   AnimationVideo).
// - `minMs` (with `startedAt`, a performance.now() time): the percentage
//   shown never runs ahead of an even 0 → 100 over that long, so a quick
//   export still shows the animation counting smoothly up for a moment
//   (the export screen waits out the rest before sharing).
export type LoaderArt = "conveyor" | "sheet" | "zip" | "box";
const LIVE: LoaderArt[] = ["conveyor", "sheet", "zip"];
const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2 - 1;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export default function ProgressOverlay({
  percent,
  title,
  step,
  art,
  startedAt,
  minMs = 0,
}: {
  percent: number;
  title: string;
  step: string;
  art?: LoaderArt;
  startedAt?: number;
  minMs?: number;
}) {
  // the percentage as shown: the real one, held to the minimum-time ramp
  const shownAt = (now: number) => clampPct(startedAt !== undefined && minMs > 0 ? Math.min(percent, (100 * (now - startedAt)) / minMs) : percent);
  const pct = Math.round(shownAt(performance.now()));
  const live = art !== undefined && LIVE.includes(art);
  const ramped = startedAt !== undefined && minMs > 0;

  // one frame loop moves the picture and the number (written straight into
  // the page, so it doesn't re-render the screen every frame)
  const svgRef = useRef<SVGSVGElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(shownAt);
  shown.current = shownAt;
  useEffect(() => {
    if (!live && !ramped) return;
    const update = live && svgRef.current ? mountArt(svgRef.current, art!) : null;
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = shown.current(now);
      update?.((now - t0) / 1000, p);
      if (numRef.current) numRef.current.textContent = String(Math.round(p));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [art, live, ramped]);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={title}
      className="sheet-backdrop"
      style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(4,12,20,0.88)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {art ? (
          <>
            {live ? (
              <svg ref={svgRef} width={240} height={220} viewBox="0 0 240 220" style={{ display: "block", overflow: "visible" }} aria-hidden="true" />
            ) : (
              <AnimationVideo name={art} />
            )}
            <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              <span ref={numRef}>{pct}</span>
              <span style={{ fontSize: 15, color: "var(--muted)", marginLeft: 1 }}>%</span>
            </div>
          </>
        ) : (
          <Ring pct={pct} />
        )}
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{step}</div>
      </div>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--panel-2)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 300ms ease-out" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {pct}
        <span style={{ fontSize: 15, color: "var(--muted)", marginLeft: 1, marginTop: 8 }}>%</span>
      </div>
    </div>
  );
}
