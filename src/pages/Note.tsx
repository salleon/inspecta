import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Photo } from "../db/types";
import {
  addPhoto,
  deleteFinding,
  deletePhoto,
  getFinding,
  listPhotos,
  updateFinding,
} from "../db/db";
import { capturePhoto } from "../lib/capture";
import { IconRetake, IconTrash } from "../components/Icons";

function formatTimestamp(ms: number) {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${dd}/${mm}/${yy} - ${String(h).padStart(2, "0")}:${min} ${ampm}`;
}

export default function Note() {
  const { siteId, findingId } = useParams<{ siteId: string; findingId: string }>();
  const navigate = useNavigate();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!findingId) return;
    const f = await getFinding(findingId);
    setNote(f?.note ?? "");
    setLocation(f?.location ?? "");
    const p = await listPhotos(findingId);
    setPhotos(p);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findingId]);

  useEffect(() => {
    const latest = photos[photos.length - 1];
    if (!latest) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(latest.blob);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photos]);

  if (!siteId || !findingId) return null;

  const latestPhoto = photos[photos.length - 1];

  async function persist() {
    if (!findingId) return;
    await updateFinding(findingId, { note, location });
  }

  async function handleSaveAndContinue() {
    await persist();
    navigate(`/site/${siteId}/camera`);
  }

  async function handleSaveAndView() {
    await persist();
    navigate(`/site/${siteId}/findings`);
  }

  async function handleRetake() {
    if (!findingId || !siteId || busy) return;
    setBusy(true);
    try {
      const blob = await capturePhoto();
      if (!blob) return; // cancelled
      if (latestPhoto) await deletePhoto(latestPhoto.id);
      await addPhoto(findingId, siteId, blob);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!latestPhoto || !findingId) return;
    await deletePhoto(latestPhoto.id);
    const remaining = await listPhotos(findingId);
    if (remaining.length === 0) {
      // no photos left — this finding can't stand on its own
      await deleteFinding(findingId);
      navigate(`/site/${siteId}/camera`);
      return;
    }
    await refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* captured photo */}
      <div style={{ flexShrink: 0, height: 300, position: "relative", background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {photoUrl ? (
          <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ opacity: 0.4, fontSize: 13, fontWeight: 600 }}>No photo</div>
        )}

        {latestPhoto && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              background: "rgba(20,22,26,0.75)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {formatTimestamp(latestPhoto.takenAt)}
          </div>
        )}

        <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 8 }}>
          <button
            aria-label="Retake photo"
            onClick={handleRetake}
            disabled={busy}
            style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(20,22,26,0.75)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
          >
            <IconRetake />
          </button>
          <button
            aria-label="Delete photo"
            onClick={handleDelete}
            disabled={busy}
            style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(20,22,26,0.75)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
          >
            <IconTrash />
          </button>
        </div>
      </div>

      {/* note sheet */}
      <div style={{ flexGrow: 1, background: "#1c1e24", borderRadius: "20px 20px 0 0", marginTop: -20, position: "relative", padding: "22px 20px 24px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", margin: "0 auto" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="noteInput" style={labelStyle}>Note</label>
          <textarea
            id="noteInput"
            rows={3}
            placeholder="Tap to add"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ background: "#2a2e37", border: "1px solid #454956", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 500, color: "var(--text)", minHeight: 64, resize: "none", outline: "none" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="locationInput" style={labelStyle}>Location</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(42,46,55,0.7)", border: "1px solid rgba(69,73,86,0.9)", borderRadius: 12, padding: "12px 14px" }}>
            <input
              id="locationInput"
              type="text"
              placeholder="Tap to add"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{ flexGrow: 1, minWidth: 0, background: "none", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: "var(--text)" }}
            />
          </div>
        </div>

        <div style={{ flexGrow: 1 }} />

        <button
          onClick={handleSaveAndContinue}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--accent)", border: "none", borderRadius: 14, padding: "16px 0", fontSize: 15, fontWeight: 800, color: "var(--accent-text)" }}
        >
          Save &amp; Continue
        </button>
        <button
          onClick={handleSaveAndView}
          style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--muted)", background: "none", border: "none", padding: 4 }}
        >
          Save &amp; view findings
        </button>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
