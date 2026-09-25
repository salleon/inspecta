// Small JPEG copy of a photo for the list thumbnails. Showing a 12 MP camera
// photo in a 56 px box still makes the phone decode all 12 MP (~48 MB of
// memory each), which is what made long findings lists sluggish; a
// thumbnail is ~20 KB and decodes instantly.

// longest edge, px — sharp for a 56 px box on a 3x phone screen
const THUMB_EDGE = 320;

export async function makeThumbnail(photo: Blob): Promise<Blob> {
  const bitmap = await decodeSmall(photo);
  const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  const thumb = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("thumbnail encode failed"))), "image/jpeg", 0.82),
  );
  canvas.width = 0;
  canvas.height = 0;
  return thumb;
}

// Decode straight to a small size where the browser supports it (Android's
// WebView does), so the full-size bitmap never has to be held. EXIF
// rotation is applied, so thumbnails come out upright. Falls back to a
// plain <img> decode elsewhere.
async function decodeSmall(photo: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(photo, { resizeWidth: THUMB_EDGE * 2, resizeQuality: "medium", imageOrientation: "from-image" });
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
