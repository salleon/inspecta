import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { formatLevel, parseLevel, stepLevel } from "../lib/levels";

// Level input for a finding (advanced controls): − [ Level 25 ✕ ] +
// The word "Level" is pre-filled so you only type the number (number
// keypad). Ground / Basement / Mezzanine / Roof quick buttons show while
// the box has focus. Always optional — ✕ clears it.
export default function LevelField({
  value,
  onChange,
  onFocus,
  onBlur,
  fieldStyle,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  fieldStyle: CSSProperties;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const parsed = parseLevel(value);
  const kind = parsed?.kind ?? "level";
  const prefix =
    kind === "basement" ? "Basement" : kind === "ground" ? "Ground" : kind === "mezzanine" ? "Mezzanine" : kind === "roof" ? "Roof" : "Level";
  const numbered = kind === "level" || kind === "basement";

  // Buttons around the box don't take focus from it — if the keyboard is up
  // it stays up, and the Note screen's photo doesn't re-expand and shove
  // the button out from under your finger mid-tap.
  function keepFocus(e: PointerEvent) {
    e.preventDefault();
  }

  function handleType(raw: string) {
    const num = raw.replace(/\D/g, "").slice(0, 3);
    // typing on Ground/Mezzanine/Roof switches back to a numbered level
    onChange(formatLevel({ kind: kind === "basement" ? "basement" : "level", num }));
  }

  // quick buttons keep the keyboard up (pointerdown default would blur)
  function quick(text: string) {
    return {
      onPointerDown: keepFocus,
      onClick: () => {
        onChange(text);
        inputRef.current?.focus();
      },
    };
  }

  return (
    // data-keep-visible: when the keyboard opens, keep the box AND its
    // quick buttons in view (see lib/keepFocusedVisible)
    <div data-keep-visible style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <button type="button" aria-label="Down one level" onPointerDown={keepFocus} onClick={() => onChange(stepLevel(value, -1))} style={stepButtonStyle}>
          −
        </button>
        <div
          onClick={() => inputRef.current?.focus()}
          style={{
            ...fieldStyle,
            flexGrow: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 8px 0 14px",
            border: focused ? "1px solid var(--accent)" : fieldStyle.border,
          }}
        >
          <span style={{ fontWeight: 700, color: value ? "var(--text)" : "var(--muted)", flexShrink: 0 }}>{prefix}</span>
          <input
            ref={inputRef}
            id="levelInput"
            aria-label="Level"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={value ? "" : "Optional"}
            value={numbered ? (parsed?.num ?? "") : ""}
            onChange={(e) => handleType(e.target.value)}
            onFocus={(e) => {
              // select the number so typing replaces it rather than appending
              e.currentTarget.select();
              setFocused(true);
              onFocus?.();
            }}
            onBlur={() => {
              setFocused(false);
              onBlur?.();
            }}
            style={{ flexGrow: 1, minWidth: 0, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 14, fontWeight: 800, padding: "13px 0" }}
          />
          {value && (
            <button
              type="button"
              aria-label="Clear level"
              onPointerDown={keepFocus}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", border: "none", background: "var(--border-strong)", color: "var(--muted)", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
            >
              ✕
            </button>
          )}
        </div>
        <button type="button" aria-label="Up one level" onPointerDown={keepFocus} onClick={() => onChange(stepLevel(value, 1))} style={stepButtonStyle}>
          +
        </button>
      </div>
      {focused && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" {...quick("Ground")} style={chipStyle}>Ground</button>
          <button type="button" {...quick("Basement")} style={chipStyle}>Basement…</button>
          <button type="button" {...quick("Mezzanine")} style={chipStyle}>Mezzanine</button>
          <button type="button" {...quick("Roof")} style={chipStyle}>Roof</button>
        </div>
      )}
    </div>
  );
}

const stepButtonStyle: CSSProperties = {
  flexShrink: 0,
  width: 46,
  borderRadius: 12,
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 20,
  fontWeight: 700,
};

const chipStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "7px 12px",
  borderRadius: 999,
  background: "var(--panel-2)",
  border: "1px solid var(--border-strong)",
  color: "var(--text)",
};
