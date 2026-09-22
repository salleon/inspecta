import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CameraDirection } from "@capacitor/camera";
import type { Site, Finding, Photo } from "../db/types";
import {
  addPhoto,
  createFinding,
  findingCount,
  getSite,
  listFindings,
  listPhotos,
} from "../db/db";
import { capturePhoto } from "../lib/capture";
import {
  IconChevronLeft,
  IconList,
  IconCamera,
  IconZap,
  IconSwitchCamera,
  IconPlus,
} from "../components/Icons";

export default function Camera() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();

  const [site, setSite] = useState<Site | null>(null);
  const [count, setCount] = useState(0);
  const [currentFinding, setCurrentFinding] = useState<Finding | null>(null);
  const [currentPhotos, setCurrentPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [flashOn, setFlashOn] = useState(false);
  const [direction, setDirection] = useState<CameraDirection>(CameraDirection.Rear);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!siteId) return;
    const s = await getSite(siteId);
    setSite(s ?? null);
    const n = await findingCount(siteId);
    setCount(n);
    const findings = await listFindings(siteId);
    const latest = findings[0] ?? null;
    setCurrentFinding(latest);
    if (latest) {
      const photos = await listPhotos(latest.id);
      setCurrentPhotos(photos);
    } else {
      setCurrentPhotos([]);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  useEffect(() => {
    const urls = currentPhotos.map((p) => URL.createObjectURL(p.blob));
    setPhotoUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [currentPhotos]);

  if (!siteId) return null;

  async function handleNewFinding() {
    if (!siteId || busy) return;
    setBusy(true);
    try {
      const blob = await capturePhoto(direction);
      if (!blob) return; // cancelled
      const finding = await createFinding(siteId);
      await addPhoto(finding.id, siteId, blob);
      navigate(`/site/${siteId}/finding/${finding.id}/note`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddPhoto() {
    if (!siteId || !currentFinding || busy) return;
    setBusy(true);
    try {
      const blob = await capturePhoto(direction);
      if (!blob) return; // cancelled
      await addPhoto(currentFinding.id, siteId, blob);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, height: 64, padding: "0 8px 0 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <button
            aria-label="Back to sites"
            onClick={() => navigate("/")}
            style={{ width: 40, height: 40, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text)" }}
          >
            <IconChevronLeft size={19} strokeWidth={2.2} />
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {site?.name ?? "Site"}
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {site?.address || "No address set"}
            </div>
          </div>
        </div>
        <button
          aria-label="View findings"
          onClick={() => navigate(`/site/${siteId}/findings`)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 20, padding: "8px 12px", flexShrink: 0 }}
        >
          <IconList />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{count}</span>
        </button>
      </div>

      {/* viewfinder (tap to capture a NEW finding) */}
      <button
        onClick={handleNewFinding}
        disabled={busy}
        style={{
          flexGrow: 1,
          margin: "0 18px 14px",
          border: "1px solid rgba(46,196,182,0.35)",
          borderRadius: 20,
          background: "linear-gradient(160deg, var(--panel-2), #050f1a)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text)",
        }}
      >
        <IconCamera size={56} strokeWidth={1.4} style={{ opacity: 0.35 }} />

        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(244,247,249,0.55)",
            background: "rgba(11,41,66,0.6)",
            padding: "5px 9px",
            borderRadius: 8,
          }}
        >
          {busy ? "Saving…" : "Tap anywhere to capture a new finding"}
        </div>
      </button>

      {/* bottom controls */}
      <div style={{ flexShrink: 0, padding: "16px 16px calc(30px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 18 }}>
        {currentFinding && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Current finding
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
                {currentFinding.note || "No note yet"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
              {photoUrls.map((url, i) => (
                <img
                  key={currentPhotos[i]?.id ?? i}
                  src={url}
                  alt=""
                  style={{ flexShrink: 0, width: 58, height: 58, borderRadius: 12, objectFit: "cover", border: "1px solid var(--border-strong)" }}
                />
              ))}
              <button
                aria-label="Add another photo to this finding"
                onClick={handleAddPhoto}
                disabled={busy}
                style={{
                  flexShrink: 0,
                  width: 58,
                  height: 58,
                  borderRadius: 12,
                  border: "1.5px dashed var(--border-strong)",
                  background: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted)",
                }}
              >
                <IconPlus size={18} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
          <button
            aria-label="Toggle flash"
            onClick={() => setFlashOn((v) => !v)}
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: flashOn ? "var(--accent)" : "var(--panel)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: flashOn ? "var(--accent-text)" : "var(--text)",
            }}
          >
            <IconZap />
          </button>

          <button
            aria-label="Capture photo"
            onClick={handleNewFinding}
            disabled={busy}
            style={{
              width: 76,
              height: 76,
              borderRadius: "50%",
              background: "var(--accent)",
              border: "5px solid rgba(46,196,182,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 20px rgba(46,196,182,0.3)",
            }}
          >
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--accent-text)", opacity: 0.08 }} />
          </button>

          <button
            aria-label="Switch camera"
            onClick={() => setDirection((d) => (d === CameraDirection.Rear ? CameraDirection.Front : CameraDirection.Rear))}
            style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--panel)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
          >
            <IconSwitchCamera />
          </button>
        </div>
      </div>
    </div>
  );
}
