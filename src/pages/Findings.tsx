import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Finding, Photo, Site } from "../db/types";
import { addPhoto, createFinding, deleteSite, getSite, listFindings, listPhotos, reorderFinding, updateSite } from "../db/db";
import { capturePhoto } from "../lib/capture";
import { IconChevronLeft, IconShare, IconEdit, IconGrip, IconCheck } from "../components/Icons";
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

// One row's measurements + every other row's midpoint, captured once when
// a drag starts. Hit-testing (which slot the pointer is over) always
// compares against these original positions for the rest of the gesture —
// they stay valid as a relative ordering even as the placeholder reflows
// the visible layout, so there's no need to remeasure on every move.
interface DragMeta {
  containerTop: number;
  containerScrollTop: number;
  startClientY: number;
  top: number;
  height: number;
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const rowElsRef = useRef(new Map<string, HTMLButtonElement>());
  const dragMetaRef = useRef<DragMeta | null>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    const urls: string[] = [];

    async function load() {
      const s = await getSite(siteId!);
      const findings = await listFindings(siteId!);
      const built: Row[] = [];
      for (const finding of findings) {
        const photos: Photo[] = await listPhotos(finding.id);
        const first = photos[0];
        const url = first ? URL.createObjectURL(first.blob) : null;
        if (url) urls.push(url);
        built.push({ finding, thumb: url, photoCount: photos.length });
      }
      if (!cancelled) {
        setSite(s ?? null);
        setRows(built);
      }
    }
    load();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [siteId]);

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

    e.currentTarget.setPointerCapture(e.pointerId);

    const containerRect = containerEl.getBoundingClientRect();
    const others = rows
      .filter((_, i) => i !== index)
      .map((r) => {
        const el = rowElsRef.current.get(r.finding.id);
        const mid = el ? el.offsetTop + el.offsetHeight / 2 : 0;
        return { finding: r.finding, mid };
      });

    dragMetaRef.current = {
      containerTop: containerRect.top,
      containerScrollTop: containerEl.scrollTop,
      startClientY: e.clientY,
      top: rowEl.offsetTop,
      height: rowEl.offsetHeight,
      others,
    };

    setDragIndex(index);
    setHoverIndex(index);
    setDragY(0);
  }

  function handleGripMove(e: ReactPointerEvent<HTMLDivElement>) {
    const meta = dragMetaRef.current;
    if (!meta) return;
    const current = e.clientY - meta.containerTop + meta.containerScrollTop;
    const start = meta.startClientY - meta.containerTop + meta.containerScrollTop;
    setDragY(current - start);

    let count = 0;
    for (const other of meta.others) {
      if (current > other.mid) count++;
    }
    setHoverIndex(count);
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

    dragMetaRef.current = null;
    setDragIndex(null);
    setHoverIndex(null);
    setDragY(0);
  }

  const isDraggingRow = dragIndex !== null;
  const others = isDraggingRow ? rows.filter((_, i) => i !== dragIndex) : rows;
  const draggedRow = isDraggingRow ? rows[dragIndex!] : null;
  const draggedMeta = dragMetaRef.current;

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

        {others.map(({ finding, thumb, photoCount }, i) => (
          <>
            {isDraggingRow && hoverIndex === i && draggedMeta && (
              <div style={{ height: draggedMeta.height, border: "1.5px dashed var(--border-strong)", borderRadius: 10, margin: "3px 0" }} />
            )}
            <FindingRow
              key={finding.id}
              finding={finding}
              thumb={thumb}
              photoCount={photoCount}
              index={i}
              reordering={reordering}
              setRowEl={(el) => {
                if (el) rowElsRef.current.set(finding.id, el);
                else rowElsRef.current.delete(finding.id);
              }}
              onOpen={(thumbEl) => openFinding(finding, thumbEl)}
              onEnterReorder={() => setReordering(true)}
              onGripDown={(e) => handleGripDown(rows.findIndex((r) => r.finding.id === finding.id), e)}
              onGripMove={handleGripMove}
              onGripUp={handleGripUp}
            />
          </>
        ))}
        {isDraggingRow && hoverIndex === others.length && draggedMeta && (
          <div style={{ height: draggedMeta.height, border: "1.5px dashed var(--border-strong)", borderRadius: 10, margin: "3px 0" }} />
        )}

        {/* the row being dragged, floating above the rest, following the pointer */}
        {draggedRow && draggedMeta && (
          <div
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              top: draggedMeta.top,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "14px 10px",
              borderRadius: 12,
              background: "var(--panel-2)",
              boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
              border: "1px solid rgba(46,196,182,0.35)",
              transform: `translateY(${dragY}px) scale(1.02)`,
              pointerEvents: "none",
            }}
          >
            <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 10, background: "var(--border-strong)", overflow: "hidden", position: "relative" }}>
              {draggedRow.thumb && <img src={draggedRow.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              {draggedRow.photoCount > 1 && (
                <div style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(7,27,44,0.85)", borderRadius: 4, padding: "1px 4px", fontSize: 9, fontWeight: 800 }}>
                  +{draggedRow.photoCount - 1}
                </div>
              )}
            </div>
            <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {draggedRow.finding.note || "Untitled finding"}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>
                {formatShort(draggedRow.finding.createdAt)}{draggedRow.finding.location ? ` · ${draggedRow.finding.location}` : ""}
              </div>
            </div>
            <div style={{ flexShrink: 0, alignSelf: "stretch", width: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IconGrip size={20} color="var(--accent)" />
            </div>
          </div>
        )}
      </div>

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

  function FindingRow({
    finding,
    thumb,
    photoCount,
    index,
    reordering: rowReordering,
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
          borderBottom: "1px solid var(--border)",
          background: "none",
          border: "none",
          borderBottomWidth: 1,
          textAlign: "left",
          color: "inherit",
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
            {formatShort(finding.createdAt)}{finding.location ? ` · ${finding.location}` : ""}
          </div>
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
            <IconGrip size={20} color="var(--muted-2)" />
          </div>
        ) : (
          <IconEdit style={{ flexShrink: 0, marginTop: 2 }} color="var(--muted-2)" />
        )}
      </button>
    );
  }
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
