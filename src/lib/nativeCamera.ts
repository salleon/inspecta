import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { getCameraFlash, getCameraZsl, setCameraZsl } from "./settings";

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
  // the ultra-wide lens, if the phone lists it as a camera of its own: how
  // its view compares with the main lens (e.g. 0.55); 0 if there isn't one
  wideFactor: number;
  lens: "main" | "wide";
}

interface NativeCameraPlugin {
  start(o: { show: boolean; zsl?: boolean; flash?: boolean }): Promise<NativeCameraInfo>;
  show(): Promise<void>;
  hide(): Promise<void>;
  stop(): Promise<void>;
  setZoom(o: { ratio: number }): Promise<void>;
  setLens(o: { wide: boolean }): Promise<NativeCameraInfo>;
  setFlash(o: { on: boolean }): Promise<void>;
  setZsl(o: { on: boolean }): Promise<void>;
  setLayout(o: { fill: boolean; top: number; height: number }): Promise<void>;
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
  let blob = await readCapture();
  let tail = await tailOf(blob);
  if (lastTail && sameBytes(tail, lastTail) && getCameraZsl()) {
    // the same photo as last time: some phones' zero shutter lag hands back
    // an old picture. Off for good on this phone, and the photo's taken again.
    setCameraZsl(false);
    await NativeCamera.setZsl({ on: false });
    blob = await readCapture();
    tail = await tailOf(blob);
  }
  lastTail = tail;
  return blob;
}

async function readCapture(): Promise<Blob> {
  const { path } = await NativeCamera.capture();
  return (await fetch(Capacitor.convertFileSrc(path))).blob();
}

// The end of the last photo's JPEG: the picture itself, not the details at
// the start (time, which way up), so a repeat of the same picture matches.
let lastTail: Uint8Array | null = null;

async function tailOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(Math.max(0, blob.size - 32768)).arrayBuffer());
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- kept ready ----
// Ready for five minutes after the camera closes. Android closes it when the
// phone locks or the app's put away, and opens it again when the app comes
// back (it's bound to the app); back after more than five minutes, it's
// stopped.

const KEEP_READY_MS = 5 * 60_000;
// Off for now, to see how quick the camera is from cold: the camera's
// stopped as soon as its screen closes. Set true to keep it ready again.
const KEEP_READY = false;
// warmed by a finger on a camera button, but its screen never opened
const WARM_ONLY_MS = 10_000;
let users = 0;
let stopTimer: number | undefined;
let hiddenAt = 0;

function scheduleStop() {
  window.clearTimeout(stopTimer);
  stopTimer = window.setTimeout(() => void NativeCamera.stop().catch(() => {}), KEEP_READY ? KEEP_READY_MS : WARM_ONLY_MS);
}

/** The camera, shown: for the camera screen. Pair with releaseNative. */
export function acquireNative(): Promise<NativeCameraInfo> {
  users++;
  window.clearTimeout(stopTimer);
  document.documentElement.classList.add("native-cam");
  return NativeCamera.start({ show: true, zsl: getCameraZsl(), flash: getCameraFlash() });
}

/** The camera screen's closed: the picture's hidden, the camera stays ready a while. */
export function releaseNative() {
  users = Math.max(0, users - 1);
  if (users) return;
  document.documentElement.classList.remove("native-cam");
  if (!KEEP_READY) {
    window.clearTimeout(stopTimer);
    void NativeCamera.stop().catch(() => {});
    return;
  }
  void NativeCamera.hide().catch(() => {});
  scheduleStop();
}

/** Opens the camera early, not shown (a finger is on a camera button). */
export function warmNative() {
  window.clearTimeout(stopTimer);
  void NativeCamera.start({ show: users > 0, zsl: getCameraZsl(), flash: getCameraFlash() }).catch(() => {});
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

// ---- why it couldn't start (shown in Settings, to report) ----

const ERROR_KEY = "inspecta.nativeCameraError";

export function saveNativeError(message: string) {
  try {
    localStorage.setItem(ERROR_KEY, `${new Date().toLocaleString()}: ${message}`);
  } catch {
    // best-effort
  }
}

export function lastNativeError(): string | null {
  try {
    return localStorage.getItem(ERROR_KEY);
  } catch {
    return null;
  }
}
