import type { SiteKind } from "../db/types";

// A small icon for each kind of site (home page groups and New site):
// AFSS a clipboard with a tick, Projects a hard hat, Flow testing a drop,
// Stair pressurisation a small staircase.
export const KIND_COLOUR: Record<SiteKind, string> = { afss: "#2ec4b6", project: "#f5a55c", flow: "#5ab0ff", spf: "#b18cff" };

export default function SiteKindIcon({ kind, size = 14, color }: { kind: SiteKind; size?: number; color?: string }) {
  const stroke = color ?? KIND_COLOUR[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {kind === "afss" && (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V3h6v1" />
          <path d="m9 13 2 2 4-4" />
        </>
      )}
      {kind === "project" && (
        <>
          <path d="M3 18h18" />
          <path d="M5 18v-2a7 7 0 0 1 14 0v2" />
          <path d="M10 9.5V6h4v3.5" />
        </>
      )}
      {kind === "flow" && <path d="M12 3c3.5 4.2 6 7.6 6 10.6A6 6 0 0 1 6 13.6C6 10.6 8.5 7.2 12 3z" />}
      {/* three steps up to the right, on the floor */}
      {kind === "spf" && <path d="M3 21h18V4h-4.5v5.5H12V15H7.5v6" />}
    </svg>
  );
}

const TAG: Record<SiteKind, string> = { afss: "AFSS", project: "Project", flow: "Flow", spf: "SPF" };

// the small coloured tag on a site's row (and a flow testing site's header)
export function KindTag({ kind }: { kind: SiteKind }) {
  const c = KIND_COLOUR[kind];
  return (
    <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${c}66`, background: `${c}1a`, color: c, fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap", lineHeight: 1.4 }}>
      {TAG[kind]}
    </span>
  );
}
