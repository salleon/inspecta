import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

// Android's own camera system (android/.../NativeCameraPlugin.java): the
// camera's picture is shown behind the app's screen, which goes see-through
// while the in-app camera is open. Used by InAppCamera on the phone; the
// browser camera (lib/cameraStream) everywhere else.

export interface NativeCameraInfo {
  zoomMin: number;
  zoomMax: number;
  zoom: number;
  hasFlash: boolean;
  streaming: boolean;
}

interface NativeCameraPlugin {
  start(o: { show: boolean }): Promise<NativeCameraInfo>;
  show(): Promise<void>;
  hide(): Promise<void>;
  stop(): Promise<void>;
  setZoom(o: { ratio: number }): Promise<void>;
  setFlash(o: { on: boolean }): Promise<void>;
  focus(o: { x: number; y: number }): Promise<void>;
  capture(): Promise<{ path: string }>;
  addListener(event: "state", fn: (s: { streaming: boolean }) => void): Promise<PluginListenerHandle>;
}

export const NativeCamera = registerPlugin<NativeCameraPlugin>("NativeCamera");

export function hasNativeCamera(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("NativeCamera");
}

/** A photo taken by the native camera, read in from where it was saved. */
export async function captureNative(): Promise<Blob> {
  const { path } = await NativeCamera.capture();
  return (await fetch(Capacitor.convertFileSrc(path))).blob();
}

// ---- kept ready ----
// Ready for five minutes after the camera closes. Android closes it when the
// phone locks or the app's put away, and opens it again when the app comes
// back (it's bound to the app); back after more than five minutes, it's
// stopped.

const KEEP_READY_MS = 5 * 60_000;
let users = 0;
let stopTimer: number | undefined;
let hiddenAt = 0;

function scheduleStop() {
  window.clearTimeout(stopTimer);
  stopTimer = window.setTimeout(() => void NativeCamera.stop().catch(() => {}), KEEP_READY_MS);
}

/** The camera, shown: for the camera screen. Pair with releaseNative. */
export function acquireNative(): Promise<NativeCameraInfo> {
  users++;
  window.clearTimeout(stopTimer);
  document.documentElement.classList.add("native-cam");
  return NativeCamera.start({ show: true });
}

/** The camera screen's closed: the picture's hidden, the camera stays ready a while. */
export function releaseNative() {
  users = Math.max(0, users - 1);
  if (users) return;
  document.documentElement.classList.remove("native-cam");
  void NativeCamera.hide().catch(() => {});
  scheduleStop();
}

/** Opens the camera early, not shown (a finger is on a camera button). */
export function warmNative() {
  window.clearTimeout(stopTimer);
  void NativeCamera.start({ show: users > 0 }).catch(() => {});
  if (!users) scheduleStop();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!hasNativeCamera()) return;
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
    } else if (!users && hiddenAt && Date.now() - hiddenAt > KEEP_READY_MS) {
      window.clearTimeout(stopTimer);
      void NativeCamera.stop().catch(() => {});
    }
  });
}
