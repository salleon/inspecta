import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Finding, Photo, Site } from "../db/types";
import { addPhoto, createFinding, deleteSite, getSite, getThumbnail, listFindings, listPhotos, reorderFinding, updateSite } from "../db/db";
import { capturePhoto } from "../lib/capture";
import { IconChevronLeft, IconShare, IconEdit, IconGrip, IconCheck } from "../components/Icons";
import DefectTypePill from "../components/DefectTypePill";
import ConfirmDialog from "../components/ConfirmDialog";
import FormActions from "../components/FormActions";
import RoundIconButton from "../components/RoundIconButton";

interface Row {
  finding: Finding;
  thumb: string | null;
  photoCount: number;
}

function formatShort(ms: number) {
  const d = new Date(ms);
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${min} ${ampm}`;
}

// Hold a row for this long to enter reorder mode.
const LONG_PRESS_MS = 700;
// A finger moving more than this many px before the hold timer fires reads
// as a scroll, not a hold — cancel the timer rather than trigger reorder.
const MOVE_CANCEL_PX = 10;
// Pointer within this many px of the top/bottom of the scrollable list
// triggers auto-scroll while dragging.
const EDGE_ZONE_PX = 56;
// Fastest the list auto-scrolls, in px per animation frame, right at the edge.
const MAX_SCROLL_PX = 16;

// Every OTHER row's original midpoint, captured once when a drag starts —
// these never move (rows stay in normal DOM flow for the whole gesture, only
// visually offset via transform), so hit-testing the live pointer position
// against this fixed snapshot is valid for the whole drag.
interface DragMeta {
  // viewport-space distance from the pointer down to the dragged row's top
  // edge, so the floating ghost can be positioned from raw clientY without
  // needing any "delta from start" bookkeeping.
  grabOffsetY: number;
  rowHeightPx: number;
  others: { finding: Finding; mid: number }[];
}

export default function Findings() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingSite, setEditingSite] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // reorder mode — entered by holding any row for LONG_PRESS_MS
  const [reordering, setReordering] = useState(false);
  // which row (by its index in `rows`) is currently being dragged, and which
  // slot it's currently hovering over — rows never leave the DOM or change
  // order while dragging, only their transform changes, so `rows` itself
  // stays untouched until the drop.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // vertical spacing between two adjacent rows — measured once per drag —
  // used to shift the other rows out of the way by exactly one slot.
  const [slotHeight, setSlotHeight] = useState(0);
  // the floating "ghost" card that visually represents the row being
  // dragged — a position:fixed overlay driven by viewport coordinates, kept
  // entirely separate from the real (invisible-but-interactive) row so it
  // can never affect the scrollable list's content size. See handleGripDown
  // for why the real row can't just grow a transform to follow the finger.
  const [ghostRect, setGhostRect] = useState<{ left: number; width: number; height: number } | null>(null);
  const [ghostTop, setGhostTop] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const rowElsRef = useRef(new Map<string, HTMLButtonElement>());
  const dragMetaRef = useRef<DragMeta | null>(null);
  const lastClientYRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    const urls: string[] = [];

    async function load() {
      const s = await getSite(siteId!);
      const findings = await listFindings(siteId!);
      const built: Row[] = [];
      const firstPhotos: Photo[] = [];
      for (const finding of findings) {
        const photos: Photo[] = await listPhotos(finding.id);
        if (photos[0]) firstPhotos.push(photos[0]);
        built.push({ finding, thumb: null, photoCount: photos.length });
      }
      if (cancelled) return;
      setSite(s ?? null);
      setRows(built);

      // Then the thumbnails, one at a time (small saved copies — see
      // lib/thumbnail; older photos get theirs made here on first view,
      // one by one so the phone never decodes a pile of full photos at once)
      for (const photo of firstPhotos) {
        const thumb = await getThumbnail(photo).catch(() => null);
        if (cancelled) return;
        if (!thumb) continue;
        const url = URL.createObjectURL(thumb);
        urls.push(url);
        setRows((prev) => prev.map((r) => (r.finding.id === photo.findingId ? { ...r, thumb: url } : r)));
      }
    }
    load();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [siteId]);

  // Stop any in-flight auto-scroll loop on unmount.
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  if (!siteId) return null;

  function openEditSite() {
    setEditName(site?.name ?? "");
    setEditAddress(site?.address ?? "");
    setEditingSite(true);
  }

  async function handleSaveSite(e: FormEvent) {
    e.preventDefault();
    if (!siteId) return;
    const name = editName.trim();
    if (!name) return;
    await updateSite(siteId, { name, address: editAddress.trim() });
    setSite((s) => (s ? { ...s, name, address: editAddress.trim() } : s));
    setEditingSite(false);
  }

  async function handleDeleteSite() {
    if (!siteId || deleting) return;
    setDeleting(true);
    try {
      await deleteSite(siteId);
      navigate("/");
    } finally {
      setDeleting(false);
    }
  }

  // Launches the native camera straight away — no intermediate screen.
  // Cancelling leaves you right where you were, on this list.
  async function handleNewFinding() {
    if (!siteId || busy || reordering) return;
    setBusy(true);
    try {
      const blob = await capturePhoto();
      if (!blob) return; // cancelled
      const finding = await createFinding(siteId);
      await addPhoto(finding.id, siteId, blob);
      navigate(`/site/${siteId}/finding/${finding.id}/note`);
    } finally {
      setBusy(false);
    }
  }

  function openFinding(finding: Finding, thumbEl: HTMLElement | null) {
    const r = thumbEl?.getBoundingClientRect();
    navigate(`/site/${siteId}/finding/${finding.id}/note`, {
      state: r ? { photoRect: { top: r.top, left: r.left, width: r.width, height: r.height } } : undefined,
    });
  }

  function handleGripDown(index: number, e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    const row = rows[index];
    const rowEl = rowElsRef.current.get(row.finding.id);
    const containerEl = listRef.current;
    if (!rowEl || !containerEl) return;

    // Capture on the grip itself, and — crucially — this row (and its grip)
    // stays mounted in the DOM for the whole gesture, so this capture and
    // these listeners are never torn out from under the drag.
    e.currentTarget.setPointerCapture(e.pointerId);

    const others = rows
      .filter((_, i) => i !== index)
      .map((r) => {
        const el = rowElsRef.current.get(r.finding.id);
        const mid = el ? el.offsetTop + el.offsetHeight / 2 : 0;
        return { finding: r.finding, mid };
      });

    // Spacing between adjacent rows, measured from a real neighbour so it
    // includes any border/margin — falls back to this row's own height if
    // it's the only one.
    const neighbourEl = rowElsRef.current.get(rows[index + 1]?.finding.id ?? rows[index - 1]?.finding.id ?? "");
    const measuredSlot = neighbourEl ? Math.abs(neighbourEl.offsetTop - rowEl.offsetTop) : rowEl.offsetHeight;

    // The real row stays exactly where it is — in normal flow, at its
    // original size — for the whole gesture: that's what keeps its pointer
    // capture alive and keeps its siblings' layout from reflowing under it.
    // It just turns invisible. The visible "lifted" card the finger actually
    // drags is a separate position:fixed ghost, positioned from raw
    // viewport coordinates below. Giving the REAL row a growing translateY
    // instead (an earlier version of this did) looks equivalent at first,
    // but CSS transform on an in-flow element still counts toward its
    // scrolling ancestor's scrollHeight — so as auto-scroll pushed that
    // transform larger, scrollHeight kept growing to match, which let
    // auto-scroll go further still: a runaway feedback loop that scrolled
    // the list into empty space. The fixed-position ghost sidesteps that
    // entirely, since out-of-flow elements don't contribute to it.
    const rowRect = rowEl.getBoundingClientRect();

    dragMetaRef.current = {
      grabOffsetY: e.clientY - rowRect.top,
      rowHeightPx: rowRect.height,
      others,
    };
    lastClientYRef.current = e.clientY;

    setDragIndex(index);
    setHoverIndex(index);
    setSlotHeight(measuredSlot || rowEl.offsetHeight);
    setGhostRect({ left: rowRect.left, width: rowRect.width, height: rowRect.height });
    setGhostTop(rowRect.top);

    if (rafIdRef.current === null) rafIdRef.current = requestAnimationFrame(autoScrollTick);
  }

  function handleGripMove(e: ReactPointerEvent<HTMLDivElement>) {
    // Just record the latest pointer position — the rAF loop (running for
    // the whole gesture) does the actual position/auto-scroll math every
    // frame, so dragging stays smooth even when the finger holds still near
    // an edge and only the auto-scroll is moving things.
    lastClientYRef.current = e.clientY;
  }

  // Runs every animation frame for the duration of a drag. Reads only refs
  // (never component state) so it never goes stale across renders.
  function autoScrollTick() {
    const meta = dragMetaRef.current;
    const containerEl = listRef.current;
    if (!meta || !containerEl) {
      rafIdRef.current = null;
      return;
    }

    const rect = containerEl.getBoundingClientRect();
    const clientY = lastClientYRef.current;

    if (clientY < rect.top + EDGE_ZONE_PX && containerEl.scrollTop > 0) {
      const intensity = Math.min(1, (rect.top + EDGE_ZONE_PX - clientY) / EDGE_ZONE_PX);
      containerEl.scrollTop = Math.max(0, containerEl.scrollTop - MAX_SCROLL_PX * intensity);
    } else if (
      clientY > rect.bottom - EDGE_ZONE_PX &&
      containerEl.scrollTop < containerEl.scrollHeight - containerEl.clientHeight
    ) {
      const intensity = Math.min(1, (clientY - (rect.bottom - EDGE_ZONE_PX)) / EDGE_ZONE_PX);
      containerEl.scrollTop = Math.min(
        containerEl.scrollHeight - containerEl.clientHeight,
        containerEl.scrollTop + MAX_SCROLL_PX * intensity,
      );
    }

    // Content-space Y (same space `offsetTop` lives in) — reading scrollTop
    // fresh here, rather than a value snapshotted at drag-start, is what
    // makes hit-testing track correctly through auto-scroll.
    const contentY = clientY - rect.top + containerEl.scrollTop;
    let count = 0;
    for (const other of meta.others) {
      if (contentY > other.mid) count++;
    }
    setHoverIndex(count);

    // The ghost's position is plain viewport math — clientY minus the
    // original grab offset — clamped so it can't visually escape the list
    // into the top/bottom bars.
    const rawTop = clientY - meta.grabOffsetY;
    const minTop = rect.top;
    const maxTop = rect.bottom - meta.rowHeightPx;
    setGhostTop(Math.min(maxTop, Math.max(minTop, rawTop)));

    rafIdRef.current = requestAnimationFrame(autoScrollTick);
  }

  function handleGripUp() {
    const meta = dragMetaRef.current;
    if (meta && dragIndex !== null) {
      const finalIndex = hoverIndex ?? dragIndex;
      const draggedFinding = rows[dragIndex].finding;
      const prevOrder = meta.others[finalIndex - 1]?.finding.order;
      const nextOrder = meta.others[finalIndex]?.finding.order;

      let newOrder = draggedFinding.order;
      if (prevOrder !== undefined && nextOrder !== undefined) newOrder = (prevOrder + nextOrder) / 2;
      else if (prevOrder !== undefined) newOrder = prevOrder + 1;
      else if (nextOrder !== undefined) newOrder = nextOrder - 1;

      if (newOrder !== draggedFinding.order) {
        reorderFinding(draggedFinding.id, newOrder).catch((err) => console.error("Failed to save finding order", err));
        setRows((prev) =>
          prev
            .map((r) => (r.finding.id === draggedFinding.id ? { ...r, finding: { ...r.finding, order: newOrder } } : r))
            .sort((a, b) => a.finding.order - b.finding.order),
        );
      }
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    dragMetaRef.current = null;
    setDragIndex(null);
    setHoverIndex(null);
    setSlotHeight(0);
    setGhostRect(null);
  }

  // How far (in slots) row `i` should visually shift to make room for the
  // dragged row passing over it. Rows between the drag's start and current
  // hover position shift by exactly one slot, opposite the drag direction.
  function shiftSlotsFor(i: number): number {
    if (dragIndex === null || hoverIndex === null || i === dragIndex) return 0;
    if (hoverIndex > dragIndex) {
      if (i > dragIndex && i <= hoverIndex) return -1;
    } else if (hoverIndex < dragIndex) {
      if (i >= hoverIndex && i < dragIndex) return 1;
    }
    return 0;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, height: 64, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <RoundIconButton ariaLabel="Back to sites" onClick={() => navigate("/")}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <button
          onClick={openEditSite}
          aria-label="Edit site"
          style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 6, color: "inherit", padding: "4px 6px" }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Findings</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{site?.name ?? ""}</div>
          </div>
          <IconEdit size={13} color="var(--muted-2)" />
        </button>
        <RoundIconButton ariaLabel="Export PDF" onClick={() => navigate(`/site/${siteId}/export`)}>
          <IconShare />
        </RoundIconButton>
      </div>

      {/* list */}
      <div ref={listRef} style={{ flexGrow: 1, overflowY: "auto", padding: "4px 16px 12px", display: "flex", flexDirection: "column", position: "relative" }}>
        {rows.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>
            No findings yet — tap + New finding to log your first one.
          </div>
        )}

        {rows.map(({ finding, thumb, photoCount }, i) => {
          const isDragged = dragIndex === i;
          const shiftPx = isDragged ? 0 : shiftSlotsFor(i) * slotHeight;
          return (
            <FindingRow
              key={finding.id}
              finding={finding}
              thumb={thumb}
              photoCount={photoCount}
              index={i}
              reordering={reordering}
              isDragged={isDragged}
              offsetY={shiftPx}
              setRowEl={(el) => {
                if (el) rowElsRef.current.set(finding.id, el);
                else rowElsRef.current.delete(finding.id);
              }}
              onOpen={(thumbEl) => openFinding(finding, thumbEl)}
              onEnterReorder={() => setReordering(true)}
              onGripDown={(e) => handleGripDown(i, e)}
              onGripMove={handleGripMove}
              onGripUp={handleGripUp}
            />
          );
        })}
      </div>

      {/* the floating "lifted" card that visually represents whichever row
          is being dragged — see the comment in handleGripDown for why this
          has to be a separate fixed overlay rather than a transform on the
          real row. */}
      {dragIndex !== null && ghostRect && (
        <div
          style={{
            position: "fixed",
            left: ghostRect.left,
            width: ghostRect.width,
            top: ghostTop,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            padding: "14px 10px",
            borderRadius: 12,
            background: "var(--panel-2)",
            boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
            outline: "1px solid rgba(46,196,182,0.35)",
            outlineOffset: -1,
            transform: "scale(1.02)",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 10, background: "var(--border-strong)", overflow: "hidden", position: "relative" }}>
            {rows[dragIndex].thumb && <img src={rows[dragIndex].thumb!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            {rows[dragIndex].photoCount > 1 && (
              <div style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(7,27,44,0.85)", borderRadius: 4, padding: "1px 4px", fontSize: 9, fontWeight: 800 }}>
                +{rows[dragIndex].photoCount - 1}
              </div>
            )}
          </div>
          <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {rows[dragIndex].finding.note || "Untitled finding"}
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>
              {formatShort(rows[dragIndex].finding.createdAt)}{rows[dragIndex].finding.location ? ` · ${rows[dragIndex].finding.location}` : ""}
            </div>
          </div>
          <div style={{ flexShrink: 0, alignSelf: "stretch", width: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconGrip size={20} color="var(--accent)" />
          </div>
        </div>
      )}

      {/* bottom action — "+ New finding" and "Confirm order" occupy the
          same slot and cross-slide: New finding slides out the bottom as
          reorder mode is entered, Confirm order slides up from below to
          replace it, and it reverses on exit. */}
      <div style={{ flexShrink: 0, padding: "12px 16px calc(28px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)" }}>
        <div style={{ position: "relative", height: 54, overflow: "hidden" }}>
          <button
            onClick={handleNewFinding}
            disabled={busy || reordering}
            className="glow-sweep"
            style={{
              position: "absolute",
              inset: 0,
              display: "block",
              width: "100%",
              textAlign: "center",
              padding: "17px 0",
              borderRadius: 14,
              background: "var(--accent)",
              border: "none",
              fontSize: 16,
              fontWeight: 800,
              color: "var(--accent-text)",
              overflow: "hidden",
              transform: `translateY(${reordering ? "120%" : "0"})`,
              transition: "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
              pointerEvents: reordering ? "none" : "auto",
            }}
          >
            {busy ? "Opening camera…" : "+ New finding"}
          </button>
          <button
            type="button"
            onClick={() => setReordering(false)}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              textAlign: "center",
              padding: "17px 0",
              borderRadius: 14,
              background: "var(--accent)",
              border: "none",
              fontSize: 16,
              fontWeight: 800,
              color: "var(--accent-text)",
              transform: `translateY(${reordering ? "0" : "120%"})`,
              transition: "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
              pointerEvents: reordering ? "auto" : "none",
            }}
          >
            <IconCheck size={18} strokeWidth={2.8} color="var(--accent-text)" />
            Confirm order
          </button>
        </div>
      </div>

      {editingSite && (
        <div
          className="sheet-backdrop"
          style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setEditingSite(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveSite}
            className="sheet-panel"
            style={{ width: "100%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "22px 20px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={{ fontSize: 16, fontWeight: 800 }}>Edit site</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>Site name</div>
              <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>Address</div>
              <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} style={inputStyle} />
            </div>
            <FormActions onCancel={() => setEditingSite(false)} />

            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              style={{ textAlign: "center", padding: "13px 0", borderRadius: 12, background: "none", border: "none", fontSize: 14, fontWeight: 700, color: "#ff6b6b" }}
            >
              Delete site
            </button>
          </form>
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Are you sure?"
          message={`"${site?.name}" and all of its findings and photos will be permanently deleted. This can't be undone.`}
          busy={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleDeleteSite}
        />
      )}
    </div>
  );
}

