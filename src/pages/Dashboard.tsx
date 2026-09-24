import { useEffect, useRef, useState, type FormEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Site, SiteKind } from "../db/types";
import { createSite, deleteSite, findingCount, listSites } from "../db/db";
import { IconSearch, IconBuilding, IconPlus, IconTrash, IconSettings, IconChevronRight } from "../components/Icons";
import CountUp from "../components/CountUp";
import ConfirmDialog from "../components/ConfirmDialog";
import FormActions from "../components/FormActions";
import logo from "../assets/logo.png";
import { getInitials, getInspectorName, setInspectorName } from "../lib/profile";
import { setAdvancedControls, useAdvancedControls } from "../lib/settings";

interface SiteRow extends Site {
  findings: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<SiteKind>("afss");
  const [inspectorName, setInspectorNameState] = useState(() => getInspectorName());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<SiteRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const advancedControls = useAdvancedControls();

  async function refresh() {
    const list = await listSites();
    const withCounts = await Promise.all(
      list.map(async (s) => ({ ...s, findings: await findingCount(s.id) })),
    );
    setSites(withCounts);
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.address.toLowerCase().includes(query.toLowerCase()),
  );
  const afssSites = filtered.filter((s) => s.kind === "afss");
  const projectSites = filtered.filter((s) => s.kind === "project");

  function openEditName() {
    setSettingsOpen(false);
    setNameDraft(inspectorName);
    setEditingName(true);
  }

