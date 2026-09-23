import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Finding, Photo, Site } from "../db/types";
import { addPhoto, createFinding, deleteSite, getSite, listFindings, listPhotos, updateSite } from "../db/db";
import { capturePhoto } from "../lib/capture";
import { IconChevronLeft, IconShare, IconEdit } from "../components/Icons";
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
    if (!siteId || busy) return;
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
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 16px 12px", display: "flex", flexDirection: "column" }}>
        {rows.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>
            No findings yet — tap + New finding to log your first one.
          </div>
        )}
        {rows.map(({ finding, thumb, photoCount }, i) => (
          <button
            key={finding.id}
            onClick={(e) => {
              // hand the tapped thumbnail's on-screen position to Note, so
              // it can grow the photo out from exactly where this thumbnail
              // sits instead of just cutting to the new screen
              const thumbEl = e.currentTarget.querySelector<HTMLElement>("[data-thumb]");
              const r = thumbEl?.getBoundingClientRect();
              navigate(`/site/${siteId}/finding/${finding.id}/note`, {
                state: r ? { photoRect: { top: r.top, left: r.left, width: r.width, height: r.height } } : undefined,
              });
            }}
            className="pop-in"
            style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 0", borderBottom: "1px solid var(--border)", background: "none", border: "none", borderBottomWidth: 1, textAlign: "left", color: "inherit", animationDelay: `${Math.min(i, 8) * 35}ms` }}
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
            <IconEdit style={{ flexShrink: 0, marginTop: 2 }} color="var(--muted-2)" />
          </button>
        ))}
      </div>

      {/* bottom action */}
      <div style={{ flexShrink: 0, padding: "12px 16px calc(28px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleNewFinding}
          disabled={busy}
          className="glow-sweep"
          style={{ position: "relative", display: "block", width: "100%", textAlign: "center", padding: "17px 0", borderRadius: 14, background: "var(--accent)", border: "none", fontSize: 16, fontWeight: 800, color: "var(--accent-text)", overflow: "hidden" }}
        >
          {busy ? "Opening camera…" : "+ New finding"}
        </button>
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
