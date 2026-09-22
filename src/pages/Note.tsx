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
import { IconRetake, IconTrash, IconChevronLeft, IconPlus } from "../components/Icons";

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
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(selectIndex?: number) {
    if (!findingId) return;
    const f = await getFinding(findingId);
    setNote(f?.note ?? "");
    setLocation(f?.location ?? "");
    const p = await listPhotos(findingId);
    setPhotos(p);
    setSelected((prev) => {
      const target = selectIndex ?? prev;
      return Math.max(0, Math.min(target, p.length - 1));
    });
  }

  useEffect(() => {
    refresh(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findingId]);

  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p.blob));
    setPhotoUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  if (!siteId || !findingId) return null;

  const activePhoto = photos[selected];
  const activeUrl = photoUrls[selected] ?? null;

  async function persist() {
    if (!findingId) return;
    await updateFinding(findingId, { note, location });
  }

  async function handleSaveAndContinue() {
    await persist();
    // Hand this finding back to the Camera screen as the active session, so
    // "Add photo" there keeps adding to it instead of starting a new one.
    navigate(`/site/${siteId}/camera`, { state: { activeFindingId: findingId } });
  }

  async function handleSaveAndView() {
    await persist();
    navigate(`/site/${siteId}/findings`);
  }

  async function handleSaveAndNextFinding() {
    await persist();
    // Straight to Camera with a blank session — skips both re-adding a
    // photo to this finding and the detour through the Findings list.
    navigate(`/site/${siteId}/camera`);
  }

  async function handleRetake() {
    if (!findingId || !siteId || busy || !activePhoto) return;
    setBusy(true);
    try {
      const blob = await capturePhoto();
      if (!blob) return; // cancelled
      const idx = selected;
      await deletePhoto(activePhoto.id);
      await addPhoto(findingId, siteId, blob);
      await refresh(idx);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddPhoto() {
    if (!findingId || !siteId || busy) return;
    setBusy(true);
    try {
      const blob = await capturePhoto();
      if (!blob) return; // cancelled
      await addPhoto(findingId, siteId, blob);
      await refresh(photos.length); // select the newly added photo
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!activePhoto || !findingId) return;
    await deletePhoto(activePhoto.id);
    const remaining = await listPhotos(findingId);
    if (remaining.length === 0) {
      // no photos left — this finding can't stand on its own
      await deleteFinding(findingId);
      navigate(`/site/${siteId}/camera`);
      return;
    }
    await refresh(Math.min(selected, remaining.length - 1));
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
          {activeUrl ? (
            <img
              key={activePhoto?.id}
              src={activeUrl}
              alt=""
              className="photo-fade"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
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
          {activePhoto && (
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
              {formatTimestamp(activePhoto.takenAt)}
            </div>
          )}
          {photos.length > 1 && (
            <div
              style={{
                position: "absolute",
                left: 10,
                top: 8,
                fontSize: 11,
                fontWeight: 800,
                color: "#ffffff",
                background: "rgba(7,27,44,0.7)",
                borderRadius: 8,
                padding: "3px 8px",
              }}
            >
              {selected + 1} / {photos.length}
            </div>
          )}
        </div>

        {/* thumbnail strip — every photo on this finding is reachable, not just the latest */}
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {photos.map((p, i) => (
              <button
                key={p.id}
                aria-label={`View photo ${i + 1}`}
                onClick={() => setSelected(i)}
                className="thumb-in"
                style={{
                  flexShrink: 0,
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  overflow: "hidden",
                  padding: 0,
                  background: "var(--panel-2)",
                  border: i === selected ? "2px solid var(--accent)" : "1px solid var(--border-strong)",
                }}
              >
                {photoUrls[i] && (
                  <img src={photoUrls[i]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                )}
              </button>
            ))}
            <button
              aria-label="Add another photo to this finding"
              onClick={handleAddPhoto}
              disabled={busy}
              style={{
                flexShrink: 0,
                width: 56,
                height: 56,
                borderRadius: 10,
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
        )}

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

      {/* save bar — "Save & next finding" is the most-used action so it's
          the big primary button; View findings and Save & add photo are
          both less common and share a row below it */}
      <div style={{ flexShrink: 0, padding: "12px 18px calc(26px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          onClick={handleSaveAndNextFinding}
          style={{
            width: "100%",
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
          Save &amp; next finding
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleSaveAndContinue}
            style={{
              flexGrow: 1,
              textAlign: "center",
              padding: "13px 0",
              borderRadius: 14,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            Add another photo to finding
          </button>
          <button
            onClick={handleSaveAndView}
            style={{
              flexGrow: 1,
              textAlign: "center",
              padding: "13px 0",
              borderRadius: 14,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            View findings
          </button>
        </div>
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
