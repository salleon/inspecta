import { useEffect, useRef } from "react";
import { mountArt, type LoaderArt } from "./loaderArt";

// Full-screen loading overlay with a big percentage, shown while a long
// export or backup is prepared: a picture for the job when one is given
// (see loaderArt: PDF, Excel, photos zip, backup), otherwise a filling
// progress ring.
const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2 - 1;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ProgressOverlay({
  percent,
  title,
  step,
  art,
  count,
}: {
  percent: number;
  title: string;
  step: string;
  art?: LoaderArt;
  count?: number; // e.g. photos done so far, for pictures that show it
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
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
            <ArtPicture art={art} percent={percent} count={count} />
            <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {pct}
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

// Drawn once, then moved every frame from the latest progress (kept in a
// ref, so a new percentage doesn't rebuild it).
function ArtPicture({ art, percent, count }: { art: LoaderArt; percent: number; count?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const latest = useRef({ percent, count });
  latest.current = { percent, count };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = mountArt(svg, art);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      update((now - start) / 1000, latest.current.percent, latest.current.count);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [art]);
  return <svg ref={svgRef} width={240} height={220} viewBox="0 0 240 220" style={{ display: "block", overflow: "visible" }} aria-hidden="true" />;
}