  function handleSaveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setInspectorName(trimmed);
    setInspectorNameState(trimmed);
    setEditingName(false);
  }

  async function handleDeleteSite() {
    if (!confirmDeleteSite || deleting) return;
    setDeleting(true);
    try {
      await deleteSite(confirmDeleteSite.id);
      setConfirmDeleteSite(null);
      setOpenSwipeId(null);
      await refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddSite(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const site = await createSite(name.trim(), address.trim(), kind);
    setAdding(false);
    setName("");
    setAddress("");
    setKind("afss");
    navigate(`/site/${site.id}/findings`);
  }

  // AFSS and Projects sections render identically — only the label and the
  // filtered list differ.
  function renderSiteGroup(label: string, group: SiteRow[]) {
    if (group.length === 0) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={sectionHeaderStyle}>{label}</div>
        {group.map((site, i) => (
          <SiteButton
            key={site.id}
            site={site}
            index={i}
            onClick={() => navigate(`/site/${site.id}/findings`)}
            isOpen={openSwipeId === site.id}
            onOpen={() => setOpenSwipeId(site.id)}
            onClose={() => setOpenSwipeId((id) => (id === site.id ? null : id))}
            onDelete={() => setConfirmDeleteSite(site)}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, padding: "20px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={logo} alt="Inspecta by EnFact" style={{ width: 34, height: 34, borderRadius: 9, display: "block" }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.2 }}>Inspecta</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: 0.4 }}>BY ENFACT</span>
          </div>
        </div>
        <button
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
          style={{ position: "relative", width: 38, height: 38, background: "none", border: "none", padding: 0 }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {initials()}
          </div>
          <div
            style={{
              position: "absolute",
              bottom: -3,
              right: -3,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "var(--accent)",
              border: "2px solid var(--bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconSettings size={10} strokeWidth={2.6} color="var(--accent-text)" />
          </div>
        </button>
      </div>

      {/* search */}
      <div style={{ flexShrink: 0, padding: "4px 20px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "11px 14px",
          }}
        >
          <IconSearch color="var(--muted)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites"
            style={{
              flexGrow: 1,
              minWidth: 0,
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: 14,
              fontWeight: 500,
            }}
          />
        </div>
      </div>

      {/* site list */}
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 22 }}>
        {filtered.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>
            {sites.length === 0 ? "No sites yet — tap + to start your first inspection." : "No sites match your search."}
          </div>
        )}
        {renderSiteGroup("AFSS", afssSites)}
        {renderSiteGroup("Projects", projectSites)}
      </div>

      {/* new site fab */}
      <button
        aria-label="Start new site inspection"
        onClick={() => setAdding(true)}
        className={`glow-sweep${sites.length === 0 ? " fab-pulse" : ""}`}
        style={{
          position: "absolute",
          right: 20,
          bottom: "calc(28px + env(safe-area-inset-bottom))",
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "var(--accent)",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <IconPlus size={24} color="var(--accent-text)" strokeWidth={2.4} />
      </button>

      {adding && (
        <div
          className="sheet-backdrop"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10,11,13,0.6)",
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setAdding(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddSite}
            className="sheet-panel"
            style={{
              width: "100%",
              background: "var(--panel)",
              borderRadius: "20px 20px 0 0",
              padding: "22px 20px calc(28px + env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800 }}>New site</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setKind("afss")}
                style={kindToggleStyle(kind === "afss")}
              >
                AFSS
              </button>
              <button
                type="button"
                onClick={() => setKind("project")}
                style={kindToggleStyle(kind === "project")}
              >
                Projects
              </button>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Site name"
              style={inputStyle}
            />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address (optional)"
              style={inputStyle}
            />
            <button
              type="submit"
              className="glow-sweep"
              style={{
                position: "relative",
                display: "block",
                textAlign: "center",
                padding: "16px 0",
                borderRadius: 14,
                background: "var(--accent)",
                border: "none",
                fontSize: 15,
                fontWeight: 800,
                color: "var(--accent-text)",
                overflow: "hidden",
              }}
            >
              Start inspection
            </button>
          </form>
        </div>
      )}

      {settingsOpen && (
        <div
          className="sheet-backdrop"
          style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sheet-panel"
            style={{ width: "100%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "22px 20px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={{ fontSize: 16, fontWeight: 800 }}>Settings</div>
            <button type="button" onClick={openEditName} style={settingsRowStyle}>
              <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Your name</span>
                <span style={settingsRowHintStyle}>{inspectorName || "Not set"}</span>
              </div>
              <IconChevronRight color="var(--muted)" />
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={advancedControls}
              onClick={() => setAdvancedControls(!advancedControls)}
              style={settingsRowStyle}
            >
              <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Advanced controls</span>
                <span style={settingsRowHintStyle}>Show extra menus for more detailed data entry.</span>
              </div>
              <Switch on={advancedControls} />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              style={{ textAlign: "center", padding: "14px 0", borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, color: "var(--text)", marginTop: 4 }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {editingName && (
        <div
          className="sheet-backdrop"
          style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setEditingName(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveName}
            className="sheet-panel"
            style={{ width: "100%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "22px 20px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={{ fontSize: 16, fontWeight: 800 }}>Your name</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", lineHeight: 1.5, marginTop: -8 }}>
              Used for the avatar above and to label your PDF reports.
            </div>
            <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} style={inputStyle} />
            <FormActions onCancel={() => setEditingName(false)} />
          </form>
        </div>
      )}

      {confirmDeleteSite && (
        <ConfirmDialog
          title="Are you sure?"
          message={`"${confirmDeleteSite.name}" and all of its findings and photos will be permanently deleted. This can't be undone.`}
          busy={deleting}
          onCancel={() => setConfirmDeleteSite(null)}
          onConfirm={handleDeleteSite}
        />
      )}
    </div>
  );

  function initials() {
    return getInitials(inspectorName) || "?";
  }
}

const inputStyle: CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "13px 14px",
  color: "var(--text)",
  fontSize: 15,
  fontWeight: 500,
  outline: "none",
};

const settingsRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "13px 14px",
  textAlign: "left",
  color: "var(--text)",
};

const settingsRowHintStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--muted)",
  lineHeight: 1.4,
};

// Visual-only on/off pill — the row it sits in is the actual switch button.
function Switch({ on }: { on: boolean }) {
  return (
    <div
      style={{
        flexShrink: 0,
        position: "relative",
        width: 44,
        height: 26,
        borderRadius: 13,
        background: on ? "var(--accent)" : "var(--muted-2)",
        transition: "background 0.18s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: on ? "var(--accent-text)" : "var(--text)",
          transform: `translateX(${on ? 18 : 0}px)`,
          transition: "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.18s ease",
        }}
      />
    </div>
  );
}

const sectionHeaderStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--muted-2)",
  padding: "0 2px",
};

function kindToggleStyle(active: boolean): CSSProperties {
  return {
    flexGrow: 1,
    textAlign: "center",
    padding: "10px 0",
    borderRadius: 10,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "var(--accent)" : "var(--panel-2)",
    color: active ? "var(--accent-text)" : "var(--text)",
    fontSize: 13,
    fontWeight: 700,
  };
}

// Distance (px) the row slides left to reveal the delete panel — matches
// the trash button's own width, so the reveal exactly fits it.
const SWIPE_REVEAL = 84;
// Fraction of the reveal distance a drag must pass to snap open on release.
const SWIPE_OPEN_THRESHOLD = SWIPE_REVEAL / 2;

function SiteButton({
  site,
  index,
  onClick,
  isOpen,
  onOpen,
  onClose,
  onDelete,
}: {
  site: SiteRow;
  index: number;
  onClick: () => void;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  // dragX tracks the row's live horizontal offset: 0 (resting) to
  // -SWIPE_REVEAL (fully open, trash panel showing). While the parent's
  // isOpen flips this row closed (another row was opened, or this site
  // was just deleted), dragX snaps to match it.
  const [dragX, setDragX] = useState(0);
  // Whether a drag is in progress — read during render to switch the
  // transition off while tracking the finger, so the row doesn't lag.
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const draggedFar = useRef(false);

  useEffect(() => {
    setDragX(isOpen ? -SWIPE_REVEAL : 0);
  }, [isOpen]);

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    setDragging(true);
    draggedFar.current = false;
    startX.current = e.clientX;
    startOffset.current = isOpen ? -SWIPE_REVEAL : 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 6) draggedFar.current = true;
    setDragX(Math.min(0, Math.max(-SWIPE_REVEAL, startOffset.current + delta)));
  }

  function endDrag() {
    if (!dragging) return;
    setDragging(false);
    setDragX((current) => {
      if (current <= -SWIPE_OPEN_THRESHOLD) {
        onOpen();
        return -SWIPE_REVEAL;
      }
      onClose();
      return 0;
    });
  }

  function handleRowClick() {
    if (draggedFar.current) return; // this click ended a swipe, not a tap
    if (isOpen) {
      onClose();
      return;
    }
    onClick();
  }

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
      {/* delete panel, revealed as the row above slides left */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#ff6b6b",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          aria-label={`Delete ${site.name}`}
          onClick={onDelete}
          style={{
            width: SWIPE_REVEAL,
            height: "100%",
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconTrash size={22} strokeWidth={2} color="#2a0808" />
        </button>
      </div>

      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={handleRowClick}
        className="pop-in"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 14,
          textAlign: "left",
          color: "inherit",
          touchAction: "pan-y",
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
          animationDelay: `${Math.min(index, 8) * 35}ms`,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            width: 46,
            height: 46,
            borderRadius: 10,
            background: "var(--panel-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconBuilding strokeWidth={1.8} />
        </div>
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{site.name}</div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {site.address || "No address set"}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
            {formatInspectedDate(site.createdAt)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-2)" }}>
            <CountUp value={site.findings} /> finding{site.findings === 1 ? "" : "s"}
          </span>
        </div>
      </button>
    </div>
  );
}

function formatInspectedDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}
