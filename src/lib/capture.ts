import { Camera, CameraDirection } from "@capacitor/camera";


/**
 * Opens the device camera (native on Android/iOS via Capacitor, falls back to
 * the browser's file-input camera capture on plain web) and returns the
 * captured photo as a Blob, or null if the user cancelled.
 *
 * On native Android/iOS this also saves a copy straight to the device's
 * photo gallery.
 */
export async function capturePhoto(direction: CameraDirection = CameraDirection.Rear): Promise<Blob | null> {
  try {
    const result = await Camera.takePhoto({
      quality: 85,
      saveToGallery: true,
      correctOrientation: true,
      cameraDirection: direction,
    });

    if (result.webPath) {
      const res = await fetch(result.webPath);
      return await res.blob();
    }
    if (result.thumbnail) {
      const res = await fetch(`data:image/jpeg;base64,${result.thumbnail}`);
      return await res.blob();
    }
    return null;
  } catch {
    // user cancelled the camera or denied permission
    return null;
  }
}

export interface PickedPhoto {
  blob: Blob;
  // when it was taken, if the phone can tell (for the date stamp)
  takenAt?: number;
}

/**
 * Opens the phone's photo picker (Android's own; a file picker on plain
 * web) to choose one or several existing photos. Returns them in the order
 * picked — an empty list if the user cancelled.
 */
export async function pickFromGallery(): Promise<PickedPhoto[]> {
  try {
    const { results } = await Camera.chooseFromGallery({ allowMultipleSelection: true, includeMetadata: true, limit: 0 });
    const picked: PickedPhoto[] = [];
    for (const r of results) {
      if (!r.webPath) continue;
      const blob = await (await fetch(r.webPath)).blob();
      if (!blob.type.startsWith("image/") && blob.type !== "") continue;
      picked.push({ blob, takenAt: dateTaken(r.metadata?.exif, r.metadata?.creationDate) });
    }
    return picked;
  } catch {
    // cancelled or permission denied
    return [];
  }
}

// The photo's own "date taken" (EXIF DateTimeOriginal, "2026:09:28 14:05:11"
// in the phone's local time), else the file's creation date. Anything
// implausible (before 2000 or in the future) is ignored.
export function dateTaken(exif: unknown, creationDate?: string): number | undefined {
  let tags: Record<string, unknown> | undefined;
  if (typeof exif === "string") {
    try {
      tags = JSON.parse(exif);
    } catch {
      tags = undefined;
    }
  } else if (exif && typeof exif === "object") tags = exif as Record<string, unknown>;
  const candidates: number[] = [];
  for (const key of ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]) {
    const m = typeof tags?.[key] === "string" ? /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(tags[key] as string) : null;
    if (m) candidates.push(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime());
  }
  if (creationDate) candidates.push(Date.parse(creationDate));
  return candidates.find((t) => Number.isFinite(t) && t > Date.UTC(2000, 0, 1) && t < Date.now() + 86_400_000);
}
