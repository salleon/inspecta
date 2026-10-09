import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import "./NumPad.css";

// The number pad the tests use instead of the phone's keyboard (design canvas
// SpfTidy, SpfStairPad, FlowPads): the measuring tool's pad, purple for stair
// pressurisation and blue for flow tests. Four columns: 7 8 9 · 4 5 6 · 1 2 3
// with ⌫ always third row, right; the two keys above it and the one bottom
// left change with the screen; Done ✓ is bottom right.

export type PadKey = { key: string; label: ReactNode; kind?: "num" | "fn" | "ins" | "bs" | "go" | "blank" | "yes" | "no"; aria?: string };

export const k = (key: string, label: ReactNode = key, kind: PadKey["kind"] = "num", aria?: string): PadKey => ({ key, label, kind, aria });

// 7 8 9 a / 4 5 6 b / 1 2 3 ⌫ / c 0 Done
export function numberKeys(a: PadKey, b: PadKey, c: PadKey): PadKey[] {
  return [k("7"), k("8"), k("9"), a, k("4"), k("5"), k("6"), b, k("1"), k("2"), k("3"), k("bs", "⌫", "bs", "Backspace"), c, k("0"), k("done", "Done ✓", "go", "Done")];
}
export const BLANK = (n: number) => k(`blank${n}`, "", "blank");

export default function NumPad({ tint, head, keys, onKey, testId }: { tint: "spf" | "flow"; head?: ReactNode; keys: PadKey[]; onKey: (key: string) => void; testId?: string }) {
  // each key presses in and springs back, however quickly it's tapped
  function press(e: ReactPointerEvent<HTMLButtonElement>, key: string) {
    e.preventDefault();
    const el = e.currentTarget;
    el.classList.remove("pressed");
    void el.offsetWidth;
    el.classList.add("pressed");
    onKey(key);
  }
  return (
    <div className={`np ${tint}`} data-testid={testId}>
      {head && <div className="np-head">{head}</div>}
      <div className="np-keys">
        {keys.map((p) => (
          <button
            key={p.key}
            type="button"
            tabIndex={-1}
            aria-label={p.aria ?? (typeof p.label === "string" ? p.label : p.key)}
            aria-hidden={p.kind === "blank" || undefined}
            className={`np-key ${p.kind ?? "num"}`}
            onPointerDown={(e) => p.kind !== "blank" && press(e, p.key)}
            onMouseDown={(e) => e.preventDefault()}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// the "Editing" tag in a pad's heading
export function PadTag() {
  return <span className="np-tag">Editing</span>;
}
