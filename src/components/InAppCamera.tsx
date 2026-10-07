import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Mark } from "../db/types";
import type { CameraLabel, Captured } from "../lib/capture";
import { saveToGallery } from "../lib/capture";
import { useBackHandler } from "../lib/backButton";
import { getCameraFlash, setCameraFlash } from "../lib/settings";
import MarkupEditor from "./MarkupEditor";
import CameraStartScreen from "./CameraStartScreen";
import { acquireCamera, dropCamera, releaseCamera } from "../lib/cameraStream";
import { acquireNative, captureNative, hasNativeCamera, NativeCamera, releaseNative, saveNativeError } from "../lib/nativeCamera";
import "./PhotoTools.css";

// Inspecta's own camera (no Android camera app): the camera's picture full
// screen, tap to focus, pinch or .5× / 1× / 2× to zoom, flash on / off.
// After the shutter, a quick check: Retake / ✎ Mark up / Use ✓.
// `onDone`: the photo; null if closed. If the camera can't start, the
// reason's shown here (no backup camera).

interface Props {
  label: CameraLabel;
  onDone: (r: Captured | null | "fallback") => void;
}

interface Caps {
  zoom: { min: number; max: number };
  // no zoom from the camera itself: the picture is enlarged and the photo
  // cropped to match (2× keeps the middle half)
  digital: boolean;
  torch: boolean;
  focus: boolean;
}

// gravity's pull on the phone, so a photo taken with the phone sideways
// comes out upright (the app's screen stays upright, so the camera's
// picture doesn't turn by itself): degrees to turn the photo clockwise
function tiltTurn(x: number, y: number, last: number): number {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax < 4 && ay < 4) return last; // flat on its back: keep the last one
  if (ax > ay + 2) return x > 0 ? 270 : 90;
  if (ay > ax + 2) return y > 0 ? 0 : 180;
  return last;
}

