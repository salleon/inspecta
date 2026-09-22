import { useEffect, useState, type TouchEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CameraDirection } from "@capacitor/camera";
import type { Site, Finding, Photo } from "../db/types";
import {
  addPhoto,
  createFinding,
  findingCount,
  getFinding,
  getSite,
  listPhotos,
} from "../db/db";
import { capturePhoto } from "../lib/capture";
import {
  IconChevronLeft,
  IconList,
  IconCamera,
  IconZap,
  IconSwitchCamera,
  IconArrowRight,
} from "../components/Icons";

interface NavState {
  activeFindingId?: string;
}

export default function Camera() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [site, setSite] = useState<Site | null>(null);
  const [count, setCount] = useState(0);

  // The finding currently being photographed in this session. Starts blank
  // every time you arrive fresh (from the Dashboard or Findings) so an old
  // finding is never silently reused — it's only carried over when Note
  // hands control back with "Save & next photo".
  const [activeFindingId, setActiveFindingId] = useState<string | undefined>(
    () => (location.state as NavState | null)?.activeFindingId,
  );
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

    if (activeFindingId) {
      const f = await getFinding(activeFindingId);
      if (f) {
        setCurrentFinding(f);
        setCurrentPhotos(await listPhotos(f.id));
        return;
      }
    }
    setCurrentFinding(null);
    setCurrentPhotos([]);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, activeFindingId]);

  useEffect(() => {
    const urls = currentPhotos.map((p) => URL.createObjectURL(p.blob));
    setPhotoUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [currentPhotos]);

  if (!siteId) return null;

  // The one capture action: adds to the finding already open in this
  // session, or starts a brand-new finding (and heads to Note to describe
  // it) when there isn't one yet.
  async function handleCapture() {
    if (!siteId || busy) return;
    setBusy(true);
    try {
      const blob = await capturePhoto(direction);
      if (!blob) return; // cancelled

      if (currentFinding) {
        await addPhoto(currentFinding.id, siteId, blob);
        await refresh();
      } else {
        const finding = await createFinding(siteId);
        await addPhoto(finding.id, siteId, blob);
        navigate(`/site/${siteId}/finding/${finding.id}/note`);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleNextFinding() {
    if (busy) return;
    setActiveFindingId(undefined);
  }

  // Swipe left on the preview as a one-handed shortcut for "Next finding",
  // so you don't have to reach down to the button every time.
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  function handleTouchStart(e: TouchEvent) {
    setTouchStartX(e.touches[0]?.clientX ?? null);
  }
  function handleTouchEnd(e: TouchEvent) {
    if (touchStartX === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX;
    const dx = endX - touchStartX;
    setTouchStartX(null);
    if (dx < -60 && currentFinding && !busy) {
      handleNextFinding();
    }
  }

  const latestUrl = photoUrls[photoUrls.length - 1];

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

      {/* pushes the preview/thumbnails/buttons down as one tight group
          instead of leaving a gap between them */}
      <div style={{ flexGrow: 1 }} />

      {/* preview — kept small on purpose: once you've got a photo, the big
          empty square isn't doing much work. Shows the finding's latest
          photo once one exists, otherwise an empty state inviting the
          first capture. Flash/switch-camera live here as small corner
          controls (used rarely) so the bottom of the screen is free for
          just the two things you reach for constantly, one-handed. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Add photo"
        onClick={handleCapture}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCapture()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          flexShrink: 0,
          height: 150,
          margin: "0 18px 12px",
          border: "1px solid rgba(46,196,182,0.35)",
          borderRadius: 18,
          background: latestUrl ? "#000" : "linear-gradient(160deg, var(--panel-2), #050f1a)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          color: "var(--text)",
          opacity: busy ? 0.7 : 1,
          cursor: "pointer",
        }}
      >
        <div style={{ position: "absolute", right: 8, top: 8, display: "flex", flexDirection: "column", gap: 6, zIndex: 1 }}>
          <button
            aria-label="Toggle flash"
            onClick={(e) => {
              e.stopPropagation();
              setFlashOn((v) => !v);
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: flashOn ? "var(--accent)" : "rgba(7,27,44,0.7)",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: flashOn ? "var(--accent-text)" : "#fff",
            }}
          >
            <IconZap size={15} />
          </button>
          <button
            aria-label="Switch camera"
            onClick={(e) => {
              e.stopPropagation();
              setDirection((d) => (d === CameraDirection.Rear ? CameraDirection.Front : CameraDirection.Rear));
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(7,27,44,0.7)",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <IconSwitchCamera size={15} />
          </button>
        </div>
        {latestUrl ? (
          <>
            <img src={latestUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div
              style={{
                position: "absolute",
                inset: "auto 0 0 0",
                padding: "16px 14px 10px",
                background: "linear-gradient(0deg, rgba(0,0,0,0.65), transparent)",
                fontSize: 11,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {busy ? "Saving…" : "Tap to add another photo to THIS finding"}
            </div>
            {currentPhotos.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  top: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#fff",
                  background: "rgba(7,27,44,0.7)",
                  borderRadius: 8,
                  padding: "3px 8px",
                }}
              >
                {currentPhotos.length} photos
              </div>
            )}
          </>
        ) : (
          <>
            <IconCamera size={34} strokeWidth={1.4} style={{ opacity: 0.4 }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>
                {busy ? "Saving…" : "Tap for a new finding"}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                Starts a fresh finding with this photo
              </div>
            </div>
          </>
        )}
      </div>

      {/* this finding's photos — the important part: every photo you've
          taken for it, always visible and easy to check at a glance */}
      {currentFinding && currentPhotos.length > 0 && (
        <div style={{ flexShrink: 0, padding: "0 18px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            This finding &middot; {currentFinding.note || "No note yet"}
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
          </div>
        </div>
      )}

      {/* bottom controls — both stacked hard against the bottom edge, full
          width, so either is a short thumb-reach with the phone in one
          hand, whichever hand that is. Flash/switch camera moved up onto
          the preview since they're reached for far less often. */}
      <div style={{ flexShrink: 0, padding: "0 16px calc(24px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          onClick={handleNextFinding}
          disabled={!currentFinding || busy}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "18px 0",
            borderRadius: 16,
            border: currentFinding ? "none" : "1px solid var(--border)",
            background: currentFinding ? "var(--accent)" : "var(--panel)",
            fontSize: 17,
            fontWeight: 800,
            color: currentFinding ? "var(--accent-text)" : "var(--muted-2)",
          }}
        >
          Next finding
          <IconArrowRight size={18} strokeWidth={2.6} />
        </button>

        <button
          aria-label="Add photo"
          onClick={handleCapture}
          disabled={busy}
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: 18,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              background: "var(--accent)",
              border: "5px solid rgba(46,196,182,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 20px rgba(46,196,182,0.3)",
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--accent-text)", opacity: 0.08 }} />
          </div>
        </button>
      </div>
    </div>
  );
}
