import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import NumPad, { k, numberKeys } from "./NumPad";

// The flow test's number cells on the upright page (design canvas FlowPads):
// tapping one brings up the blue pad instead of the phone's keyboard. It
// says which reading and column it is; ‹ › step to the cell before or after
// (along the row, then on to the next reading); Done ✓ or Hide closes it.
// Every number box in `scope` is taken over: inputMode decimal or numeric.
// The full screen keeps its own keypad.

const PAD_SPACE = 360;

export default function CellPad({ scope }: { scope: RefObject<HTMLElement | null> }) {
  const [cell, setCell] = useState<HTMLInputElement | null>(null);

  // the phone's keyboard stays away from every number box (new rows too)
  useLayoutEffect(() => {
    scope.current?.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"], input[inputmode="numeric"]').forEach((el) => {
      el.dataset.pad = "1";
      el.inputMode = "none";
    });
  });

  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const onIn = (e: FocusEvent) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.dataset.pad && !el.closest(".wide-grid")) setCell(el);
    };
    // gone when something else takes the focus (the pad's keys never do)
    const onOut = () =>
      window.setTimeout(() => {
        const a = document.activeElement;
        if (!(a instanceof HTMLInputElement && a.dataset.pad && root.contains(a))) setCell(null);
      }, 0);
    root.addEventListener("focusin", onIn);
    root.addEventListener("focusout", onOut);
    return () => {
      root.removeEventListener("focusin", onIn);
      root.removeEventListener("focusout", onOut);
    };
  }, [scope]);

  // room under the page for the pad, and the cell kept above it
  useLayoutEffect(() => {
    const root = scope.current;
    if (!root || !cell) return;
    const before = root.style.paddingBottom;
    root.style.paddingBottom = `${PAD_SPACE}px`;
    const box = root.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    const limit = box.bottom - PAD_SPACE + 20;
    if (r.bottom > limit) root.scrollTop += r.bottom - limit + 12;
    else if (r.top < box.top + 8) root.scrollTop -= box.top + 8 - r.top;
    return () => {
      root.style.paddingBottom = before;
    };
  }, [cell, scope]);

  if (!cell) return null;
  const where = cell.closest<HTMLElement>("[data-pad-where]")?.dataset.padWhere;
  const what = cell.getAttribute("aria-label") ?? "";

  function key(key: string) {
    if (!cell) return;
    if (key === "done") {
      cell.blur();
      setCell(null);
      return;
    }
    if (key === "prev" || key === "next") {
      const all = [...(scope.current?.querySelectorAll<HTMLInputElement>("input[data-pad]") ?? [])].filter((el) => el.offsetParent && !el.closest(".wide-grid"));
      const next = all[all.indexOf(cell) + (key === "next" ? 1 : -1)];
      next?.focus({ preventScroll: true });
      return;
    }
    // into the cell as if typed, so the cell's own rules apply
    let v = cell.value;
    if (key === "bs") v = v.slice(0, -1);
    else if (key === "." && v.includes(".")) return;
    else if (v.length < 9) v += key;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(cell, v);
    cell.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return (
    <NumPad
      tint="flow"
      testId="cell-pad"
      head={
        <>
          <div style={{ minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {where && <b style={{ color: "var(--text)", fontSize: 14 }}>{where}</b>}
            {where ? " · " : ""}
            {what}
          </div>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              key("done");
            }}
            style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#8cc8ff", background: "none", border: "1px solid rgba(90,176,255,.4)", borderRadius: 999, padding: "4px 10px" }}
          >
            Hide ▾
          </button>
        </>
      }
      keys={numberKeys(k("prev", "‹", "ins", "Previous cell"), k("next", "›", "ins", "Next cell"), k(".", ".", "fn"))}
      onKey={key}
    />
  );
}
