import { EXPORT_MAX_EDGE } from "./watermark";

// The copy of a photo that the PDF and Excel exports work from: upright,
// at most EXPORT_MAX_EDGE px (what the exports use anyway), no stamp.
// Loading a 12 MP original is the slowest part of an export, so this is
// made once, in the background soon after the photo is taken (see
// db/getExportCopy), and every export after that starts from ~1.4 MP
// instead. The original stays as it is, for the full-resolution photos
// zip and backups.
export async function makeExportCopy(photo: Blob): Promise<Blob> {
  const bitmap = await decodeUpright(photo);
  const scale = Math.min(1, EXPORT_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  const copy = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export copy encode failed"))), "image/jpeg", 0.92),
  );
  canvas.width = 0;
  canvas.height = 0;
  return copy;
}

// EXIF rotation applied, so the copy (and everything stamped from it) is
// upright. Falls back to a plain <img> decode where createImageBitmap
// can't.
async function decodeUpright(photo: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(photo, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(photo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
