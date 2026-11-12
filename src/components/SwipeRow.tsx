import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

// Swipe-to-delete, the same feel everywhere (the findings, site and test
// rows): drag a row left to reveal its red button, tap the row to open it
// (or to close the reveal). What the button does, and asking first, is the
// caller's.
const SWIPE_REVEAL = 84;
const SWIPE_START_PX = 8;

export default function SwipeRow({
  index = 0,
  label,
  action = "Delete",
  swipeOpen,
  onSwipeOpen,
  onSwipeClose,
  onOpen,
  onDelete,
  children,
  rowStyle,
  chevron = true,
  radius = 14,
}: {
  index?: number;
  label: string;
  action?: string; // the red button's word
  swipeOpen: boolean;
  onSwipeOpen: () => void;
  onSwipeClose: () => void;
  onOpen: () => void;
  onDelete: () => void;
  children: ReactNode;
  rowStyle?: CSSProperties; // the row's own look, over the default
  chevron?: boolean;
  radius?: number;
}) {
  const [dragX, setDragX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const start = useRef({ x: 0, y: 0, offset: 0 });
  const moved = useRef(false);

  useEffect(() => {
    setDragX(swipeOpen ? -SWIPE_REVEAL : 0);
  }, [swipeOpen]);

  function down(e: ReactPointerEvent<HTMLButtonElement>) {
    start.current = { x: e.clientX, y: e.clientY, offset: swipeOpen ? -SWIPE_REVEAL : 0 };
    moved.current = false;
  }
  function move(e: ReactPointerEvent<HTMLButtonElement>) {
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!swiping) {
      if (Math.abs(dx) > SWIPE_START_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
        setSwiping(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else return;
    }
    moved.current = true;
    setDragX(Math.min(0, Math.max(-SWIPE_REVEAL, start.current.offset + dx)));
  }
  function end() {
    if (!swiping) return;
    setSwiping(false);
    setDragX((x) => {
      if (x <= -SWIPE_REVEAL / 2) {
        onSwipeOpen();
        return -SWIPE_REVEAL;
      }
      onSwipeClose();
      return 0;
    });
  }

  return (
    <div className="pop-in" style={{ position: "relative", overflow: "hidden", borderRadius: radius, flexShrink: 0, animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      {(dragX < 0 || swipeOpen) && (
        <button onClick={onDelete} aria-label={label} style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: SWIPE_REVEAL - 6, border: "none", borderRadius: radius, background: "#ff6b6b", color: "#fff", fontSize: 13, fontWeight: 800 }}>
          {action}
        </button>
      )}
      <button
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={() => {
          if (moved.current) return;
          if (swipeOpen) onSwipeClose();
          else onOpen();
        }}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "12px 14px",
          borderRadius: radius,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          textAlign: "left",
          ...rowStyle,
          transform: `translateX(${dragX}px)`,
          transition: swiping ? "none" : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          touchAction: "pan-y",
        }}
      >
        {children}
        {chevron && <span style={{ color: "var(--muted-2)", fontSize: 18 }}>›</span>}
      </button>
    </div>
  );
}
