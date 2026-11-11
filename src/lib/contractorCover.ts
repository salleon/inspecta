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

// a JPEG data URL for the whole page, wPt x hPt points
export async function coverBackground(wPt: number, hPt: number): Promise<string> {
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
  if (c.logo) {
    const shape = await logoShape(c.logo, "#ffffff");
    const fit = Math.min(box.w / shape.width, box.h / shape.height);
    const w = shape.width * fit;
    const h = shape.height * fit;
    ctx.globalAlpha = 0.09;
    ctx.drawImage(shape, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
  } else if (companyInitials(c)) {
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${285 * k}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(companyInitials(c), box.x + box.w / 2, box.y + box.h / 2);
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/jpeg", 0.9);
}

function size(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 200 });
    img.onerror = () => resolve({ w: 400, h: 200 });
    img.src = src;
  });
}

// the company's logo at the top left (on a white plate when that's
// switched on), or its initials and name when there's no logo
export async function drawCoverLogo(doc: jsPDF, x: number, y: number) {
  const c = getCompany();
  const s = companyScheme(c);
  if (c.logo) {
    const { w, h } = await size(c.logo);
    const fit = Math.min(60 / h, 220 / w);
    const lw = w * fit;
    const lh = h * fit;
    if (c.plate) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, lw + 24, lh + 16, 6, 6, "F");
      doc.addImage(c.logo, "PNG", x + 12, y + 8, lw, lh);
    } else {
      doc.addImage(c.logo, "PNG", x, y, lw, lh);
    }
    return;
  }
  doc.setFillColor(...(rgb(s.secondary) as RGB));
  doc.roundedRect(x, y, 50, 50, 11, 11, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...(rgb(onColour(s.secondary, s.primary)) as RGB));
  doc.text(companyInitials(c), x + 25, y + 32, { align: "center" });
  doc.setFontSize(19);
  doc.setTextColor(...(rgb(s.light) as RGB));
  doc.text(companyName(c), x + 62, y + 31);
}
