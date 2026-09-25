import { useEffect } from "react";

// Keeps whatever text field you're typing in visible above the on-screen
// keyboard, app-wide.
//
// On Android, Capacitor shrinks the WebView by the keyboard's height when
// it opens. The browser's own scroll-into-view isn't enough here: focusing
// a field on the finding screen also collapses the photo (and the Level
// field shows its quick buttons), so the layout moves after the browser
// has already decided where to scroll, and the field ends up under the
// keyboard. So after focus, and again whenever the visible area resizes
// (the keyboard sliding up), re-check the focused field and scroll its
// nearest scrolling container just enough to centre it in what's visible.
//
// A field can mark a larger block to keep in view with a
// `data-keep-visible` ancestor (e.g. the Level box plus its quick buttons).

const EDGE = 12; // px of breathing room from the keyboard / container edges

function isTextField(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "file", "submit", "reset", "color"].includes(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

function reveal() {
  const field = document.activeElement;
  if (!isTextField(field)) return;
  const target = (field.closest("[data-keep-visible]") as HTMLElement | null) ?? field;
  const container = scrollParent(target);
  if (!container) return; // not in a scrolling area (e.g. a bottom sheet) — nothing to adjust

  const viewportBottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
  const box = container.getBoundingClientRect();
  const top = Math.max(box.top, 0) + EDGE;
  const bottom = Math.min(box.bottom, viewportBottom) - EDGE;
  if (bottom <= top) return;

  const r = target.getBoundingClientRect();
  if (r.top >= top && r.bottom <= bottom) return; // already fully visible — don't jump around

  // centre it in the visible part; if it's taller than that, show its top
  const delta = r.height > bottom - top ? r.top - top : r.top + r.height / 2 - (top + bottom) / 2;
  container.scrollTop += delta;
}

// Several passes: the keyboard animates in and the layout settles over a
// few hundred ms, and the final resize can land at any point in that.
let timers: number[] = [];
function scheduleReveal() {
  timers.forEach((t) => clearTimeout(t));
  timers = [0, 120, 320, 600].map((ms) => window.setTimeout(reveal, ms));
}

export function useKeepFocusedFieldVisible() {
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      if (isTextField(e.target as Element)) scheduleReveal();
    };
    const onResize = () => {
      if (isTextField(document.activeElement)) scheduleReveal();
    };
    document.addEventListener("focusin", onFocus);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);
}
