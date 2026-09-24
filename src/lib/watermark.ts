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
  return `${dd}/${mm}/${yy} - ${String(h).padStart(2, "0")}:${min} ${ampm}`;
}

// Stamp size, as a fraction of the photo's width — matched to the supplied
// mockup, where the digits stand 4.4% of the photo's width tall (Manrope
// bold digits are 0.75 of the font size). Width-based so every photo shows
// the same size stamp in the fixed-width PDF tiles and 5 cm Excel photos.
const STAMP_FONT_OF_WIDTH = 0.044 / 0.75;

// Draws the photo onto a full-resolution canvas with the timestamp on it.
// `cropAspect` (height / width) first crops the photo to that shape,
// "cover" style — the stamp goes on after cropping, so it's never cut off.
function stampedCanvas(blob: Blob, timestampMs: number, cropAspect?: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      let cropW = srcW;
      let cropH = srcH;
      if (cropAspect) {
        if (srcH / srcW > cropAspect) cropH = srcW * cropAspect; // trim top/bottom
        else cropW = srcH / cropAspect; // trim left/right
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(cropW);
      canvas.height = Math.round(cropH);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("no canvas context"));
        return;
      }
      ctx.drawImage(img, (srcW - cropW) / 2, (srcH - cropH) / 2, cropW, cropH, 0, 0, canvas.width, canvas.height);

      const text = formatTimestamp(timestampMs);
      const fontSize = Math.max(40, Math.round(canvas.width * STAMP_FONT_OF_WIDTH));
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
      resolve(canvas);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

// PDF / preview: data URL at the PDF's usual quality, optionally cropped to
// a tile shape (see stampedCanvas)
export async function watermark(blob: Blob, timestampMs: number, cropAspect?: number): Promise<string> {
  const canvas = await stampedCanvas(blob, timestampMs, cropAspect);
  return canvas.toDataURL("image/jpeg", 0.88);
}

// Excel: full resolution, near-lossless JPEG, plus its pixel size
export async function watermarkFullQuality(
  blob: Blob,
  timestampMs: number,
): Promise<{ jpeg: Blob; width: number; height: number }> {
  const canvas = await stampedCanvas(blob, timestampMs);
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo encode failed"))), "image/jpeg", 0.95),
  );
  const size = { width: canvas.width, height: canvas.height };
  // release the full-size bitmap straight away — exports can hold many
  canvas.width = 0;
  canvas.height = 0;
  return { jpeg, ...size };
}
