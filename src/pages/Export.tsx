import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import type { Finding, Photo, Site } from "../db/types";
import { getSite, listFindings, listPhotos } from "../db/db";
import { IconChevronLeft, IconShare } from "../components/Icons";
import RoundIconButton from "../components/RoundIconButton";
import ProgressOverlay from "../components/ProgressOverlay";
import { getInitials, getInspectorName } from "../lib/profile";
import { defectTypeStyle } from "../lib/defectTypes";
import { watermark } from "../lib/watermark";
import DefectTypePill from "../components/DefectTypePill";
import coverBgAfss from "../assets/cover-bg-afss.jpg";
import coverBgProjects from "../assets/cover-bg-projects.jpg";

// Blob -> base64 (without the data: URL prefix), which is what
// Filesystem.writeFile wants for a binary file.
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Writes a blob into the app's cache in base64 chunks rather than one
// giant string — an Excel export carries full-quality photos and can run
// to hundreds of MB, which a single base64 string would run the WebView
// out of memory on. Chunk size is a multiple of 3 bytes so each chunk
// base64-encodes cleanly on its own.
const CACHE_CHUNK_BYTES = 3 * 1024 * 1024;
async function writeToCache(blob: Blob, filename: string): Promise<string> {
  const written = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob.slice(0, CACHE_CHUNK_BYTES)),
    directory: Directory.Cache,
  });
  for (let offset = CACHE_CHUNK_BYTES; offset < blob.size; offset += CACHE_CHUNK_BYTES) {
    await Filesystem.appendFile({
      path: filename,
      data: await blobToBase64(blob.slice(offset, offset + CACHE_CHUNK_BYTES)),
      directory: Directory.Cache,
    });
  }
  return written.uri;
}

interface FindingImages {
  finding: Finding;
  dataUrls: string[]; // watermarked, for the preview + PDF
  photos: Photo[]; // originals — the Excel export stamps its own full-res copies
}


