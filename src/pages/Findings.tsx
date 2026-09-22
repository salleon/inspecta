import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Finding, Photo, Site } from "../db/types";
import { getSite, listFindings, listPhotos } from "../db/db";
import { IconChevronLeft, IconShare, IconEdit } from "../components/Icons";

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, height: 64, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          aria-label="Back to camera"
          onClick={() => navigate(`/site/${siteId}/camera`)}
          style={{ width: 40, height: 40, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
        >
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Findings</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{site?.name ?? ""}</div>
        </div>
        <button
          aria-label="Export PDF"
          onClick={() => navigate(`/site/${siteId}/export`)}
          style={{ width: 40, height: 40, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
        >
          <IconShare />
        </button>
      </div>

      {/* list */}
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 16px 12px", display: "flex", flexDirection: "column" }}>
        {rows.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>
            No findings yet — tap the camera to log your first one.
          </div>
        )}
        {rows.map(({ finding, thumb, photoCount }, i) => (
          <button
            key={finding.id}
            onClick={() => navigate(`/site/${siteId}/finding/${finding.id}/note`)}
            className="pop-in"
            style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 0", borderBottom: "1px solid var(--border)", background: "none", border: "none", borderBottomWidth: 1, textAlign: "left", color: "inherit", animationDelay: `${Math.min(i, 8) * 35}ms` }}
          >
            <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 10, background: "var(--panel-2)", overflow: "hidden", position: "relative" }}>
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
          onClick={() => navigate(`/site/${siteId}/camera`)}
          style={{ display: "block", width: "100%", textAlign: "center", padding: "17px 0", borderRadius: 14, background: "var(--accent)", border: "none", fontSize: 16, fontWeight: 800, color: "var(--accent-text)" }}
        >
          + New finding
        </button>
      </div>
    </div>
  );
}
