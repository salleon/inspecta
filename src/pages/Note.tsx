import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, useLocation as useRouterLocation } from "react-router-dom";
import type { DefectType, Photo } from "../db/types";
import {
  addPhoto,
  createFinding,
  deletePhoto,
  getFinding,
  getThumbnail,
  listFindings,
  listPhotos,
  updateFinding,
} from "../db/db";
import { capturePhoto } from "../lib/capture";
import { IconRetake, IconTrash, IconChevronLeft, IconPlus, IconCamera, IconCheck } from "../components/Icons";
import RoundIconButton from "../components/RoundIconButton";
import DefectTypePill from "../components/DefectTypePill";
import LevelField from "../components/LevelField";
import LocationSuggestions from "../components/LocationSuggestions";
import { siteLocations, suggestLocations } from "../lib/locationSuggestions";
import { DEFECT_TYPES } from "../lib/defectTypes";
import { useAdvancedControls } from "../lib/settings";

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
  // small copies for the thumbnail strip (see lib/thumbnail), by photo id
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  // locations already used on this site's other findings, most recent
  // first, for the suggestion buttons under the Location box
  const [siteLocs, setSiteLocs] = useState<string[]>([]);
  const [locationFocused, setLocationFocused] = useState(false);
  const [defectType, setDefectType] = useState<DefectType | undefined>(undefined);
  const [level, setLevel] = useState<string | undefined>(undefined);
  // the level "Save & next finding" copied over from the previous finding,
  // so we can say so under the field until it's changed
  const carriedLevel = (routerLocation.state as { carriedLevel?: string } | null)?.carriedLevel;
  const [pickingDefectType, setPickingDefectType] = useState(false);
  const advancedControls = useAdvancedControls();
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
    setDefectType(f?.defectType);
    setLevel(f?.level);
    const p = await listPhotos(findingId);
    setPhotos(p);
    setSelected((prev) => {
      const target = selectIndex ?? prev;
      return Math.max(0, Math.min(target, p.length - 1));
    });
  }

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    listFindings(siteId).then((findings) => {
      if (!cancelled) setSiteLocs(siteLocations(findings, findingId));
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, findingId]);

  useEffect(() => {
    refresh(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findingId]);

  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p.blob));
    setPhotoUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  // Thumbnail URLs live in a ref keyed by photo id, so a refresh (e.g.
  // after adding a photo) only makes the new ones and drops removed ones —
  // existing thumbnails never flicker.
  const thumbCache = useRef(new Map<string, string>());
  useEffect(() => {
    let cancelled = false;
    const cache = thumbCache.current;
    const ids = new Set(photos.map((p) => p.id));
    for (const [id, url] of cache) {
      if (!ids.has(id)) {
        URL.revokeObjectURL(url);
        cache.delete(id);
      }
    }
    setThumbUrls(Object.fromEntries(cache));
    (async () => {
      for (const p of photos) {
        if (cache.has(p.id)) continue;
        const thumb = await getThumbnail(p).catch(() => null);
        if (cancelled) return;
        if (!thumb) continue;
        cache.set(p.id, URL.createObjectURL(thumb));
        setThumbUrls(Object.fromEntries(cache));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photos]);
  useEffect(() => {
    const cache = thumbCache.current;
    return () => cache.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const wasCollapsedRef = useRef(false);

  if (!siteId || !findingId) return null;

  const activePhoto = photos[selected];
  const activeUrl = photoUrls[selected] ?? null;

  async function persist() {
    if (!findingId) return;
    await updateFinding(findingId, { note, location, defectType, level });
  }

  // Used by both the back button and "View findings" — they're the same
  // action (persist the note/location, then return to the list).
  async function handleBack() {
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
      // carry the level over to the next finding (advanced controls) — a
      // cleared level carries nothing, so the next one starts empty too
      const carry = advancedControls && level ? level : undefined;
      const finding = await createFinding(siteId, carry ? { level: carry } : {});
      await addPhoto(finding.id, siteId, blob);
      navigate(`/site/${siteId}/finding/${finding.id}/note`, carry ? { state: { carriedLevel: carry } } : undefined);
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

  // Tapping the photo while it's collapsed (a text field has focus) should
  // just bring it back to full size — not jump straight to the camera. We
  // read fieldFocused on pointerdown rather than in the click handler
  // because tapping the photo blurs the focused field first, which would
  // otherwise make every tap look like the field was never focused by the
  // time onClick runs.
  function handlePhotoPointerDown() {
    wasCollapsedRef.current = fieldFocused;
  }
  function handlePhotoTap() {
    if (wasCollapsedRef.current) return; // this tap just re-expanded it
    handleAddPhoto();
  }

  // Saved straight away (not just on leaving the screen) so a picked type
  // is never lost. Picking is always optional — undefined clears it.
  async function handlePickDefectType(type: DefectType | undefined) {
    setDefectType(type);
    setPickingDefectType(false);
    if (findingId) await updateFinding(findingId, { defectType: type });
  }

  // The picker is only offered while advanced controls are on, but a type
  // already saved on this finding stays visible (and editable) either way.
  const showDefectType = advancedControls || defectType !== undefined;
  const showLevel = advancedControls || level !== undefined;

  async function handleDelete() {
    if (!activePhoto || !findingId) return;
    await deletePhoto(activePhoto.id);
    const remaining = await listPhotos(findingId);
    // Deleting the last photo just leaves the finding photo-less (the
    // camera placeholder + "Tap to add picture" state below already
    // handles that) — it does NOT delete the finding itself. The note and
    // location text the person already typed stays exactly as it was;
    // they can retake/add a photo from here the same way they did the
    // first time.
    await refresh(Math.min(selected, Math.max(remaining.length - 1, 0)));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, padding: "18px 18px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <RoundIconButton size={32} ariaLabel="Save and back to findings" onClick={handleBack}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Finding</div>
      </div>

      {/* .finding-scroll stops every section in here from shrinking — the
          column scrolls instead, however many fields get added below */}
      <div className="finding-scroll" style={{ flexGrow: 1, overflowY: "auto", padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: fieldFocused ? 10 : 16 }}>
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
              this finding — same action as the dashed "+" thumbnail. If a
              text field currently has focus, this first tap just re-expands
              the collapsed photo instead of jumping straight to the camera. */}
          <button
            aria-label="Add another photo to this finding"
            onPointerDown={handlePhotoPointerDown}
            onClick={handlePhotoTap}
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
          // Fixed height (thumbnail + scrollbar room) as well as the
          // .finding-scroll no-shrink rule: a horizontal scroller in a flex
          // column is otherwise the first thing squashed when the screen
          // gets taller than the phone.
          <div style={{ flexShrink: 0, height: THUMB_SIZE + 4, minHeight: THUMB_SIZE + 4, display: "flex", gap: 8, overflowX: "auto", overflowY: "hidden", paddingBottom: 2 }}>
            {photos.map((p, i) => (
              <button
                key={p.id}
                aria-label={`View photo ${i + 1}`}
                onClick={() => setSelected(i)}
                className="thumb-in"
                style={{
                  flexShrink: 0,
                  width: THUMB_SIZE,
                  height: THUMB_SIZE,
                  borderRadius: 10,
                  overflow: "hidden",
                  padding: 0,
                  background: "var(--panel-2)",
                  border: i === selected ? "2px solid var(--accent)" : "1px solid var(--border-strong)",
                }}
              >
                {thumbUrls[p.id] && (
                  <img src={thumbUrls[p.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                )}
              </button>
            ))}
            <button
              aria-label="Add another photo to this finding"
              onClick={handleAddPhoto}
              disabled={busy}
              style={{
                flexShrink: 0,
                width: THUMB_SIZE,
                height: THUMB_SIZE,
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

        {/* location, with suggestions from this site's other findings while
            typing (data-keep-visible keeps the buttons above the keyboard) */}
        <div data-keep-visible style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="locationInput" style={labelStyle}>Location</label>
          <input
            id="locationInput"
            type="text"
            placeholder="Tap to add"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onFocus={() => {
              setFieldFocused(true);
              setLocationFocused(true);
            }}
            onBlur={() => {
              setFieldFocused(false);
              setLocationFocused(false);
            }}
            style={fieldStyle}
          />
          {locationFocused && (
            <LocationSuggestions suggestions={suggestLocations(siteLocs, location)} onPick={setLocation} />
          )}
        </div>

        {/* level — advanced controls; optional, carried to the next finding */}
        {showLevel && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="levelInput" style={labelStyle}>Level</label>
            <LevelField
              value={level}
              onChange={setLevel}
              onFocus={() => setFieldFocused(true)}
              onBlur={() => setFieldFocused(false)}
              fieldStyle={fieldStyle}
            />
            {carriedLevel && level === carriedLevel && (
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>Same level as your last finding</div>
            )}
          </div>
        )}

        {/* defect type — advanced controls */}
        {showDefectType && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="defectTypeInput" style={labelStyle}>Defect type</label>
            <button
              id="defectTypeInput"
              type="button"
              // Don't let this tap blur a focused Note/Location first: the
              // blur re-expands the photo, shoving this button down so the
              // tap misses it (it'd take a second tap to open).
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                (document.activeElement as HTMLElement | null)?.blur();
                setPickingDefectType(true);
              }}
              style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left", padding: defectType ? "9px 14px" : fieldStyle.padding }}
            >
              {defectType ? (
                <DefectTypePill type={defectType} />
              ) : (
                <span style={{ color: "var(--muted-2)" }}>Tap to select (optional)</span>
              )}
              <IconChevronLeft size={16} color="var(--muted-2)" style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
            </button>
          </div>
        )}
      </div>

      {/* save bar — "Save & next finding" is the most-used action so it's
          the visually bigger button; the two sit side by side, View findings
          on the left and Save & next finding on the right */}
      <div style={{ flexShrink: 0, padding: "12px 18px calc(26px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "row", gap: 10 }}>
        <button
          onClick={handleBack}
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

      {pickingDefectType && (
        <div
          className="sheet-backdrop"
          style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setPickingDefectType(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sheet-panel"
            style={{ width: "100%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "22px 20px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Defect type</div>
            {DEFECT_TYPES.map((t) => {
              const active = t.value === defectType;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handlePickDefectType(t.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "var(--panel-2)",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "12px 14px",
                  }}
                >
                  <DefectTypePill type={t.value} />
                  {active && <IconCheck size={18} color="var(--accent)" strokeWidth={2.6} />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handlePickDefectType(undefined)}
              style={{ background: "none", border: "none", padding: "8px 0 0", fontSize: 13, fontWeight: 700, color: "var(--muted)" }}
            >
              {defectType ? "Clear defect type" : "Skip"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// photo thumbnail strip under the main photo
const THUMB_SIZE = 56;

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
