import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsPDF, GState } from "jspdf";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import type { Finding, Site } from "../db/types";
import { getSite, listFindings, listPhotos } from "../db/db";
import { IconChevronLeft, IconShare } from "../components/Icons";
import { getInitials, getInspectorName } from "../lib/profile";
import enfactWordmark from "../assets/enfact-wordmark.png";
import afssLogo from "../assets/afss-logo.png";
import projectsLogo from "../assets/projects-logo.png";

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

interface FindingImages {
  finding: Finding;
  dataUrls: string[];
}

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
function reportFilename(siteName: string | undefined, inspectorName: string) {
  const slug = (siteName ?? "inspection").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const initials = getInitials(inspectorName);
  return initials ? `${slug}-${initials}.pdf` : `${slug}.pdf`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// A flat navy → near-black diagonal wash, matching the app's brand
// gradient, rendered once as a JPEG the size of the page and used as the
// cover's full-bleed background.
function coverGradientDataUrl(w: number, h: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, w * 0.35, h);
  grad.addColorStop(0, "#0e2740");
  grad.addColorStop(0.6, "#071b2c");
  grad.addColorStop(1, "#05141f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.92);
}

// draws the photo onto a canvas with a burned-in bottom-right timestamp watermark
function watermark(blob: Blob, timestampMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("no canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);

      const text = formatTimestamp(timestampMs);
      const fontSize = Math.max(30, Math.round(canvas.width * 0.045));
      ctx.font = `700 ${fontSize}px Manrope, system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      const x = canvas.width - fontSize * 0.7;
      const y = canvas.height - fontSize * 0.7;

      ctx.lineWidth = Math.max(2, fontSize * 0.18);
      ctx.strokeStyle = "#000000";
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x, y);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export default function ExportPreview() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [items, setItems] = useState<FindingImages[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

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
        built.push({ finding, dataUrls });
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

  function imgSize(dataUrl: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = dataUrl;
    });
  }

  // Full-bleed cover page: brand gradient background, the EnFact wordmark
  // in a masthead strip, the site's classification logo (AFSS or Projects)
  // watermarked in the space beneath it, then the report's own details —
  // title, address, date, finding count and inspector — pulled out large
  // since that's what the reader actually needs from a cover.
  async function drawCoverPage(doc: jsPDF, findingsCount: number) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;
    const mastheadH = 118;

    doc.addImage(coverGradientDataUrl(pageW, pageH), "JPEG", 0, 0, pageW, pageH);

    const [enfactImg, kindImg] = await Promise.all([
      loadImage(enfactWordmark),
      loadImage(site?.kind === "project" ? projectsLogo : afssLogo),
    ]);

    // masthead: EnFact wordmark, fixed height, vertically centered
    const logoH = 46;
    const logoW = (enfactImg.naturalWidth / enfactImg.naturalHeight) * logoH;
    doc.addImage(enfactImg, "PNG", margin, (mastheadH - logoH) / 2, logoW, logoH);

    // report title + address, built bottom-up so we know exactly how tall
    // the details block is before laying out the watermark above it
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

    // classification watermark, centered in the blank space between the
    // masthead and the details block
    const watermarkTop = mastheadH;
    const watermarkAreaH = Math.max(0, pageH - mastheadH - detailsH);
    const maxLogoW = 420;
    const naturalW = kindImg.naturalWidth;
    const naturalH = kindImg.naturalHeight;
    let wmW = Math.min(maxLogoW, naturalW);
    let wmH = (naturalH / naturalW) * wmW;
    if (wmH > watermarkAreaH) {
      wmH = watermarkAreaH;
      wmW = (naturalW / naturalH) * wmH;
    }
    if (wmW > 0 && wmH > 0) {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.18 }));
      doc.addImage(kindImg, "PNG", (pageW - wmW) / 2, watermarkTop + (watermarkAreaH - wmH) / 2, wmW, wmH);
      doc.restoreGraphicsState();
    }

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
      { text: formatFullDate(Date.now()), solid: [46, 196, 182] },
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
        doc.saveGraphicsState();
        doc.setGState(new GState({ opacity: 0.12 }));
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(bx, dy, pillW, badgePillH, 14, 14, "F");
        doc.restoreGraphicsState();
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
    const contentW = pageW - margin * 2;
    const imgColW = 150;
    const colGap = 16;
    const textColW = contentW - imgColW - colGap;
    const photoGap = 8;
    const blockGap = 24;

    await drawCoverPage(doc, items.length);
    doc.addPage();
    let y = margin;

    for (const item of items) {
      if (item.dataUrls.length === 0) continue;

      // each photo keeps the full column width, stacked one under another
      // so a multi-photo finding is unmistakably one group
      const sizes = await Promise.all(item.dataUrls.map((u) => imgSize(u)));
      const photoHeights = sizes.map(({ w, h }) => (h / w) * imgColW);
      const photosBlockH = photoHeights.reduce((a, b) => a + b, 0) + photoGap * (photoHeights.length - 1);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const titleLines = doc.splitTextToSize(item.finding.note || "Untitled finding", textColW);
      const textBlockH = titleLines.length * 15 + (item.finding.location ? 18 : 0);

      const blockH = Math.max(photosBlockH, textBlockH);

      if (y + blockH > pageH - margin) {
        doc.addPage();
        y = margin;
      }

      const rowTop = y;

      let py = rowTop;
      for (let i = 0; i < item.dataUrls.length; i++) {
        doc.addImage(item.dataUrls[i], "JPEG", margin, py, imgColW, photoHeights[i]);
        py += photoHeights[i] + photoGap;
      }

      // title + location, once per finding regardless of photo count
      const textX = margin + imgColW + colGap;
      let ty = rowTop + 14;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(28, 30, 36);
      doc.text(titleLines, textX, ty);
      ty += titleLines.length * 15 + 8;

      if (item.finding.location) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(140, 140, 140);
        doc.text(item.finding.location, textX, ty);
      }

      y = rowTop + blockH + blockGap;
    }

    return doc.output("blob");
  }

  async function handleShare() {
    setSharing(true);
    try {
      const blob = await buildPdf();
      const inspectorName = getInspectorName();
      const filename = reportFilename(site?.name, inspectorName);
      const title = reportTitle(site?.name, inspectorName);

      if (Capacitor.isNativePlatform()) {
        // navigator.share() doesn't work for files inside an Android
        // WebView — write the PDF to the app's cache and hand THAT file
        // URI to the native share sheet instead.
        const base64 = await blobToBase64(blob);
        const written = await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({
          title,
          url: written.uri,
        });
      } else {
        // plain web fallback (e.g. previewing in a desktop browser)
        const file = new File([blob], filename, { type: "application/pdf" });
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
        console.error("PDF share failed", err);
        alert("Couldn't share the PDF. Please try again.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, height: 64, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          aria-label="Back to findings"
          onClick={() => navigate(`/site/${siteId}/findings`)}
          style={{ width: 40, height: 40, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}
        >
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </button>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Export preview</div>
        <div style={{ width: 40, height: 40 }} />
      </div>

      {/* paper preview */}
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "8px 16px 12px" }}>
        <div style={{ background: "var(--paper)", borderRadius: 12, padding: "22px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, borderBottom: "1px solid var(--paper-border)", paddingBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--paper-text)" }}>{reportTitle(site?.name, getInspectorName())}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-2)" }}>
              {site?.address ? `${site.address} · ` : ""}Inspected {formatDate(Date.now())}
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
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--paper-text)", lineHeight: 1.35 }}>
                  {finding.note || "Untitled finding"}
                </div>
                {finding.location && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-2)" }}>{finding.location}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* share bar */}
      <div style={{ flexShrink: 0, padding: "12px 16px calc(28px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleShare}
          disabled={loading || sharing || items.length === 0}
          className="glow-sweep"
          style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", textAlign: "center", padding: "15px 0", borderRadius: 12, background: "var(--accent)", border: "none", fontSize: 14, fontWeight: 800, color: "var(--accent-text)", overflow: "hidden" }}
        >
          <IconShare size={16} />
          {sharing ? "Preparing…" : "Share PDF"}
        </button>
      </div>
    </div>
  );
}