function formatDate(ms: number) {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// "Tuesday, 22 September 2026" — the cover page's date badge, spelled out
// in full since it's the largest, most prominent date on the report.
function formatFullDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// "Site name - Full name" — shown as the document heading, the in-app
// preview header, and the native share-sheet title, so every surface
// agrees on whose report this is. Falls back gracefully if the inspector
// hasn't set a name (shouldn't happen — Onboarding gates the whole app).
function reportTitle(siteName: string | undefined, inspectorName: string) {
  const site = siteName ?? "Inspection";
  return inspectorName ? `${site} - ${inspectorName}` : site;
}

// "harbourline-apartments-LS.pdf" — site name slugified, plus the
// inspector's capitalised initials, so reports from different team members
// never collide or get mixed up once they're all sitting in one inbox.
function reportFilename(siteName: string | undefined, inspectorName: string, ext: "pdf" | "xlsx" = "pdf") {
  const slug = (siteName ?? "inspection").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const initials = getInitials(inspectorName);
  return initials ? `${slug}-${initials}.${ext}` : `${slug}.${ext}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Fetches a bundled static asset (e.g. an imported PNG's built URL) and
// returns it as a base64 data URL, plus its natural size read from a second
// Image loaded off that data URL. Passing jsPDF a data URL *string* rather
// than an HTMLImageElement matters: doc.addImage() with an element draws it
// onto an offscreen canvas internally and reads the pixels back out via
// canvas.toDataURL(), and on a Capacitor Android WebView that readback can
// throw a "tainted canvas" SecurityError for bundled assets even though the
// same image displays fine as a plain <img> — it only ever showed up on
// device, never in the desktop preview. A data URL skips that canvas
// round-trip entirely, so it can't be tainted.
async function loadAssetAsDataUrl(src: string): Promise<{ dataUrl: string; naturalWidth: number; naturalHeight: number }> {
  const res = await fetch(src);
  const blob = await res.blob();
  const base64 = await blobToBase64(blob);
  const dataUrl = `data:${blob.type || "image/png"};base64,${base64}`;
  const img = await loadImage(dataUrl);
  return { dataUrl, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
}

export default function ExportPreview() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [items, setItems] = useState<FindingImages[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<"pdf" | "excel" | null>(null);
  // Excel loading screen: 0–85% while photos are stamped and added (nearly
  // all the time), then building the file, then handing it to the share menu
  const [excelProgress, setExcelProgress] = useState<{ percent: number; step: string } | null>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const s = await getSite(siteId!);
      const findings = await listFindings(siteId!);
      const built: FindingImages[] = [];
      for (const finding of findings) {
        const photos = await listPhotos(finding.id);
        const dataUrls = await Promise.all(photos.map((p) => watermark(p.blob, p.takenAt)));
        built.push({ finding, dataUrls, photos });
      }
      if (!cancelled) {
        setSite(s ?? null);
        setItems(built);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!siteId) return null;

  // The inspection date on every report (PDF cover, preview, Excel "Date
  // identified"): the day the findings were entered — a site visit happens
  // on one day, so the earliest finding's date stands for all of them. Not
  // the export date, since reports are often sent days later.
  const inspectionMs = items.length
    ? Math.min(...items.map((i) => i.finding.createdAt))
    : (site?.createdAt ?? Date.now());

  // Full-bleed cover page. The gradient wash, EnFact masthead wordmark AND
  // the classification watermark (AFSS or Projects) are all baked ahead of
  // time into a single flat JPEG per site kind (src/assets/cover-bg-*.jpg)
  // — nothing about the cover is assembled from multiple images at
  // PDF-build time. The watermark's position/size is fixed (not resized to
  // the actual title/address/badge content the way the approved mockup
  // shows), which is a deliberate trade against pixel-perfect fidelity: a
  // single baked-per-kind image, with only plain text drawn on top of it,
  // is the simplest and most robust thing this cover can be, after the
  // original per-report compositing (multiple doc.addImage() calls plus
  // jsPDF's GState opacity API) proved unreliable in the field.
  async function drawCoverPage(doc: jsPDF, findingsCount: number) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;

    const bg = await loadAssetAsDataUrl(site?.kind === "project" ? coverBgProjects : coverBgAfss);
    doc.addImage(bg.dataUrl, "JPEG", 0, 0, pageW, pageH);

    // report title + address, built bottom-up so we know exactly how tall
    // the details block is
    const title = site?.name || "Inspection";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    const titleLines: string[] = doc.splitTextToSize(title, contentW);
    const titleLineH = 46;
    const titleH = titleLines.length * titleLineH;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(32);
    const addressH = site?.address ? 38 : 0;

    const badgePillH = 28;
    const accentH = 4;
    const bottomPad = 56;
    const detailsH =
      accentH + 16 + titleH + (addressH ? 4 + addressH : 0) + 16 + badgePillH + bottomPad;

    // details block, anchored to the bottom of the page
    let dy = pageH - detailsH;
    doc.setFillColor(46, 196, 182);
    doc.rect(margin, dy, 56, accentH, "F");
    dy += accentH + 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    doc.setTextColor(255, 255, 255);
    doc.text(titleLines, margin, dy + 34);
    dy += titleH;

    if (site?.address) {
      dy += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(32);
      doc.setTextColor(195, 211, 224);
      doc.text(site.address, margin, dy + 26);
      dy += addressH;
    }
    dy += 16;

    // badge row: date (solid teal, reads first), then finding count and
    // inspector name as translucent white pills
    type Badge = { text: string; solid: [number, number, number] | null };
    const badges: Badge[] = [
      { text: formatFullDate(inspectionMs), solid: [46, 196, 182] },
      { text: `${findingsCount} finding${findingsCount === 1 ? "" : "s"}`, solid: null },
    ];
    const inspectorName = getInspectorName();
    if (inspectorName) {
      badges.push({ text: inspectorName, solid: null });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    let bx = margin;
    for (const badge of badges) {
      const pillW = doc.getTextWidth(badge.text) + 28;
      if (badge.solid) {
        doc.setFillColor(...badge.solid);
        doc.roundedRect(bx, dy, pillW, badgePillH, 14, 14, "F");
        doc.setTextColor(4, 20, 15);
      } else {
        // A plain solid fill standing in for "white at 12% opacity over
        // the cover's dark background" — precomputed rather than drawn
        // with jsPDF's GState opacity API, which this cover used to
        // depend on for every translucent pill. Removing that runtime
        // compositing (along with the multi-image watermark it also
        // gated) is the whole point of this rework: fewer moving parts
        // that can fail on-device.
        doc.setFillColor(35, 50, 60);
        doc.roundedRect(bx, dy, pillW, badgePillH, 14, 14, "F");
        doc.setTextColor(244, 247, 249);
      }
      doc.text(badge.text, bx + 14, dy + badgePillH / 2 + 4.5);
      bx += pillW + 10;
    }
  }

  async function buildPdf(): Promise<Blob> {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const blockGap = 28;

    // Half-page split: a fixed-width photo column on the left running from
    // the margin to the page's own centerline, and a text column that
    // always starts a fixed gap past that centerline — so the text edge
    // lines up down the page the same way for every finding, whether it
    // has one photo or three.
    const midX = pageW / 2;
    const photoColW = midX - margin;
    const textGap = 16;
    const textX = midX + textGap;
    const textColW = pageW - margin - textX;

    // Every photo tile is the same fixed box — cropped to fit, not
    // stretched — so a landscape and a portrait photo sit at identical
    // size next to each other. Up to 2 across; a 3rd (rare — most findings
    // only ever get 2 photos) drops in beneath the first rather than
    // widening the row.
    const tileGap = 8;
    const tileW = (photoColW - tileGap) / 2;
    const tileH = tileW * (161 / 121); // matches the approved mockup's proportions
    const tileAspect = tileH / tileW;

    await drawCoverPage(doc, items.length);
    doc.addPage();
    let y = margin;

    for (const item of items) {
      if (item.photos.length === 0) continue;

      // cropped to the tile shape from the original photo, THEN stamped, so
      // the timestamp is never trimmed off by the crop
      const tiles = await Promise.all(item.photos.map((p) => watermark(p.blob, p.takenAt, tileAspect)));
      const rows = Math.ceil(tiles.length / 2);
      const photosBlockH = rows * tileH + (rows - 1) * tileGap;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const titleLines = doc.splitTextToSize(item.finding.note || "Untitled finding", textColW);
      const defect = defectTypeStyle(item.finding.defectType);
      // level (as a subheading) and location, each on its own grey line
      const placeLines = [item.finding.level, item.finding.location].filter((t): t is string => !!t);
      const textBlockH =
        titleLines.length * 15 +
        (placeLines.length ? 18 + (placeLines.length - 1) * 13 : 0) +
        (defect ? PILL_H + 10 : 0);

      const blockH = Math.max(photosBlockH, textBlockH);

      if (y + blockH > pageH - margin) {
        doc.addPage();
        y = margin;
      }

      const rowTop = y;

      for (let i = 0; i < tiles.length; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const tx = margin + col * (tileW + tileGap);
        const ty = rowTop + row * (tileH + tileGap);
        doc.addImage(tiles[i], "JPEG", tx, ty, tileW, tileH);
      }

      // defect type bubble — above the title, when the finding has one
      let ty = rowTop + 14;
      if (defect) {
        const pillTop = rowTop + 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        const pillW = doc.getTextWidth(defect.label) + PILL_PAD_X * 2;
        doc.setFillColor(...defect.bgRgb);
        if (defect.value === "note-only") {
          // white bubble on a white page needs an outline to show up
          doc.setDrawColor(201, 196, 184);
          doc.setLineWidth(0.75);
          doc.roundedRect(textX, pillTop, pillW, PILL_H, PILL_H / 2, PILL_H / 2, "FD");
        } else {
          doc.roundedRect(textX, pillTop, pillW, PILL_H, PILL_H / 2, PILL_H / 2, "F");
        }
        doc.setTextColor(...defect.textRgb);
        doc.text(defect.label, textX + PILL_PAD_X, pillTop + PILL_H / 2, { baseline: "middle" });
        ty += PILL_H + 10;
      }

      // title + level + location, once per finding regardless of photo count,
      // always anchored to the shared centerline column
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(28, 30, 36);
      doc.text(titleLines, textX, ty);
      ty += titleLines.length * 15 + 8;

      if (placeLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(140, 140, 140);
        placeLines.forEach((line, i) => doc.text(line, textX, ty + i * 13));
      }

      y = rowTop + blockH + blockGap;
    }

    return doc.output("blob");
  }

  // Builds the PDF or Excel file and hands it to the native share sheet
  // (or a download, on desktop web).
  async function handleShare(kind: "pdf" | "excel") {
    setSharing(kind);
    if (kind === "excel") setExcelProgress({ percent: 0, step: "Getting ready…" });
    try {
      const blob =
        kind === "pdf"
          ? await buildPdf()
          : await (await import("../lib/excelExport")).buildFindingsWorkbook(items, inspectionMs, (p) =>
              setExcelProgress(
                p.stage === "photos"
                  ? { percent: p.total ? (85 * p.done) / p.total : 0, step: `Adding photos: ${p.done} of ${p.total}` }
                  : { percent: 88, step: "Building spreadsheet…" },
              ),
            );
      if (kind === "excel") setExcelProgress({ percent: 97, step: "Opening share menu…" });
      const inspectorName = getInspectorName();
      const filename = reportFilename(site?.name, inspectorName, kind === "pdf" ? "pdf" : "xlsx");
      const title = reportTitle(site?.name, inspectorName);

      if (Capacitor.isNativePlatform()) {
        // navigator.share() doesn't work for files inside an Android
        // WebView — write the file to the app's cache and hand THAT file
        // URI to the native share sheet instead.
        const uri = await writeToCache(blob, filename);
        setExcelProgress(null); // the share menu takes over from here
        await Share.share({
          title,
          url: uri,
        });
      } else {
        // plain web fallback (e.g. previewing in a desktop browser)
        setExcelProgress(null);
        const file = new File([blob], filename, { type: blob.type || "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      // a genuine failure (not the user cancelling the share sheet) —
      // surface it instead of silently doing nothing
      if (!(err instanceof Error) || !/cancell?ed/i.test(err.message)) {
        console.error(`${kind} share failed`, err);
        alert(`Couldn't share the ${kind === "pdf" ? "PDF" : "Excel file"}. Please try again.`);
      }
    } finally {
      setSharing(null);
      setExcelProgress(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, height: 64, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <RoundIconButton ariaLabel="Back to findings" onClick={() => navigate(`/site/${siteId}/findings`)}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Export preview</div>
        <div style={{ width: 40, height: 40 }} />
      </div>

      {/* paper preview */}
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "8px 16px 12px" }}>
        <div style={{ background: "var(--paper)", borderRadius: 12, padding: "22px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, borderBottom: "1px solid var(--paper-border)", paddingBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--paper-text)" }}>{reportTitle(site?.name, getInspectorName())}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-2)" }}>
              {site?.address ? `${site.address} · ` : ""}Inspected {formatDate(inspectionMs)}
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: "center", color: "var(--muted-2)", fontSize: 13, fontWeight: 600, padding: "20px 0" }}>
              Preparing preview…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--muted-2)", fontSize: 13, fontWeight: 600, padding: "20px 0" }}>
              No findings to export yet.
            </div>
          )}

          {items.map(({ finding, dataUrls }, idx) => (
            <div
              key={finding.id}
              style={{
                display: "flex",
                gap: 12,
                borderTop: idx === 0 ? "none" : "1px solid var(--paper-border)",
                paddingTop: idx === 0 ? 0 : 18,
              }}
            >
              <div style={{ flexShrink: 0, width: 92, display: "flex", flexDirection: "column", gap: 4 }}>
                {dataUrls.map((url) => (
                  <img key={url} src={url} alt="" style={{ width: "100%", borderRadius: 6, display: "block" }} />
                ))}
              </div>
              <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
                <DefectTypePill type={finding.defectType} size="sm" onPaper />
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--paper-text)", lineHeight: 1.35 }}>
                  {finding.note || "Untitled finding"}
                </div>
                {(finding.level || finding.location) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {finding.level && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-2)" }}>{finding.level}</div>}
                    {finding.location && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-2)" }}>{finding.location}</div>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* share bar */}
      <div style={{ flexShrink: 0, padding: "12px 16px calc(28px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => handleShare("excel")}
            disabled={loading || sharing !== null || items.length === 0 || !site}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "15px 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}
          >
            <IconShare size={16} />
            {sharing === "excel" ? "Preparing…" : "Share Excel"}
          </button>
          <button
            onClick={() => handleShare("pdf")}
            disabled={loading || sharing !== null || items.length === 0}
            className="glow-sweep"
            style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "15px 0", borderRadius: 12, background: "var(--accent)", border: "none", fontSize: 14, fontWeight: 800, color: "var(--accent-text)", overflow: "hidden" }}
          >
            <IconShare size={16} />
            {sharing === "pdf" ? "Preparing…" : "Share PDF"}
          </button>
        </div>
      </div>

      {excelProgress && <ProgressOverlay percent={excelProgress.percent} title="Preparing Excel" step={excelProgress.step} />}
    </div>
  );
}

// PDF defect type bubble size (pt)
const PILL_H = 14;
const PILL_PAD_X = 7;
