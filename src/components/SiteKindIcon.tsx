import type { SiteKind } from "../db/types";

// A small icon for each kind of site (home page groups and New site):
// AFSS a clipboard with a tick, Projects a hard hat, Flow testing a drop.
export const KIND_COLOUR: Record<SiteKind, string> = { afss: "#2ec4b6", project: "#f5a55c", flow: "#5ab0ff" };

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
    </svg>
  );
}
