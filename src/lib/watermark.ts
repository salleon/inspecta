// Burns the capture time into the bottom-right of a photo — the same stamp
// on the PDF and the Excel export.
//
// Drawing through an <img> also bakes in the photo's EXIF rotation: phone
// cameras often store the pixels sideways plus an "rotate 90°" flag, which
// browsers honour but Excel ignores. The stamped output is always upright.

function formatTimestamp(ms: number) {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  // time first, then date: "02:48 PM - 24/09/26"
  return `${String(h).padStart(2, "0")}:${min} ${ampm} - ${dd}/${mm}/${yy}`;
}

// Stamp size, as a fraction of the photo's width — matched to the supplied
// mockup, where the digits stand 4.4% of the photo's width tall (Manrope
// bold digits are 0.75 of the font size). Width-based so every photo shows
// the same size stamp in the fixed-width PDF tiles and 5 cm Excel photos.
const STAMP_FONT_OF_WIDTH = 0.044 / 0.75;

// Sizes for stamped copies (longest edge, px). Exports: plenty for a photo
// printed ~4–5 cm wide (roughly 700+ dpi) and a fraction of the memory and
// file size of the 12 MP original. Preview: the on-screen export preview.
// The untouched full-resolution originals stay in the app's storage.
export const EXPORT_MAX_EDGE = 1600;
export const PREVIEW_MAX_EDGE = 480;

interface StampOptions {
  // crop to this shape (height / width) first, "cover" style — the stamp
  // goes on after cropping, so it's never cut off
  cropAspect?: number;
  // scale down so the longest edge is at most this many px
  maxEdge?: number;
}

// Decodes a photo upright (EXIF rotation applied). createImageBitmap's
// memory is freed the moment close() is called, rather than whenever the
// browser gets round to collecting an <img> — which matters when an export
// runs through a hundred 12 MP photos back to back. Falls back to <img>
// where createImageBitmap isn't available.
async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
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

// Draws the photo onto a canvas with the timestamp on it.
async function stampedCanvas(blob: Blob, timestampMs: number, { cropAspect, maxEdge }: StampOptions = {}): Promise<HTMLCanvasElement> {
  const photo = await decode(blob);
  try {
    const srcW = photo.width;
    const srcH = photo.height;
    let cropW = srcW;
    let cropH = srcH;
    if (cropAspect) {
      if (srcH / srcW > cropAspect) cropH = srcW * cropAspect; // trim top/bottom
      else cropW = srcH / cropAspect; // trim left/right
    }
    const scale = maxEdge ? Math.min(1, maxEdge / Math.max(cropW, cropH)) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropW * scale);
    canvas.height = Math.round(cropH * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(photo.source, (srcW - cropW) / 2, (srcH - cropH) / 2, cropW, cropH, 0, 0, canvas.width, canvas.height);

    const text = formatTimestamp(timestampMs);
    const fontSize = Math.max(8, Math.round(canvas.width * STAMP_FONT_OF_WIDTH));
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
    return canvas;
  } finally {
    photo.done();
  }
}

// Stamped JPEG as a data URL (PDF tiles, on-screen preview).
export async function watermark(blob: Blob, timestampMs: number, options?: StampOptions): Promise<string> {
  const canvas = await stampedCanvas(blob, timestampMs, options);
  const url = canvas.toDataURL("image/jpeg", 0.88);
  release(canvas);
  return url;
}

// Stamped JPEG as a Blob, plus its pixel size (Excel, photos zip).
export async function watermarkBlob(
  blob: Blob,
  timestampMs: number,
  { quality = 0.9, ...options }: StampOptions & { quality?: number } = {},
): Promise<{ jpeg: Blob; width: number; height: number }> {
  const canvas = await stampedCanvas(blob, timestampMs, options);
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo encode failed"))), "image/jpeg", quality),
  );
  const size = { width: canvas.width, height: canvas.height };
  release(canvas);
  return { jpeg, ...size };
}

// Free a canvas's bitmap straight away rather than waiting for garbage
// collection — exports go through many photos back to back.
function release(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}
