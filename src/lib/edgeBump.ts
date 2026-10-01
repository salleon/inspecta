import { useEffect, type RefObject } from "react";

// A small bump when a list is scrolled to its top or bottom: it nudges a
// few pixels past the end and settles back (index.css .bump-top /
// .bump-bottom). Fires when a scroll lands on an end, or when the finger
// keeps pulling (or the wheel keeps turning) at an end.
const PULL = 12; // px of pull at an end before it bumps
const GAP_MS = 450; // at most one bump this often

export function useEdgeBump(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = 0;
    let prevTop = el.scrollTop;
    let startY: number | null = null;
    let pulled = false;
    const max = () => el.scrollHeight - el.clientHeight;
    const bump = (end: "top" | "bottom") => {
      const now = performance.now();
      if (now - last < GAP_MS) return;
      last = now;
      el.classList.remove("bump-top", "bump-bottom");
      void el.offsetWidth; // restart the animation
      el.classList.add(`bump-${end}`);
    };
    const onEnd = () => el.classList.remove("bump-top", "bump-bottom");
    const onScroll = () => {
      const top = el.scrollTop;
      if (top <= 0 && prevTop > 0) bump("top");
      else if (top >= max() - 1 && prevTop < max() - 1 && max() > 0) bump("bottom");
      prevTop = top;
    };
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      pulled = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY === null || pulled) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > PULL && el.scrollTop <= 0) {
        pulled = true;
        bump("top");
      } else if (dy < -PULL && el.scrollTop >= max() - 1) {
        pulled = true;
        bump("bottom");
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && el.scrollTop <= 0) bump("top");
      else if (e.deltaY > 0 && el.scrollTop >= max() - 1) bump("bottom");
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("animationend", onEnd);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("animationend", onEnd);
    };
  }, [ref]);
}
