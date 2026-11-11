import type { CSSProperties } from "react";
import "./InspectaWordmark.css";

// The Inspecta logotype in Contractor mode (canvas "Inspecta Contractor
// Splash"): "inspecta" in Sora Bold, set tight, with the dot of the i swapped
// for a tick in the company's accent colour (--accent). The word is the same
// in every company's app; only the tick takes their colour. Sizes are in em,
// so it scales with the font size given.
//
// Each letter is its own span (cs-ltr, with --i its position) and the tick
// path has pathLength 1, so a parent can animate them (ContractorSplash).
const REST = "nspecta".split("");

export default function InspectaWordmark({ size = 66, style, className }: { size?: number; style?: CSSProperties; className?: string }) {
  return (
    <div className={className ? `iw-word ${className}` : "iw-word"} style={{ fontSize: size, ...style }} role="img" aria-label="Inspecta">
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
    </div>
  );
}
