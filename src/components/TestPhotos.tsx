import { useEffect, useState, type CSSProperties } from "react";
import type { Finding, Photo } from "../db/types";
import { getThumbnail, listTestFindings } from "../db/db";
import { defectTypeStyle } from "../lib/defectTypes";
import DefectTypePill from "./DefectTypePill";
import { IconCamera, IconPen } from "./Icons";

// Photos & notes in a stair test (lib/testPhotos): the camera button, the
// card on the test's overview and the sheet listing them all. They're the
// whole test's, not one stair's; each has a level only if one was given.

export interface TestPhoto {
  finding: Finding;
  photos: Photo[];
  thumb: string | null; // the first photo's thumbnail, as a URL
}

// a test's photos and notes, oldest first, read again each time the screen
// opens (coming back from one of them)
export function useTestPhotos(siteId: string | undefined, testId: string | undefined): TestPhoto[] {
  const [items, setItems] = useState<TestPhoto[]>([]);
  useEffect(() => {
    if (!siteId || !testId) return;
    let cancelled = false;
    const urls: string[] = [];
    void (async () => {
      const rows = await listTestFindings(siteId, testId);
      const done: TestPhoto[] = [];
      for (const r of rows) {
        const blob = r.photos[0] ? await getThumbnail(r.photos[0]).catch(() => null) : null;
        const url = blob ? URL.createObjectURL(blob) : null;
        if (url) urls.push(url);
        done.push({ ...r, thumb: url });
      }
      if (!cancelled) setItems(done);
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [siteId, testId]);
  return items;
}

export const photoCountText = (items: TestPhoto[]) => {
  const photos = items.reduce((n, i) => n + i.photos.length, 0);
  const notes = items.filter((i) => !i.photos.length).length;
  return [photos && `${photos} photo${photos === 1 ? "" : "s"}`, notes && `${notes} note${notes === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "None yet";
};

// the round camera in a test screen's heading
export function CameraButton({ onClick, size = 44 }: { onClick: () => void; size?: number }) {
  return (
    <button
      aria-label="Take a photo for this test"
      onClick={onClick}
      style={{ flexShrink: 0, width: size, height: size, borderRadius: size / 2, background: "rgba(var(--accent-rgb), .14)", border: "1px solid rgba(var(--accent-rgb), .55)", color: "#5ff0e0", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
    >
      <IconCamera size={size * 0.48} strokeWidth={2.2} />
    </button>
  );
}

function Thumb({ item, size }: { item: TestPhoto; size: number }) {
  const dot = defectTypeStyle(item.finding.defectType)?.bg;
  return (
    <span style={{ position: "relative", width: size, height: size, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: "1px solid var(--border-strong)", background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
      {item.thumb ? <img src={item.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <IconPen size={size * 0.3} />}
      {dot && <span style={{ position: "absolute", left: 4, bottom: 4, width: 10, height: 10, borderRadius: 3, background: dot, border: "1px solid rgba(0,0,0,.35)" }} />}
    </span>
  );
}

// on the overview: what's been taken so far, tap to see them all
export function TestPhotosCard({ items, onOpen }: { items: TestPhoto[]; onOpen: () => void }) {
  return (
    <button
      data-testid="spf-photos"
      onClick={onOpen}
      style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 13, background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", flexShrink: 0 }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 11, width: "100%" }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <IconCamera size={17} strokeWidth={2.2} />
        </span>
        <span style={{ flexGrow: 1 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>Photos &amp; notes</span>
          <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>Whole test · {photoCountText(items)}</span>
        </span>
        <span style={{ color: "var(--muted-2)", fontSize: 18 }}>›</span>
      </span>
      {items.length > 0 && (
        <span style={{ display: "flex", gap: 7, overflow: "hidden", width: "100%" }}>
          {items.slice(0, 6).map((i) => (
            <Thumb key={i.finding.id} item={i} size={56} />
          ))}
        </span>
      )}
    </button>
  );
}

// everything taken in the test, with a note or a photo to add
export function TestPhotosSheet({ items, onClose, onOpen, onPhoto, onNote }: { items: TestPhoto[]; onClose: () => void; onOpen: (findingId: string) => void; onPhoto: () => void; onNote: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end", zIndex: 30 }}>
      <div
        data-testid="spf-photos-sheet"
        className="sheet-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxHeight: "82%", display: "flex", flexDirection: "column", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "18px 16px calc(24px + env(safe-area-inset-bottom))", gap: 10, boxSizing: "border-box" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>Photos &amp; notes</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>this test, all stairs</span>
        </div>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          {!items.length && <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, padding: "6px 0" }}>Anything you notice while testing: a photo, or just a note. They go on their own page at the end of the report.</div>}
          {items.map((i) => (
            <button
              key={i.finding.id}
              onClick={() => onOpen(i.finding.id)}
              style={{ display: "flex", gap: 11, alignItems: "center", width: "100%", textAlign: "left", padding: 9, borderRadius: 12, background: "var(--panel-2)", border: "none", color: "var(--text)", flexShrink: 0 }}
            >
              <Thumb item={i} size={56} />
              <span style={{ flexGrow: 1, minWidth: 0 }}>
                <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>
                  {i.finding.level || "No level"}
                  <DefectTypePill type={i.finding.defectType} size="sm" />
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, marginTop: 2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as CSSProperties}>
                  {i.finding.note.trim() || <span style={{ color: "var(--muted)" }}>{i.finding.location.trim() || "No note yet"}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <button onClick={onNote} style={{ flex: 1, height: 52, borderRadius: 13, border: "1px solid var(--border-strong)", background: "none", color: "var(--text)", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <IconPen size={17} /> Add a note
          </button>
          <button onClick={onPhoto} style={{ flex: 1, height: 52, borderRadius: 13, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <IconCamera size={19} strokeWidth={2.2} /> Take a photo
          </button>
        </div>
      </div>
    </div>
  );
}

// A flow test's defects, as a slim row at the bottom of its Comments card:
// Note and Photo, then the ones taken so far (tap one to open it).
export function FlowDefectsRow({ items, onNote, onPhoto, onOpen }: { items: TestPhoto[]; onNote: () => void; onPhoto: () => void; onOpen: (findingId: string) => void }) {
  const pill: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, minHeight: 36 };
  return (
    <div data-testid="flow-defects" style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flexGrow: 1, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
          Photos &amp; defects{items.length ? ` · ${items.length}` : ""}
        </span>
        <button aria-label="Add a defect note" onClick={onNote} style={{ ...pill, border: "1px solid var(--border-strong)", background: "none", color: "#bfd0de" }}>
          <IconPen size={14} /> Note
        </button>
        <button aria-label="Take a defect photo" onClick={onPhoto} style={{ ...pill, border: "1px solid rgba(var(--accent-rgb), .55)", background: "rgba(var(--accent-rgb), .1)", color: "#5ff0e0" }}>
          <IconCamera size={15} strokeWidth={2.2} /> Photo
        </button>
      </div>
      {items.length > 0 && (
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {items.map((i) => (
            <button key={i.finding.id} aria-label={`Open defect: ${i.finding.note.trim() || "no note yet"}`} onClick={() => onOpen(i.finding.id)} style={{ border: "none", background: "none", padding: 0 }}>
              <Thumb item={i} size={52} />
            </button>
          ))}
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", lineHeight: 1.35, paddingLeft: 2 }}>On the page after the test in the export.</span>
        </div>
      )}
    </div>
  );
}
