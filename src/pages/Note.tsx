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
import { IconRetake, IconTrash, IconChevronLeft } from "../components/Icons";

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
      {/* top bar */}
      <div style={{ flexShrink: 0, padding: "18px 18px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          aria-label="Save and go back"
          onClick={handleSaveAndContinue}
          style={{ width: 32, height: 32, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)", padding: 0 }}
        >
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Finding</div>
      </div>

      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* photo */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "4/3",
            borderRadius: 16,
            overflow: "hidden",
            background: "linear-gradient(160deg, var(--panel-2), #050f1a)",
            border: "1px solid var(--border)",
          }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.3,
              }}
            >
              <IconCameraOutline />
            </div>
          )}
          {latestPhoto && (
            <div
              style={{
                position: "absolute",
                right: 10,
                bottom: 8,
                fontSize: 12,
                fontWeight: 700,
                color: "#ffffff",
                textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 0 1px 2px #000",
              }}
            >
              {formatTimestamp(latestPhoto.takenAt)}
            </div>
          )}
        </div>

        {/* retake / delete */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            aria-label="Retake photo"
            onClick={handleRetake}
            disabled={busy}
            style={{
              flexGrow: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "11px 0",
              borderRadius: 12,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            <IconRetake size={15} />
            Retake
          </button>
          <button
            aria-label="Delete photo"
            onClick={handleDelete}
            disabled={busy}
            style={{
              flexGrow: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "11px 0",
              borderRadius: 12,
              background: "var(--panel)",
              border: "1px solid rgba(224,90,90,0.35)",
              fontSize: 13,
              fontWeight: 700,
              color: "#e07a7a",
            }}
          >
            <IconTrash size={15} />
            Delete
          </button>
        </div>

        {/* note */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="noteInput" style={labelStyle}>Note</label>
          <textarea
            id="noteInput"
            rows={3}
            placeholder="Tap to add"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={fieldStyle}
          />
        </div>

        {/* location */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="locationInput" style={labelStyle}>Location</label>
          <input
            id="locationInput"
            type="text"
            placeholder="Tap to add"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={fieldStyle}
          />
        </div>
      </div>

      {/* save bar */}
      <div style={{ flexShrink: 0, padding: "12px 18px calc(26px + env(safe-area-inset-bottom))", display: "flex", gap: 10 }}>
        <button
          onClick={handleSaveAndView}
          style={{
            flexGrow: 1,
            textAlign: "center",
            padding: "15px 0",
            borderRadius: 14,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          View findings
        </button>
        <button
          onClick={handleSaveAndContinue}
          style={{
            flexGrow: 1.4,
            textAlign: "center",
            padding: "15px 0",
            borderRadius: 14,
            background: "var(--accent)",
            border: "none",
            fontSize: 14,
            fontWeight: 800,
            color: "var(--accent-text)",
          }}
        >
          Save &amp; next photo
        </button>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted-2)",
};

const fieldStyle: CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid rgba(46,196,182,0.28)",
  borderRadius: 12,
  padding: "13px 14px",
  fontSize: 14,
  fontWeight: 500,
  color: "var(--text)",
  outline: "none",
  resize: "none",
};

function IconCameraOutline() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="1.4">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
      <circle cx="12" cy="13" r="4"></circle>
    </svg>
  );
}
