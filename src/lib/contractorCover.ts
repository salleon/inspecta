import type { jsPDF } from "jspdf";
import { companyInitials, companyName, companyScheme, getCompany, logoShape, luminance, mix, onColour, rgb } from "./company";

// Contractor mode's PDF cover (canvas "Inspecta for contractors"): the
// company's dark colour as a soft gradient, its logo top left, and the
// logo's shape very faint and centred as a watermark. Like EnFact's cover,
// the background and watermark are one flat JPEG drawn in a canvas first,
// so the PDF needs no see-through drawing (jsPDF's opacity proved
// unreliable on phones). The details block at the bottom is drawn by
// Export.tsx in the colours from coverColours().

type RGB = [number, number, number];

export function coverColours() {
  const s = companyScheme();
  return {
    accent: rgb(s.secondary) as RGB,
    onAccent: rgb(onColour(s.secondary, s.primary)) as RGB,
    address: rgb(mix(s.light, s.primary, 0.22)) as RGB,
    pill: rgb(mix(mix(s.primary, "#000000", 0.2), "#ffffff", 0.14)) as RGB,
  };
}

// a JPEG data URL for the whole page, wPt x hPt points. With no logo, the
// middle has EnFact's cover square, minus EnFact's logo, with AFSS or
// PROJECTS, an accent rule and what the report is.
export async function coverBackground(wPt: number, hPt: number, kind: "afss" | "project"): Promise<string> {
  const c = getCompany();
  const s = companyScheme(c);
  const k = 2; // 144 dpi
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(wPt * k);
  canvas.height = Math.round(hPt * k);
  const ctx = canvas.getContext("2d")!;
  const dark = luminance(s.primary) < 0.4;
  const top = dark ? mix(s.primary, "#ffffff", 0.05) : mix(s.primary, "#000000", 0.55);
  const middle = dark ? s.primary : mix(s.primary, "#000000", 0.65);
  const bottom = dark ? mix(s.primary, "#000000", 0.4) : mix(s.primary, "#000000", 0.75);
  const g = ctx.createLinearGradient(0, 0, canvas.width * 0.14, canvas.height);
  g.addColorStop(0, top);
  g.addColorStop(0.48, middle);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // the watermark's box, centred between the logo and the title
  const box = { x: 65 * k, y: 142 * k, w: 466 * k, h: 388 * k };
  // (a logo that can't be read gets the square instead)
  const shape = c.logo ? await logoShape(c.logo, "#ffffff").catch(() => null) : null;
  if (shape) {
    const fit = Math.min(box.w / shape.width, box.h / shape.height);
    const w = shape.width * fit;
    const h = shape.height * fit;
    ctx.globalAlpha = 0.09;
    ctx.drawImage(shape, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
  } else {
    // the square (as on EnFact's cover artwork: 87.5, 130, 419.5 pt)
    const sq = { x: 87.5 * k, y: 130 * k, s: 419.5 * k };
    const fill = ctx.createLinearGradient(0, sq.y, sq.s * 0.14, sq.y + sq.s);
    fill.addColorStop(0, mix(middle, "#ffffff", 0.2));
    fill.addColorStop(1, mix(middle, "#ffffff", 0.15));
    ctx.fillStyle = fill;
    ctx.fillRect(sq.x, sq.y, sq.s, sq.s);
    // canvas "Cover square labels", style A: the word in carved lettering,
    // a short accent rule, then what the report is in small spaced capitals
    const word = kind === "project" ? "PROJECTS" : "AFSS";
    const sub = kind === "project" ? "PROJECT REPORT" : "ANNUAL FIRE SAFETY STATEMENT";
    const face = '"Manrope Variable", Helvetica, Arial, sans-serif';
    await document.fonts?.load(`800 100px ${face}`).catch(() => {});
    const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    ctx.font = `800 100px ${face}`;
    const size = Math.min(139 * k, (100 * sq.s * 0.82) / ctx.measureText(word).width);
    // the line underneath: 17 pt, smaller if it would come near the edges
    const subWidth = (pt: number) => {
      ctx.font = `800 ${pt}px ${face}`;
      if ("letterSpacing" in ctx) spaced.letterSpacing = `${(0.22 * pt).toFixed(1)}px`;
      const w = ctx.measureText(sub).width;
      if ("letterSpacing" in ctx) spaced.letterSpacing = "0px";
      return w;
    };
    const subSize = Math.min(17 * k, (17 * k * sq.s * 0.72) / subWidth(17 * k));
    const rule = { w: 66 * k, h: 5.5 * k };
    const gap = 22 * k;
    const cap = size * 0.72; // the word's capital height
    const top = sq.y + (sq.s - (cap + gap + rule.h + gap + subSize)) / 2;
    const cx = sq.x + sq.s / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 ${size}px ${face}`;
    ctx.fillStyle = mix(middle, "#ffffff", 0.02);
    ctx.fillText(word, cx, top + cap);
    ctx.fillStyle = s.secondary;
    ctx.fillRect(cx - rule.w / 2, top + cap + gap, rule.w, rule.h);
    ctx.font = `800 ${subSize}px ${face}`;
    if ("letterSpacing" in ctx) spaced.letterSpacing = `${(0.22 * subSize).toFixed(1)}px`;
    ctx.fillStyle = mix(s.light, s.primary, 0.22);
    // (letter spacing adds a space after the last letter too; nudged back)
    ctx.fillText(sub, cx + ("letterSpacing" in ctx ? 0.11 * subSize : 0), top + cap + gap + rule.h + gap + subSize * 0.8);
    if ("letterSpacing" in ctx) spaced.letterSpacing = "0px";
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/jpeg", 0.9);
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 200 });
    img.onerror = () => resolve({ w: 400, h: 200 });
    img.src = src;
  });
}

// the company's logo at the top left (on a white plate when that's
// switched on), or its name set in an outlined box when there's no logo
export async function drawCoverLogo(doc: jsPDF, x: number, y: number) {
  const c = getCompany();
  const s = companyScheme(c);
  // the logo is always a PNG (lib/company: logos are made one when saved,
  // and repairLogo fixes older ones); one that still can't be drawn falls
  // back to the name box rather than failing the PDF
  if (c.logo?.startsWith("data:image/png;base64,")) {
    const { w, h } = await imageSize(c.logo);
    const fit = Math.min(60 / h, 220 / w);
    const lw = w * fit;
    const lh = h * fit;
    try {
      if (c.plate) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, lw + 24, lh + 16, 6, 6, "F");
        doc.addImage(c.logo, "PNG", x + 12, y + 8, lw, lh);
      } else {
        doc.addImage(c.logo, "PNG", x, y, lw, lh);
      }
      return;
    } catch (err) {
      console.error("logo can't go on the cover", err);
    }
  }
  const name = (companyName(c) || companyInitials(c)).toUpperCase();
  if (!name) return;
  const space = 1.6;
  doc.setFont("helvetica", "bold");
  let size = 15;
  const width = () => doc.getTextWidth(name) + space * (name.length - 1);
  doc.setFontSize(size);
  while (width() > 300 && size > 9) doc.setFontSize(--size);
  const h = 40;
  doc.setDrawColor(...(rgb(s.secondary) as RGB));
  doc.setLineWidth(1.5);
  doc.roundedRect(x, y, width() + 32, h, 8, 8, "S");
  doc.setTextColor(...(rgb(s.light) as RGB));
  doc.text(name, x + 16, y + h / 2 + size * 0.35, { charSpace: space });
}
