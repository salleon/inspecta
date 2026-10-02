import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { FlowKind, FlowTest } from "../db/types";
import { addFlowTest, deleteFlowTest, listFlowTests } from "../db/db";
import { blankThumbSvg, chartSvg, KIND_HINT, KIND_LABEL, newFlowTest, readingCount, summary } from "../lib/flowTest";
import { useBackHandler } from "../lib/backButton";
import ConfirmDialog from "./ConfirmDialog";
import FlowConverter from "./FlowConverter";

// The Flow tests tab of a site (canvas option E1): its flow tests, each
// with a small graph and its result, swipe left to delete; the converter
// tool; and + New flow test, which asks what kind.

const KINDS: FlowKind[] = ["sprinkler", "hydrant", "combined", "blank"];

function formatDay(ms: number) {
  return new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// onExport: the flow test export, above + New flow test (a flow testing
// site's only export; on AFSS / project sites, Export Flow Tests Only)
export default function FlowTestList({ siteId, onCount, onExport, exportLabel = "Export" }: { siteId: string; onCount: (n: number) => void; onExport?: () => void; exportLabel?: string }) {
  const navigate = useNavigate();
  const [tests, setTests] = useState<FlowTest[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<FlowTest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listFlowTests(siteId).then((t) => {
      if (!cancelled) setTests(t);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useBackHandler(() => {
    if (!picking) return false;
    setPicking(false);
    return true;
  });

  async function pick(kind: FlowKind) {
    if (busy) return;
    setBusy(true);
    try {
      const test = await addFlowTest(newFlowTest(siteId, kind));
      navigate(`/site/${siteId}/flow/${test.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const test = confirming;
    if (!test || busy) return;
    setBusy(true);
    try {
      await deleteFlowTest(test.id);
      const left = (tests ?? []).filter((t) => t.id !== test.id);
      setTests(left);
      onCount(left.length);
      setConfirming(null);
      setOpenSwipeId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {tests?.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>No flow tests on this site yet.</div>
        )}
        {tests?.map((t, i) => (
          <FlowRow
            key={t.id}
            test={t}
            index={i}
            swipeOpen={openSwipeId === t.id}
            onSwipeOpen={() => setOpenSwipeId(t.id)}
            onSwipeClose={() => setOpenSwipeId((id) => (id === t.id ? null : id))}
            onOpen={() => navigate(`/site/${siteId}/flow/${t.id}`)}
            onDelete={() => setConfirming(t)}
          />
        ))}
        {!!tests?.length && <div style={{ fontSize: 11.5, color: "var(--muted-2)", textAlign: "center" }}>Swipe a test left to delete it.</div>}
      </div>

      <div style={{ flexShrink: 0, padding: "12px 16px calc(28px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
        <FlowConverter />
        {onExport && !!tests?.length && (
          <button
            onClick={onExport}
            style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid rgba(90,176,255,.55)", background: "rgba(90,176,255,.1)", color: "#5ab0ff", fontSize: 14.5, fontWeight: 800 }}
          >
            {exportLabel}
          </button>
        )}
        <button
          onClick={() => setPicking(true)}
          className="glow-sweep"
          style={{ position: "relative", overflow: "hidden", width: "100%", padding: "17px 0", borderRadius: 14, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 16, fontWeight: 800 }}
        >
          + New flow test
        </button>
      </div>

      {picking && (
        <div className="sheet-backdrop" onClick={() => setPicking(false)} style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end", zIndex: 5 }}>
          <div
            className="sheet-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "22px 20px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>New flow test</div>
            {KINDS.map((k) => (
              <button
                key={k}
                disabled={busy}
                onClick={() => pick(k)}
                style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left", width: "100%", padding: "12px 14px", borderRadius: 14, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <span style={{ fontSize: 14, fontWeight: 800 }}>{KIND_LABEL[k]}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{KIND_HINT[k]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete this flow test?"
          message={`"${confirming.name || "Untitled"}" and its readings will be permanently deleted. This can't be undone.`}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}

// swipe-to-delete, the same feel as the findings and site rows
const SWIPE_REVEAL = 84;
const SWIPE_START_PX = 8;

function FlowRow({
  test,
  index,
  swipeOpen,
  onSwipeOpen,
  onSwipeClose,
  onOpen,
  onDelete,
}: {
  test: FlowTest;
  index: number;
  swipeOpen: boolean;
  onSwipeOpen: () => void;
  onSwipeClose: () => void;
  onOpen: () => void;
  onDelete: () => void;
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

  const v = summary(test);
  const sub =
    test.kind === "blank"
      ? `${test.cells?.length ?? 0} rows · ${test.columns?.length ?? 0} columns · ${formatDay(test.testedAt)}`
      : `${readingCount(test)} readings · ${formatDay(test.testedAt)}`;
  const thumb = test.kind === "blank" ? blankThumbSvg(72, 52) : chartSvg(test, 72, 52, { small: true });

  return (
    <div className="pop-in" style={{ position: "relative", overflow: "hidden", borderRadius: 14, flexShrink: 0, animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      {(dragX < 0 || swipeOpen) && (
        <button
          onClick={onDelete}
          aria-label="Delete flow test"
          style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: SWIPE_REVEAL - 6, border: "none", borderRadius: 14, background: "#ff6b6b", color: "#fff", fontSize: 13, fontWeight: 800 }}
        >
          Delete
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
          borderRadius: 14,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          textAlign: "left",
          transform: `translateX(${dragX}px)`,
          transition: swiping ? "none" : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          touchAction: "pan-y",
        }}
      >
        <div style={{ width: 72, height: 52, flexShrink: 0, borderRadius: 8, background: "var(--bg)", overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: thumb }} />
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{test.name || "Untitled"}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: v.colour }}>{v.text}</div>
        </div>
        <span style={{ color: "var(--muted-2)", fontSize: 18 }}>›</span>
      </button>
    </div>
  );
}