// Hoisted to module scope deliberately — if this were a nested function
// declared inside Findings(), React would see a brand-new component type on
// every single re-render (every dragY/hoverIndex update, which fires ~60
// times a second from the auto-scroll loop while dragging). That forces a
// full unmount+remount of every row on every frame, which (a) destroys the
// dragged grip's pointer capture mid-gesture — the root cause of drags
// getting permanently stuck — and (b) restarts the .pop-in entrance
// animation, producing a fade/scale glitch instead of a smooth drag. Keeping
// this at module scope gives it a stable identity across renders, so React
// only updates props on the existing DOM nodes instead of recreating them.
function FindingRow({
  finding,
  thumb,
  photoCount,
  index,
  reordering: rowReordering,
  isDragged,
  offsetY,
  setRowEl,
  onOpen,
  onEnterReorder,
  onGripDown,
  onGripMove,
  onGripUp,
}: {
  finding: Finding;
  thumb: string | null;
  photoCount: number;
  index: number;
  reordering: boolean;
  isDragged: boolean;
  offsetY: number;
  setRowEl: (el: HTMLButtonElement | null) => void;
  onOpen: (thumbEl: HTMLElement | null) => void;
  onEnterReorder: () => void;
  onGripDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onGripMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onGripUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const holdTimer = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  function cancelHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (rowReordering) return; // already in reorder mode — nothing new to start
    startPos.current = { x: e.clientX, y: e.clientY };
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      onEnterReorder();
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (holdTimer.current === null) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) cancelHold();
  }

  return (
    <button
      ref={setRowEl}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onClick={(e) => {
        if (rowReordering) return;
        const thumbEl = e.currentTarget.querySelector<HTMLElement>("[data-thumb]");
        onOpen(thumbEl);
      }}
      className="pop-in"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "14px 0",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--border)",
        textAlign: "left",
        color: "inherit",
        position: "relative",
        // The dragged row stays in its normal flow slot the whole gesture
        // (see handleGripDown for why) and just turns invisible — the
        // visible "lifted" card is a separate fixed-position ghost overlay.
        opacity: isDragged ? 0 : 1,
        transform: `translateY(${offsetY}px)`,
        transition: isDragged ? "none" : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        animationDelay: `${Math.min(index, 8) * 35}ms`,
      }}
    >
      <div data-thumb style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 10, background: "var(--panel-2)", overflow: "hidden", position: "relative" }}>
        {thumb && <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        {photoCount > 1 && (
          <div style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(7,27,44,0.85)", borderRadius: 4, padding: "1px 4px", fontSize: 9, fontWeight: 800 }}>
            +{photoCount - 1}
          </div>
        )}
      </div>
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {finding.note || "Untitled finding"}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>
          {formatShort(finding.createdAt)}
          {finding.level && <> · <b style={{ fontWeight: 700, color: "var(--text)" }}>{finding.level}</b></>}
          {finding.location ? ` · ${finding.location}` : ""}
        </div>
        <DefectTypePill type={finding.defectType} size="sm" />
      </div>
      {rowReordering ? (
        <div
          className="grip-in"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          style={{ flexShrink: 0, alignSelf: "stretch", width: 26, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}
        >
          <IconGrip size={20} color={isDragged ? "var(--accent)" : "var(--muted-2)"} />
        </div>
      ) : (
        <IconEdit style={{ flexShrink: 0, marginTop: 2 }} color="var(--muted-2)" />
      )}
    </button>
  );
}

const inputStyle = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "13px 14px",
  color: "var(--text)",
  fontSize: 15,
  fontWeight: 600,
  outline: "none",
} as const;
