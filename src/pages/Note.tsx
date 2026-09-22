import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, useLocation as useRouterLocation } from "react-router-dom";
import type { Photo } from "../db/types";
import {
  addPhoto,
  createFinding,
  deleteFinding,
  deletePhoto,
  getFinding,
  listPhotos,
  updateFinding,
} from "../db/db";
import { capturePhoto } from "../lib/capture";
import { IconRetake, IconTrash, IconChevronLeft, IconPlus, IconCamera } from "../components/Icons";

interface PhotoRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function Note() {
  const { siteId, findingId } = useParams<{ siteId: string; findingId: string }>();
  const navigate = useNavigate();
  const routerLocation = useRouterLocation();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  // when a text field has focus (keyboard is up), shrink the photo so both
  // Note and Location stay visible above the keyboard without scrolling
  const [fieldFocused, setFieldFocused] = useState(false);

  // the tapped thumbnail's on-screen position, handed over from Findings
  // via navigation state — captured once at mount, used to grow the photo
  // card out from that exact spot instead of just cutting to this screen
  const photoBoxRef = useRef<HTMLDivElement>(null);
  const originRectRef = useRef<PhotoRect | undefined>(
    (routerLocation.state as { photoRect?: PhotoRect } | null)?.photoRect,
  );

  useLayoutEffect(() => {
    const origin = originRectRef.current;
    const el = photoBoxRef.current;
    if (!origin || !el) return;
    const final = el.getBoundingClientRect();
    if (final.width === 0 || final.height === 0) return;
    const dx = origin.left - final.left;
    const dy = origin.top - final.top;
    const sx = origin.width / final.width;
    const sy = origin.height / final.height;
    el.style.transformOrigin = "top left";
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    // force a reflow so the browser registers that starting transform
    // before we animate away from it
    void el.offsetHeight;
    el.style.transition = "transform 380ms cubic-bezier(0.16, 1, 0.3, 1)";
    el.style.transform = "none";
    const clear = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.transformOrigin = "";
    };
    el.addEventListener("transitionend", clear, { once: true });
    return () => el.removeEventListener("transitionend", clear);
    // one-shot entrance transition — deliberately runs once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handleBack() {
    await persist();
    navigate(`/site/${siteId}/findings`);
  }

  async function handleSaveAndView() {
    await persist();
    navigate(`/site/${siteId}/findings`);
  }

  async function handleSaveAndNextFinding() {
    if (!siteId || busy) return;
    await persist();
    // Launch the camera straight away for the next finding — no
    // intermediate screen. Cancelling just leaves you on Findings, since a
    // finding can't exist without a first photo.
    setBusy(true);
    try {
      const blob = await capturePhoto();
      if (!blob) {
        navigate(`/site/${siteId}/findings`);
        return;
      }
      const finding = await createFinding(siteId);
      await addPhoto(finding.id, siteId, blob);
      navigate(`/site/${siteId}/finding/${finding.id}/note`);
    } finally {
      setBusy(false);
    }
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
      await persist(); // don't lose a typed note/location while the camera is open
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
      navigate(`/site/${siteId}/findings`);
      return;
    }
    await refresh(Math.min(selected, remaining.length - 1));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, padding: "18px 18px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          aria-label="Save and back to findings"
          onClick={handleBack}
          style={{ width: 32, height: 32, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)", padding: 0 }}
        >
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Finding</div>
      </div>

      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: fieldFocused ? 10 : 16 }}>
        {/* photo — collapses when a text field is focused so Note and
            Location stay visible above the keyboard without scrolling.
            Grows in from the tapped thumbnail's position on first mount
            (see the useLayoutEffect above) when arriving from Findings. */}
        <div
          ref={photoBoxRef}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: fieldFocused ? undefined : "4/3",
            height: fieldFocused ? 96 : undefined,
            borderRadius: 16,
            overflow: "hidden",
            background: "linear-gradient(160deg, var(--panel-2), #050f1a)",
            border: "1px solid var(--border)",
            flexShrink: 0,
            transition: "height 180ms ease",
          }}
        >
          {/* tapping the photo opens the camera to add another shot to
              this finding — same action as the dashed "+" thumbnail */}
          <button
            aria-label="Add another photo to this finding"
            onClick={handleAddPhoto}
            disabled={busy}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              padding: 0,
              border: "none",
              background: "none",
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
                <IconCamera size={40} color="var(--text)" strokeWidth={1.4} />
              </div>
            )}
          </button>
          {!activePhoto && !fieldFocused && (
            <div
              style={{
                position: "absolute",
                top: "58%",
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 16,
                fontWeight: 800,
                color: "rgba(255,255,255,0.55)",
                textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                pointerEvents: "none",
                textAlign: "center",
              }}
            >
              Tap to add picture
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

          {/* retake / delete — overlaid on the photo instead of a row below
              it, so the thumbnail strip below always has full room */}
          {activePhoto && !fieldFocused && (
            <div style={{ position: "absolute", right: 8, top: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                aria-label="Retake photo"
                onClick={handleRetake}
                disabled={busy}
                style={overlayIconButtonStyle}
              >
                <IconRetake size={15} color="#fff" />
              </button>
              <button
                aria-label="Delete photo"
                onClick={handleDelete}
                disabled={busy}
                style={overlayIconButtonStyle}
              >
                <IconTrash size={15} color="#e07a7a" />
              </button>
            </div>
          )}
        </div>

        {/* thumbnail strip — every photo on this finding is reachable, not
            just the latest; hidden while typing to leave Note + Location
            both visible above the keyboard */}
        {photos.length > 0 && !fieldFocused && (
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
                  <img src={photoUrls[i]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
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

        {/* note */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="noteInput" style={labelStyle}>Note</label>
          <textarea
            id="noteInput"
            rows={fieldFocused ? 2 : 3}
            placeholder="Tap to add"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onFocus={() => setFieldFocused(true)}
            onBlur={() => setFieldFocused(false)}
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
            onFocus={() => setFieldFocused(true)}
            onBlur={() => setFieldFocused(false)}
            style={fieldStyle}
          />
        </div>
      </div>

      {/* save bar — "Save & next finding" is the most-used action so it's
          the visually bigger button; the two sit side by side, View findings
          on the left and Save & next finding on the right */}
      <div style={{ flexShrink: 0, padding: "12px 18px calc(26px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "row", gap: 10 }}>
        <button
          onClick={handleSaveAndView}
          style={{
            flex: 1,
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
        <button
          onClick={handleSaveAndNextFinding}
          disabled={busy}
          className="glow-sweep"
          style={{
            position: "relative",
            flex: 1,
            textAlign: "center",
            padding: "15px 0",
            borderRadius: 14,
            background: "var(--accent)",
            border: "none",
            fontSize: 14,
            fontWeight: 800,
            color: "var(--accent-text)",
            overflow: "hidden",
          }}
        >
          {busy ? "Opening camera…" : "Save & next finding"}
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

const overlayIconButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "rgba(7,27,44,0.7)",
  border: "1px solid rgba(255,255,255,0.15)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};
