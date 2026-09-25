import type { CSSProperties, PointerEvent } from "react";
import type { Suggestion } from "../lib/locationSuggestions";

// One row of tappable suggestion buttons under the Location box (see
// lib/locationSuggestions), the matching letters highlighted.
export default function LocationSuggestions({ suggestions, onPick }: { suggestions: Suggestion[]; onPick: (text: string) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, overflow: "hidden" }}>
      {suggestions.map((s) => (
        <button
          key={s.text}
          type="button"
          // keep the keyboard up (a pointerdown would blur the Location box)
          onPointerDown={(e: PointerEvent) => e.preventDefault()}
          onClick={() => onPick(s.text)}
          style={chipStyle}
        >
          {s.matchAt < 0 ? (
            s.text
          ) : (
            <>
              {s.text.slice(0, s.matchAt)}
              <span style={{ color: "var(--accent)", fontWeight: 800 }}>{s.text.slice(s.matchAt, s.matchAt + s.matchLength)}</span>
              {s.text.slice(s.matchAt + s.matchLength)}
            </>
          )}
        </button>
      ))}
    </div>
  );
}

const chipStyle: CSSProperties = {
  flexShrink: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
  fontWeight: 700,
  // Manrope's space is narrow; at this size "Plant room" reads as one word
  wordSpacing: "0.15em",
  padding: "7px 12px",
  borderRadius: 999,
  background: "var(--panel-2)",
  border: "1px solid var(--border-strong)",
  color: "var(--text)",
};
