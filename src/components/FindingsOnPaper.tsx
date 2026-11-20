import { useEffect, useState } from "react";
import { getThumbnail } from "../db/db";
import { testPhotoItems, type StairPhotoItem } from "../lib/stairPhotos";

// A stair or flow test's photos and defects in a report preview, each as
// the old findings report drew them: photos on the left half, then the
// type, note, level and location on the right.

// each test's, by test id, and their photos' thumbnails (photo id → URL)
export function useReportPhotos(tests: { id: string; siteId: string }[]) {
  const [got, setGot] = useState<{ byTest: Record<string, StairPhotoItem[]>; thumbs: Record<string, string> }>({ byTest: {}, thumbs: {} });
  const key = tests.map((t) => t.id).join(",");
  useEffect(() => {
    if (!tests.length) return;
    let cancelled = false;
    const urls: string[] = [];
    void (async () => {
      const byTest: Record<string, StairPhotoItem[]> = {};
      const thumbs: Record<string, string> = {};
      for (const t of tests) {
        byTest[t.id] = await testPhotoItems(t);
        for (const p of byTest[t.id].flatMap((i) => i.photos)) {
          const b = await getThumbnail(p).catch(() => null);
          if (b) urls.push((thumbs[p.id] = URL.createObjectURL(b)));
        }
      }
      if (!cancelled) setGot({ byTest, thumbs });
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // read again when the tests change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return got;
}

export function FindingsOnPaper({ items, thumbs }: { items: StairPhotoItem[]; thumbs: Record<string, string> }) {
  return (
    <>
      {items.map((it) => (
        <div key={it.finding.id} style={{ display: "flex", gap: 10, borderTop: "1px solid #e3e9ee", paddingTop: 8, marginTop: 2 }}>
          <div style={{ flex: "0 0 48%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, alignContent: "start" }}>
            {it.photos.map((p) => (
              <span key={p.id} style={{ aspectRatio: "121/161", background: "#e3e9ee", overflow: "hidden" }}>
                {thumbs[p.id] && <img src={thumbs[p.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              </span>
            ))}
            {!it.photos.length && <span style={{ gridColumn: "1", height: 34, border: "1px dashed #c9c4b8", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#8c8c8c" }}>No photo</span>}
          </div>
          <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {it.type && <span style={{ alignSelf: "flex-start", fontSize: 8, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: it.type.bg, color: it.type.text, border: it.type.bg === "#ffffff" ? "1px solid #c9c4b8" : "none" }}>{it.type.label}</span>}
            <div style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.3, whiteSpace: "pre-wrap" }}>{it.note || "Untitled finding"}</div>
            {it.finding.level && <div style={{ fontSize: 9, color: "#8c8c8c" }}>{it.finding.level}</div>}
            {it.finding.location.trim() && <div style={{ fontSize: 9, color: "#8c8c8c" }}>{it.finding.location.trim()}</div>}
          </div>
        </div>
      ))}
    </>
  );
}
