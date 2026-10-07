import type { Mark } from "../db/types";

// Drawing the marks from ✎ Mark up (red circles, measurements, arrows, pen)
// onto a photo. The same drawing is used by the editor on screen and for the
// full-size marked photo, so what you see is what's exported.

export const RED = "#ff3b30";
export const YELLOW = "#ffd60a";

// line widths etc. are in thousandths of the photo's longer side, so marks
// look the same on a phone screen and on a 12 MP photo
function unit(w: number, h: number) {
  return Math.max(w, h) / 1000;
}

function arrowHead(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, size: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - size * Math.cos(a - 0.42), y1 - size * Math.sin(a - 0.42));
  g.lineTo(x1 - size * Math.cos(a + 0.42), y1 - size * Math.sin(a + 0.42));
  g.closePath();
  g.fill();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// where the measurement's label sits (its middle), in px
export function labelBox(g: CanvasRenderingContext2D, m: Extract<Mark, { t: "measure" }>, w: number, h: number) {
  const u = unit(w, h);
  g.font = `800 ${Math.round(38 * u)}px "Manrope Variable", Manrope, system-ui, sans-serif`;
  const bw = g.measureText(m.label).width + 30 * u;
  const bh = 58 * u;
  return { x: ((m.x0 + m.x1) / 2) * w - bw / 2, y: ((m.y0 + m.y1) / 2) * h - bh / 2, w: bw, h: bh };
}

// one mark, onto a canvas `w` × `h` px showing the whole photo.
// noLabel: the measurement's label is being typed in a box over it
export function drawMark(g: CanvasRenderingContext2D, m: Mark, w: number, h: number, noLabel = false) {
  const u = unit(w, h);
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  if (m.t === "circle") {
    const cx = m.cx * w, cy = m.cy * h, rx = Math.max(1, m.rx * w), ry = Math.max(1, m.ry * h);
    g.strokeStyle = "rgba(0,0,0,.35)";
    g.lineWidth = 12.5 * u;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = RED;
    g.lineWidth = 8.5 * u;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (m.t === "measure") {
    const x0 = m.x0 * w, y0 = m.y0 * h, x1 = m.x1 * w, y1 = m.y1 * h;
    g.strokeStyle = "rgba(0,0,0,.4)";
    g.lineWidth = 10 * u;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.strokeStyle = YELLOW;
    g.fillStyle = YELLOW;
    g.lineWidth = 6 * u;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    arrowHead(g, x1, y1, x0, y0, 30 * u);
    arrowHead(g, x0, y0, x1, y1, 30 * u);
    if (m.label.trim() && !noLabel) {
      const b = labelBox(g, m, w, h);
      g.fillStyle = "rgba(14,39,64,.92)";
      g.strokeStyle = YELLOW;
      g.lineWidth = 4 * u;
      roundRect(g, b.x, b.y, b.w, b.h, 14 * u);
      g.fill();
      g.stroke();
      g.fillStyle = YELLOW;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(m.label.trim(), b.x + b.w / 2, b.y + b.h / 2 + 2 * u);
    }
  } else if (m.t === "arrow") {
    const x0 = m.x0 * w, y0 = m.y0 * h, x1 = m.x1 * w, y1 = m.y1 * h;
    g.strokeStyle = RED;
    g.fillStyle = RED;
    g.lineWidth = 8 * u;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    arrowHead(g, x0, y0, x1, y1, 34 * u);
  } else if (m.pts.length) {
    g.strokeStyle = RED;
    g.lineWidth = 8 * u;
    g.beginPath();
    m.pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
    if (m.pts.length === 1) g.lineTo(m.pts[0][0] * w + 0.01, m.pts[0][1] * h);
    g.stroke();
  }
  g.restore();
}

export function drawMarks(g: CanvasRenderingContext2D, marks: Mark[], w: number, h: number) {
  for (const m of marks) drawMark(g, m, w, h);
}

// the photo upright (EXIF rotation applied), whatever the browser
export async function decodeUpright(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// The photo with the marks drawn in (a JPEG), at most `maxEdge` px on its
// long side: what's shown and exported for a marked-up photo. (Twice what
// the reports use; a full 12 MP canvas was too much for some phones.)
export async function renderMarked(original: Blob, marks: Mark[], maxEdge = 2400): Promise<Blob> {
  const photo = await decodeUpright(original);
  const scale = Math.min(1, maxEdge / Math.max(photo.width, photo.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(photo.width * scale));
  canvas.height = Math.max(1, Math.round(photo.height * scale));
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
  photo.done();
  await document.fonts?.load?.(`800 40px "Manrope Variable"`).catch(() => {});
  drawMarks(g, marks, canvas.width, canvas.height);
  const out = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("marked photo encode failed"))), "image/jpeg", 0.92),
  );
  canvas.width = 0;
  canvas.height = 0;
  return out;
}

// renderMarked that never fails: smaller if it has to, else nothing (the
// marks are still kept with the photo, so they can be drawn again later)
export async function renderMarkedSafe(original: Blob, marks: Mark[]): Promise<Blob | undefined> {
  for (const edge of [2400, 1600]) {
    try {
      return await renderMarked(original, marks, edge);
    } catch {
      // try smaller
    }
  }
  return undefined;
}

// what's shown and exported for a photo: marked up if it has marks
export function shownBlob(photo: { blob: Blob; marked?: Blob; marks?: Mark[] }): Blob {
  return photo.marks?.length && photo.marked ? photo.marked : photo.blob;
}
