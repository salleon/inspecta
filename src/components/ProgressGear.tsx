// The progress bar on the updating screen with a small gear riding it
// (design canvas UpdateGearsLive): the gear sits at the real percentage and
// turns exactly as far as it has rolled, like a wheel; the bar fills behind it.
const W = 250;
const R = 12; // the gear's radius, for how far it turns as it rolls
const TEETH = 9;

function gearPath() {
  let d = "";
  for (let k = 0; k < TEETH * 2; k++) {
    const a0 = (k / (TEETH * 2)) * Math.PI * 2 + 0.04;
    const a1 = ((k + 1) / (TEETH * 2)) * Math.PI * 2 - 0.04;
    const r = k % 2 ? R - 3.5 : R;
    d += `${k ? "L" : "M"}${(r * Math.cos(a0)).toFixed(2)} ${(r * Math.sin(a0)).toFixed(2)} L${(r * Math.cos(a1)).toFixed(2)} ${(r * Math.sin(a1)).toFixed(2)} `;
  }
  return d + "Z";
}
const PATH = gearPath();

export default function ProgressGear({ pct }: { pct: number }) {
  const x = (W * Math.max(0, Math.min(100, pct))) / 100;
  const turn = (x / (2 * Math.PI * R)) * 360;
  const ease = "300ms linear";
  return (
    <div data-testid="progress-gear" style={{ position: "relative", width: W, height: 5, borderRadius: 3, background: "var(--border)", marginTop: 22 }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: x, borderRadius: 3, background: "var(--accent)", transition: `width ${ease}` }} />
      <svg
        width={26}
        height={26}
        viewBox="-13 -13 26 26"
        style={{ position: "absolute", top: -11, left: x - 13, transition: `left ${ease}`, overflow: "visible" }}
        aria-hidden="true"
      >
        <g style={{ transform: `rotate(${turn}deg)`, transition: `transform ${ease}` }}>
          <path d={PATH} fill="var(--accent)" />
          <circle r={3.4} fill="var(--bg)" />
        </g>
      </svg>
    </div>
  );
}
