// Full-screen loading overlay with a filling progress ring and a big
// percentage — used while a long export (the Excel file) is prepared.
const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2 - 1;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ProgressOverlay({ percent, title, step }: { percent: number; title: string; step: string }) {
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
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{step}</div>
      </div>
    </div>
  );
}
