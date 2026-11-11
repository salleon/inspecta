import type { CSSProperties } from "react";
import "./InspectaWordmark.css";

// The Inspecta logotype in Contractor mode (canvas "Inspecta Contractor
// Splash"): "inspecta" in Sora Bold, set tight, with the dot of the i swapped
// for a tick in the company's accent colour (--accent). The word is the same
// in every company's app; only the tick takes their colour. Sizes are in em,
// so it scales with the font size given.
//
// reveal plays option B "Under the lens" as it mounts (or as reveal turns
// on): a magnifier sweeps across the blurred word, each letter snaps into
// focus as it passes, then the tick draws onto the i with a ring pulse.
// Used by the contractor splash and the company setup's welcome screen.
const REST = "nspecta".split("");

export default function InspectaWordmark({ size = 66, reveal = false, style, className }: { size?: number; reveal?: boolean; style?: CSSProperties; className?: string }) {
  const cls = ["iw-word", reveal ? "iw-reveal" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls} style={{ fontSize: size, ...style }} role="img" aria-label="Inspecta">
      <span className="iw-i iw-ltr" style={{ "--i": 0 } as CSSProperties} aria-hidden="true">
        {"ı"}
        <svg className="iw-tick" viewBox="0 0 28 23" aria-hidden="true">
          <path pathLength={1} d="M3 12l7.5 7.5L25 3" />
        </svg>
      </span>
      {REST.map((ch, i) => (
        <span key={i} className="iw-ltr" style={{ "--i": i + 1 } as CSSProperties} aria-hidden="true">
          {ch}
        </span>
      ))}
      {reveal && (
        <>
          <span className="iw-lens" aria-hidden="true">
            <i className="iw-handle" />
            <i className="iw-glass" />
          </span>
          <span className="iw-ring" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
