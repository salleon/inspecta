import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import "./NumPad.css";

// The number pad the tests use instead of the phone's keyboard (design canvas
// SpfTidy, SpfStairPad, FlowPads, and "Flow test changes" 3C and 4): the
// measuring tool's pad, purple for stair pressurisation, blue for flow tests
// and coral for FFCP. Four columns, the numbers as on a phone: 1 2 3 on top,
// 7 8 9 on the third row, 0 under 7. Arrows are solid triangles.

type PadKey = {
  key: string;
  label: ReactNode;
  kind?: "num" | "fn" | "ins" | "bs" | "go" | "go1" | "blank" | "yes" | "no";
  aria?: string;
  // two keys wide (0 on the flow pad) or two keys tall (⌫ and Done on the pads with room)
  size?: "wide" | "tall";
};

export const k = (key: string, label: ReactNode = key, kind: PadKey["kind"] = "num", aria?: string, size?: PadKey["size"]): PadKey => ({ key, label, kind, aria, size });

// a solid triangle for an arrow key (a ▶ in text is too thin on some phones)
const ARROW = { up: "M3 16 H19 L11 5 Z", down: "M3 6 H19 L11 17 Z", right: "M6 3 V19 L17 11 Z", left: "M16 3 V19 L5 11 Z" };
export function Arrow({ to }: { to: keyof typeof ARROW }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" style={{ display: "block", margin: "auto" }}>
      <path d={ARROW[to]} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

const BS = (size?: PadKey["size"]) => k("bs", "⌫", "bs", "Backspace", size);
export const BLANK = (n: number) => k(`blank${n}`, "", "blank");

// the flow readings' pad: 1 2 3 Done / 4 5 6 ► / 7 8 9 ▼ / . 0 0 ⌫
export function flowKeys(): PadKey[] {
  return [k("1"), k("2"), k("3"), k("done", "Done ✓", "go1", "Done"), k("4"), k("5"), k("6"), k("next", <Arrow to="right" />, "ins", "Next cell"), k("7"), k("8"), k("9"), k("down", <Arrow to="down" />, "ins", "Next reading"), k(".", ".", "fn"), k("0", "0", "num", undefined, "wide"), BS()];
}
// the stair readings' pad: 1 2 3 ⌫ / 4 5 6 ▲ / 7 8 9 ▼ / c 0 Done Done
export function readingKeys(c: PadKey): PadKey[] {
  return [k("1"), k("2"), k("3"), BS(), k("4"), k("5"), k("6"), k("up", <Arrow to="up" />, "ins", "Level above"), k("7"), k("8"), k("9"), k("down", <Arrow to="down" />, "ins", "Level below"), c, k("0"), k("done", "Done ✓", "go", "Done")];
}
// the stair setup's levels: 1 2 3 ⌫ / 4 5 6 ‹ / 7 8 9 › / Next › 0 Done Done
export function levelKeys(): PadKey[] {
  return [k("1"), k("2"), k("3"), BS(), k("4"), k("5"), k("6"), k("prev", <Arrow to="left" />, "ins", "Previous field"), k("7"), k("8"), k("9"), k("next2", <Arrow to="right" />, "ins", "Next field"), k("next", "Next ›", "fn", "Next"), k("0"), k("done", "Done ✓", "go", "Done")];
}
// a pad with nothing to step to: ⌫ the top half of the right column, Done
// the bottom half; c (".", or a gap) bottom left
export function plainKeys(c: PadKey): PadKey[] {
  return [k("1"), k("2"), k("3"), BS("tall"), k("4"), k("5"), k("6"), k("7"), k("8"), k("9"), k("done", "Done ✓", "go1", "Done", "tall"), c, k("0"), BLANK(9)];
}

export default function NumPad({ tint, head, keys, onKey, testId }: { tint: "spf" | "flow" | "ffcp"; head?: ReactNode; keys: PadKey[]; onKey: (key: string) => void; testId?: string }) {
  // each key presses in and springs back, however quickly it's tapped
  function press(e: ReactPointerEvent<HTMLButtonElement>, key: string) {
    e.preventDefault();
    const el = e.currentTarget;
    el.classList.remove("pressed");
    void el.offsetWidth;
    el.classList.add("pressed");
    swallowClick();
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
            className={`np-key ${p.kind ?? "num"}${p.size ? ` ${p.size}` : ""}`}
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

// A key acts as the finger goes down, so a key that closes the pad (Done)
// has it gone before the finger lifts; the tap's click would then land on
// whatever was under the key (Looks right ✓, Save and continue…). That one
// click is dropped; the next tap anywhere is a tap of its own.
export function swallowClick() {
  const swallow = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    stop();
  };
  const stop = () => {
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("pointerdown", stop, true);
    window.clearTimeout(timer);
  };
  window.addEventListener("click", swallow, true);
  const timer = window.setTimeout(stop, 1500);
  window.setTimeout(() => window.addEventListener("pointerdown", stop, true), 0);
}

// the "Editing" tag in a pad's heading
export function PadTag() {
  return <span className="np-tag">Editing</span>;
}
