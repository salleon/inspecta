import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Mark } from "../db/types";
import type { CameraLabel, Captured } from "../lib/capture";
import { saveToGallery } from "../lib/capture";
import { useBackHandler } from "../lib/backButton";
import { getCameraFlash, setCameraFlash } from "../lib/settings";
import { decodeUpright } from "../lib/markup";
import MarkupEditor from "./MarkupEditor";
import "./PhotoTools.css";

// Inspecta's own camera (no Android camera app): the camera's picture full
// screen, tap to focus, pinch or .5× / 1× / 2× to zoom, flash on / off.
// After the shutter, a quick check: Retake / ✎ Mark up / Use ✓.
// `onDone`: the photo; null if closed; "fallback" if the camera couldn't
// start (the Android camera is used instead).

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
  flash: boolean; // the photo's own flash (ImageCapture fillLightMode)
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

type ImageCaptureLike = { takePhoto(s?: { fillLightMode?: string }): Promise<Blob>; getPhotoCapabilities(): Promise<{ fillLightMode?: string[] }> };

export default function InAppCamera({ label, onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<ImageCaptureLike | null>(null);
  const [caps, setCaps] = useState<Caps>({ zoom: DIGITAL_ZOOM, digital: true, torch: false, flash: false, focus: false });
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
    let cancelled = false;
    async function start() {
      try {
        const stream = await openMainCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
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
          flash: false,
          focus: !!tc.focusMode?.length,
        };
        const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
        if (IC) {
          try {
            captureRef.current = new IC(track);
            const pc = await captureRef.current.getPhotoCapabilities();
            next.flash = !!pc.fillLightMode?.includes("flash");
          } catch {
            captureRef.current = null;
          }
        }
        if (cancelled) return;
        setCaps(next);
        const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
        if (settings.zoom) setZoom(settings.zoom);
        track.addEventListener("ended", () => {
          if (!cancelled && document.visibilityState === "visible") void restart();
        });
        setReady(true);
      } catch {
        // no camera, or no permission: the Android camera instead
        if (!cancelled) doneRef.current("fallback");
      }
    }
    async function restart() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

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
    if (caps.digital) return;
    track()?.applyConstraints({ advanced: [{ zoom: v } as MediaTrackConstraintSet] }).catch(() => {});
  }

  function toggleFlash() {
    const on = !flash;
    setFlash(on);
    setCameraFlash(on);
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

  async function takeShot() {
    const video = videoRef.current;
    const t = track();
    if (!video || !t || shooting || !ready) return;
    setShooting(true);
    setBlink((n) => n + 1);
    const turn = turnRef.current;
    let torchOn = false;
    try {
      let blob: Blob | null = null;
      if (flash && !caps.flash && caps.torch) {
        // no photo flash on this camera: the torch, just for the shot
        await t.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] }).catch(() => {});
        torchOn = true;
        await new Promise((r) => setTimeout(r, 450));
      }
      if (captureRef.current) {
        try {
          const photo = await Promise.race([
            captureRef.current.takePhoto(caps.flash ? { fillLightMode: flash ? "flash" : "off" } : undefined),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("slow")), 5000)),
          ]);
          blob = await uprightPhoto(photo, video, turn);
        } catch {
          blob = null;
        }
      }
      // no full-size photo from this camera: the picture itself
      if (!blob) blob = await frameGrab(video, turn);
      if (caps.digital && zoom > 1.01) blob = await cropMiddle(blob, zoom);
      setShot({ blob, url: URL.createObjectURL(blob) });
    } catch {
      // nothing taken; the shutter can be pressed again
    } finally {
      if (torchOn) await t.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => {});
      setShooting(false);
    }
  }

  function retake() {
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
  const flashKnown = caps.flash || caps.torch;

  return (
    <div className="cam" data-testid="in-app-camera">
      <div className="cam-view" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <video ref={videoRef} playsInline muted autoPlay poster={BLANK} onPlaying={() => setLive(true)} style={{ opacity: shot || !live ? 0 : 1, transform: caps.digital && zoom > 1 ? `scale(${zoom})` : undefined }} />
        {shot && <img className="cam-shot" src={shot.url} alt="" />}
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
      {!shot && zoomStops.length > 1 && (
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

// ---- which camera ----

// a see-through 1 px image, in place of the video's ▶ placeholder
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const MAIN_CAMERA_KEY = "inspecta.mainCamera";
// zoom: true asks to use the camera's zoom (Chrome only offers it if asked)
const HIGH_RES = { width: { ideal: 4032 }, height: { ideal: 3024 }, zoom: true } as MediaTrackConstraints;
const DIGITAL_ZOOM = { min: 1, max: 4 };

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
      return await getUserMedia({ deviceId: { exact: saved }, ...HIGH_RES });
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
    return getUserMedia({ deviceId: { exact: main }, ...HIGH_RES });
  }
  return getUserMedia({ facingMode: { ideal: "environment" }, ...HIGH_RES });
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

// ---- the photo itself ----

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.92));
}

// a canvas of `source` turned clockwise by `turn` degrees
function turned(source: CanvasImageSource, w: number, h: number, turn: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const side = turn === 90 || turn === 270;
  c.width = side ? h : w;
  c.height = side ? w : h;
  const g = c.getContext("2d")!;
  g.translate(c.width / 2, c.height / 2);
  g.rotate((turn * Math.PI) / 180);
  g.drawImage(source, -w / 2, -h / 2, w, h);
  return c;
}

// the camera's picture as it is now, at its full size
async function frameGrab(video: HTMLVideoElement, turn: number): Promise<Blob> {
  const c = turned(video, video.videoWidth, video.videoHeight, turn);
  const blob = await encode(c);
  c.width = c.height = 0;
  return blob;
}

// the middle of a photo, as enlarged by the digital zoom
async function cropMiddle(blob: Blob, zoom: number): Promise<Blob> {
  const img = await decodeUpright(blob);
  try {
    const w = Math.round(img.width / zoom), h = Math.round(img.height / zoom);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img.source, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, w, h);
    const out = await encode(c);
    c.width = c.height = 0;
    return out;
  } finally {
    img.done();
  }
}

// A tiny grey copy, for comparing which way round two pictures are.
function tiny(source: CanvasImageSource, w: number, h: number, turn: number): Float32Array {
  const S = 24;
  const c = turned(source, w, h, turn);
  const t = document.createElement("canvas");
  t.width = t.height = S;
  const g = t.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(c, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  const out = new Float32Array(S * S);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  return out;
}
function differ(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s;
}

// The full-size photo, the right way round: some phones hand it over as
// the camera sensor sees it (sideways), so it's matched against what was on
// screen, then turned for how the phone was held.
async function uprightPhoto(photo: Blob, video: HTMLVideoElement, turn: number): Promise<Blob> {
  const img = await decodeUpright(photo);
  try {
    const sameShape = img.width >= img.height === video.videoWidth >= video.videoHeight;
    let fix = 0;
    if (!sameShape) {
      const screen = tiny(video, video.videoWidth, video.videoHeight, 0);
      fix = differ(tiny(img.source, img.width, img.height, 90), screen) <= differ(tiny(img.source, img.width, img.height, 270), screen) ? 90 : 270;
    }
    const total = (fix + turn) % 360;
    if (total === 0) return photo;
    const c = turned(img.source, img.width, img.height, total);
    const blob = await encode(c);
    c.width = c.height = 0;
    return blob;
  } finally {
    img.done();
  }
}
