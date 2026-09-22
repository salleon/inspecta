import { Camera, CameraDirection } from "@capacitor/camera";

export type { CameraDirection };

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
