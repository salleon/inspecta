import { useEffect, useRef, useState } from "react";

/**
 * Animates a number counting up from its previous value to `value`
 * whenever `value` changes (including the very first render, counting up
 * from 0). Renders as a plain <span> so it drops into existing text.
 */
export default function CountUp({ value, durationMs = 500 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    let raf = 0;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic — quick start, gentle settle
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <>{display}</>;
}
