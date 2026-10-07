import { getInAppCamera } from "./settings";

// The in-app camera's picture, kept running for two minutes after the camera
// closes so the next photo (Save & next, + photo, Retake) opens instantly,
// and started as soon as a finger touches a camera button (warmCamera).
// Stopped straight away when the app goes to the background.

const KEEP_WARM_MS = 120_000;

let stream: MediaStream | null = null;
let opening: Promise<MediaStream> | null = null;
let users = 0;
let stopTimer: number | undefined;

function liveStream() {
  const track = stream?.getVideoTracks()[0];
  return track && track.readyState === "live" ? stream : null;
}

/** The camera's picture, opening the camera if it isn't running. Pair with releaseCamera. */
export function acquireCamera(): Promise<MediaStream> {
  users++;
  window.clearTimeout(stopTimer);
  return openStream();
}

function openStream(): Promise<MediaStream> {
  const live = liveStream();
  if (live) return Promise.resolve(live);
  stream = null;
  if (!opening) {
    opening = openMainCamera()
      .then((s) => {
        stream = s;
        // nobody's using it (it was warmed, then not used): stop it later
        if (!users) scheduleStop();
        return s;
      })
      .finally(() => {
        opening = null;
      });
  }
  return opening;
}

/** Done with the picture: it's kept running a while for the next photo. */
export function releaseCamera() {
  users = Math.max(0, users - 1);
  if (!users) scheduleStop();
}

/** The camera stopped (e.g. the phone took it away): open it afresh next time. */
export function dropCamera() {
  stopCamera();
}

/** Start the camera early (a finger is on a camera button). */
export function warmCamera() {
  if (!getInAppCamera() || typeof navigator.mediaDevices?.getUserMedia !== "function") return;
  window.clearTimeout(stopTimer);
  openStream().catch(() => {});
  if (!users) scheduleStop();
}

function scheduleStop() {
  window.clearTimeout(stopTimer);
  stopTimer = window.setTimeout(stopCamera, KEEP_WARM_MS);
}

function stopCamera() {
  window.clearTimeout(stopTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !users) stopCamera();
  });
}

const MAIN_CAMERA_KEY = "inspecta.mainCamera";
// The live picture, which photos are taken from (instantly, see
// InAppCamera): 4:3 like the camera app's photos, about 2.8 MP. Bigger than
// the reports use (1200 px), and small enough to start quickly and stay
// light while kept warm.
// zoom: true asks to use the camera's zoom (Chrome only offers it if asked)
const PREVIEW = { width: { ideal: 1920 }, height: { ideal: 1440 }, aspectRatio: { ideal: 4 / 3 }, zoom: true } as MediaTrackConstraints;

function getUserMedia(video: MediaTrackConstraints) {
  return navigator.mediaDevices.getUserMedia({ audio: false, video });
}

// Android lists each lens on the back as its own camera ("camera2 0, facing
// back", "camera2 2, facing back"...), and asking for just "the back
// camera" can give the ultra-wide one: stuck at .5×, no zoom, no flash. So
// the main one is picked, the lowest-numbered back camera, and remembered.
async function openMainCamera(): Promise<MediaStream> {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(MAIN_CAMERA_KEY);
  } catch {
    saved = null;
  }
  if (saved) {
    try {
      return await getUserMedia({ deviceId: { exact: saved }, ...PREVIEW });
    } catch {
      // that camera's gone (or renamed): look again
    }
  }
  // a first look (camera names can only be read once it's allowed)
  const first = await getUserMedia({ facingMode: { ideal: "environment" } });
  const main = await mainBackCamera();
  first.getTracks().forEach((t) => t.stop());
  if (main) {
    try {
      localStorage.setItem(MAIN_CAMERA_KEY, main);
    } catch {
      // best-effort
    }
    return getUserMedia({ deviceId: { exact: main }, ...PREVIEW });
  }
  return getUserMedia({ facingMode: { ideal: "environment" }, ...PREVIEW });
}

async function mainBackCamera(): Promise<string | undefined> {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId);
  const back = cams.filter((d) => /back|rear|environment/i.test(d.label));
  if (!back.length) return undefined;
  const num = (d: MediaDeviceInfo) => {
    const m = /camera2?\s*(\d+)/i.exec(d.label);
    return m ? Number(m[1]) : 99;
  };
  return back.sort((a, b) => num(a) - num(b))[0].deviceId;
}

