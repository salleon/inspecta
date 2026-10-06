import { Camera, CameraDirection } from "@capacitor/camera";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Mark } from "../db/types";
import { getInAppCamera } from "./settings";

// A photo from the camera, with any marks drawn on it straight away
// (✎ Mark up on the camera's quick check).
export interface Captured {
  blob: Blob;
  marks?: Mark[];
}

// what the camera's top chip says, e.g. "New finding · Level 3"
export interface CameraLabel {
  title: string;
  level?: string;
}

// ---- the in-app camera and the markup editor, shown by PhotoToolsHost ----

export type PhotoToolRequest =
  | { kind: "camera"; label: CameraLabel; resolve: (r: Captured | null | "fallback") => void }
  | { kind: "markup"; blob: Blob; marks: Mark[]; resolve: (marks: Mark[] | null) => void };

let request: PhotoToolRequest | null = null;
const listeners = new Set<() => void>();

export function subscribePhotoTools(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function currentPhotoTool() {
  return request;
}
function show(r: PhotoToolRequest | null) {
  request = r;
  listeners.forEach((l) => l());
}

/**
 * Takes a photo: with Inspecta's own camera (no Android camera app, and a
 * quick check after the shot: Retake / ✎ Mark up / Use), or the Android
 * camera if that's switched on in Settings or the in-app one can't start.
 * Null if cancelled. Either way a copy goes to the phone's gallery.
 */
export async function capturePhoto(label: CameraLabel = { title: "New photo" }): Promise<Captured | null> {
  if (getInAppCamera() && typeof navigator.mediaDevices?.getUserMedia === "function") {
    const r = await new Promise<Captured | null | "fallback">((resolve) =>
      show({
        kind: "camera",
        label,
        resolve: (v) => {
          show(null);
          resolve(v);
        },
      }),
    );
    if (r !== "fallback") return r;
  }
  const blob = await systemCamera();
  return blob ? { blob } : null;
}

/** Opens the markup editor on a photo; the marks when Done, null if cancelled. */
export function markUpPhoto(blob: Blob, marks: Mark[] = []): Promise<Mark[] | null> {
  return new Promise((resolve) =>
    show({
      kind: "markup",
      blob,
      marks,
      resolve: (m) => {
        show(null);
        resolve(m);
      },
    }),
  );
}

// the app's own native bit (android/.../GalleryPlugin.java)
const Gallery = registerPlugin<{ savePhoto(o: { data: string; name: string }): Promise<void> }>("Gallery");

/** A copy of a photo from the in-app camera into the phone's gallery (DCIM/Inspecta). Best effort. */
export async function saveToGallery(blob: Blob, takenAt = Date.now()) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const d = new Date(takenAt);
    const p = (n: number) => String(n).padStart(2, "0");
    const name = `IMG_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    await Gallery.savePhoto({ data, name });
  } catch {
    // the photo is in the app either way
  }
}

/**
 * The Android camera app (Capacitor; the browser's file-input camera on
 * plain web): the captured photo, or null if cancelled. On Android this also
 * saves a copy straight to the device's photo gallery.
 */
export async function systemCamera(direction: CameraDirection = CameraDirection.Rear): Promise<Blob | null> {
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