export default function InAppCamera({ label, onDone }: Props) {
  // on the phone: Android's own camera, its picture behind this screen
  // (lib/nativeCamera); in a browser, the browser's camera in a <video>
  const [native] = useState(hasNativeCamera);
  // the camera couldn't start: why, shown here (there's no backup camera,
  // so the reason can be read and reported)
  const [failed, setFailed] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [caps, setCaps] = useState<Caps>({ zoom: DIGITAL_ZOOM, digital: true, torch: false, focus: false });
  const [ready, setReady] = useState(false);
  // the picture is coming through (until then the video shows nothing,
  // not Android's grey ▶ placeholder)
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState(getCameraFlash);
  const [zoom, setZoom] = useState(1);
  const [focusAt, setFocusAt] = useState<{ x: number; y: number; n: number } | null>(null);
  const [shooting, setShooting] = useState(false);
  const [blink, setBlink] = useState(0);
  // the quick check after the shutter
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [marking, setMarking] = useState(false);
  const turnRef = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // start the camera (and again if the phone stopped it, e.g. the app was
  // put away)
  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    let listener: { remove: () => Promise<void> } | null = null;
    (async () => {
      try {
        listener = await NativeCamera.addListener("state", (s) => {
          if (!cancelled) setLive(s.streaming);
        });
        // (instant if it was used in the last five minutes, or a finger
        // went down on the camera button)
        const info = await acquireNative();
        if (cancelled) return;
        setCaps({ zoom: { min: info.zoomMin, max: info.zoomMax }, digital: false, torch: info.hasFlash, focus: true });
        // back to 1× (it may still be zoomed from the last photo)
        if (Math.abs(info.zoom - 1) > 0.01 && info.zoomMin <= 1) void NativeCamera.setZoom({ ratio: 1 });
        setZoom(info.zoomMin <= 1 ? 1 : info.zoom);
        void NativeCamera.setFlash({ on: getCameraFlash() });
        if (info.streaming) setLive(true);
        setReady(true);
      } catch (e) {
        // Android's camera couldn't start: say why, here (no backup camera)
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        console.error("Native camera:", message);
        saveNativeError(message);
        setFailed(message);
      }
    })();
    return () => {
      cancelled = true;
      void listener?.remove();
      releaseNative();
    };
  }, [native]);

  useEffect(() => {
    if (native) return;
    let cancelled = false;
    let acquired = false;
    async function start() {
      try {
        // (already running if a photo was just taken, or a finger went
        // down on the camera button: then it's instant)
        const opening = acquireCamera();
        acquired = true;
        const stream = await opening;
        if (cancelled) return;
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const tc = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: { min: number; max: number }; torch?: boolean; focusMode?: string[] };
        const next: Caps = {
          zoom: tc.zoom && tc.zoom.max > tc.zoom.min ? { min: tc.zoom.min, max: tc.zoom.max } : DIGITAL_ZOOM,
          digital: !(tc.zoom && tc.zoom.max > tc.zoom.min),
          torch: !!tc.torch,
          focus: !!tc.focusMode?.length,
        };
        if (cancelled) return;
        setCaps(next);
        // back to 1× (it may still be zoomed from the last photo)
        const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
        if (!next.digital && settings.zoom && Math.abs(settings.zoom - 1) > 0.01 && next.zoom.min <= 1) {
          track.applyConstraints({ advanced: [{ zoom: 1 } as MediaTrackConstraintSet] }).catch(() => {});
        } else if (settings.zoom) setZoom(settings.zoom);
        track.addEventListener("ended", () => {
          if (!cancelled && document.visibilityState === "visible") void restart();
        });
        setReady(true);
      } catch (e) {
        // no camera, or no permission: the Android camera instead (after
        // Android's own camera failed too, say why first)
        if (acquired) releaseCamera();
        acquired = false;
        if (cancelled) return;
        setFailed(e instanceof Error ? e.message : String(e));
      }
    }
    async function restart() {
      if (acquired) releaseCamera();
      acquired = false;
      dropCamera();
      streamRef.current = null;
      setReady(false);
      setLive(false);
      await start();
    }
    function onVisible() {
      const track = streamRef.current?.getVideoTracks()[0];
      if (document.visibilityState === "visible" && (!track || track.readyState === "ended")) void restart();
    }
    void start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      // kept running five minutes for the next photo
      streamRef.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => {});
      if (acquired) releaseCamera();
      streamRef.current = null;
    };
  }, [native]);

  // which way up the phone is held
  useEffect(() => {
    function onMotion(e: DeviceMotionEvent) {
      const g = e.accelerationIncludingGravity;
      if (g?.x != null && g?.y != null) turnRef.current = tiltTurn(g.x, g.y, turnRef.current);
    }
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  useBackHandler(() => {
    if (marking) return false; // the editor handles it
    if (shot) retake();
    else onDone(null);
    return true;
  });

  function track() {
    return streamRef.current?.getVideoTracks()[0];
  }

  function applyZoom(z: number) {
    const v = Math.min(caps.zoom.max, Math.max(caps.zoom.min, z));
    setZoom(v);
    if (native) {
      void NativeCamera.setZoom({ ratio: v }).catch(() => {});
      return;
    }
    if (caps.digital) return;
    track()?.applyConstraints({ advanced: [{ zoom: v } as MediaTrackConstraintSet] }).catch(() => {});
  }

  function toggleFlash() {
    const on = !flash;
    setFlash(on);
    setCameraFlash(on);
    if (native) void NativeCamera.setFlash({ on }).catch(() => {});
  }

  // where the picture sits on the screen (it's shown whole, "contain")
  function pictureRect() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const r = v.getBoundingClientRect();
    const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const w = v.videoWidth * s, h = v.videoHeight * s;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }

  function focusAtPoint(clientX: number, clientY: number) {
    if (native) {
      setFocusAt((f) => ({ x: clientX, y: clientY, n: (f?.n ?? 0) + 1 }));
      void NativeCamera.focus({ x: clientX / window.innerWidth, y: clientY / window.innerHeight }).catch(() => {});
      return;
    }
    const p = pictureRect();
    if (!p) return;
    const x = (clientX - p.left) / p.width, y = (clientY - p.top) / p.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setFocusAt((f) => ({ x: clientX, y: clientY, n: (f?.n ?? 0) + 1 }));
    if (!caps.focus) return;
    const t = track();
    t?.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: "single-shot" } as MediaTrackConstraintSet] })
      .catch(() => t?.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }] } as MediaTrackConstraintSet] }))
      .catch(() => {});
  }
  useEffect(() => {
    if (!focusAt) return;
    const id = window.setTimeout(() => setFocusAt(null), 1200);
    return () => window.clearTimeout(id);
  }, [focusAt]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      tapStart.current = null;
    } else tapStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      applyZoom(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist));
    }
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const t = tapStart.current;
    tapStart.current = null;
    if (t && Date.now() - t.t < 500 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 12) focusAtPoint(e.clientX, e.clientY);
  }

  // The photo is the camera's picture at the moment the shutter's pressed:
  // instant, so nothing moves between the press and the photo. (A separate
  // full-size shot made Android stop, refocus and re-expose first, about
  // half a second, long enough to blur it.)
  async function takeShot() {
    if (native) return takeNativeShot();
    const video = videoRef.current;
    const t = track();
    if (!video || !t || shooting || !ready || !video.videoWidth) return;
    setShooting(true);
    const turn = turnRef.current;
    let torchOn = false;
    try {
      if (flash && caps.torch) {
        // the flash: the torch, on just long enough for the picture to brighten
        await t.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] }).catch(() => {});
        torchOn = true;
        await new Promise((r) => setTimeout(r, 350));
      }
      const frame = grabFrame(video, turn, caps.digital ? zoom : 1);
      // the picture stops where it was, straight away, while it's saved
      video.pause();
      setBlink((n) => n + 1);
      if (torchOn) {
        torchOn = false;
        void t.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => {});
      }
      const blob = await encode(frame);
      frame.width = frame.height = 0;
      setShot({ blob, url: URL.createObjectURL(blob) });
    } catch {
      // nothing taken; the shutter can be pressed again
      void video.play().catch(() => {});
    } finally {
      if (torchOn) void t.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => {});
      setShooting(false);
    }
  }

  // Android's camera takes the photo: full size, the moment the shutter's
  // pressed on phones with zero shutter lag, upright for how it was held
  async function takeNativeShot() {
    if (shooting || !ready) return;
    setShooting(true);
    setBlink((n) => n + 1);
    try {
      const blob = await captureNative();
      setShot({ blob, url: URL.createObjectURL(blob) });
    } catch {
      // nothing taken; the shutter can be pressed again
    } finally {
      setShooting(false);
    }
  }

  function retake() {
    void videoRef.current?.play().catch(() => {});
    setShot(null);
    setMarking(false);
  }

  function use(marks?: Mark[]) {
    if (!shot) return;
    void saveToGallery(shot.blob);
    onDone({ blob: shot.blob, marks: marks?.length ? marks : undefined });
  }

  const zoomStops = [0.5, 1, 2].filter((z) => z >= caps.zoom.min - 0.05 && z <= caps.zoom.max + 0.05);
  const nearest = zoomStops.reduce((a, z) => (Math.abs(z - zoom) < Math.abs(a - zoom) ? z : a), zoomStops[0] ?? 1);
  const flashKnown = caps.torch;

  return (
    <div className={native ? "cam native" : "cam"} data-testid="in-app-camera">
      <div className="cam-view" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {!native && (
          <video ref={videoRef} playsInline muted autoPlay poster={BLANK} onPlaying={() => setLive(true)} style={{ opacity: shot || !live ? 0 : 1, transform: caps.digital && zoom > 1 ? `scale(${zoom})` : undefined }} />
        )}
        {shot && <img className="cam-shot" src={shot.url} alt="" />}
        <CameraStartScreen live={live} />
        {focusAt && !shot && <span key={focusAt.n} className="cam-focus" style={{ left: focusAt.x, top: focusAt.y }} />}
        {blink > 0 && <span key={blink} className="cam-blink" />}
      </div>
      <div className="cam-top">
        <button className="cam-rb" aria-label="Close camera" onClick={() => onDone(null)}>
          ✕
        </button>
        <span className="cam-chip">
          {label.title}
          {label.level ? (
            <>
              {" · "}
              <i>{label.level}</i>
            </>
          ) : null}
        </span>
        {!shot && flashKnown ? (
          <button className={`cam-rb${flash ? " on" : ""}`} aria-label={flash ? "Flash on" : "Flash off"} aria-pressed={flash} onClick={toggleFlash}>
            <FlashIcon on={flash} />
          </button>
        ) : (
          <span className="cam-rb-space" />
        )}
      </div>
      {failed && (
        <div className="cam-failed" role="alert" data-testid="camera-failed">
          <b>The camera couldn't start</b>
          <span>{failed}</span>
          <button onClick={() => onDone(null)}>Close</button>
        </div>
      )}
      {!shot && live && zoomStops.length > 1 && (
        <div className="cam-zoom">
          {zoomStops.map((z) => (
            <button key={z} className={z === nearest ? "on" : ""} onClick={() => applyZoom(z)}>
              {z === nearest && Math.abs(zoom - z) > 0.05 ? `${zoom.toFixed(1).replace(/\.0$/, "")}×` : `${String(z).replace(/^0/, "")}×`}
            </button>
          ))}
        </div>
      )}
      {shot ? (
        <div className="cam-review">
          <button onClick={retake}>↺ Retake</button>
          <button className="mk" onClick={() => setMarking(true)}>
            ✎ Mark up
          </button>
          <button className="go" onClick={() => use()}>
            Use ✓
          </button>
        </div>
      ) : (
        <div className="cam-bot">
          <button className="cam-shut" aria-label="Take photo" disabled={!ready || shooting} onClick={takeShot}>
            <i />
          </button>
        </div>
      )}
      {shot && marking && <MarkupEditor blob={shot.blob} marks={[]} onCancel={() => setMarking(false)} onDone={(marks) => use(marks)} />}
    </div>
  );
}

function FlashIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      {!on && <path d="M3 3l18 18" />}
    </svg>
  );
}

// ---- the start screen ----

// a see-through 1 px image, in place of the video's ▶ placeholder
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DIGITAL_ZOOM = { min: 1, max: 4 };

// ---- the photo itself ----

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.92));
}

// The camera's picture right now, upright for how the phone is held, and
// cropped to the middle for the digital zoom (2× keeps the middle half).
function grabFrame(video: HTMLVideoElement, turn: number, zoom: number): HTMLCanvasElement {
  const vw = video.videoWidth, vh = video.videoHeight;
  const sw = Math.round(vw / zoom), sh = Math.round(vh / zoom);
  const side = turn === 90 || turn === 270;
  const c = document.createElement("canvas");
  c.width = side ? sh : sw;
  c.height = side ? sw : sh;
  const g = c.getContext("2d")!;
  g.translate(c.width / 2, c.height / 2);
  g.rotate((turn * Math.PI) / 180);
  g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, -sw / 2, -sh / 2, sw, sh);
  return c;
}
