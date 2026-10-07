// The heavy work done on photos in the background (thumbnails, marked-up
// copies, export copies: each decodes a full 12 MP photo) waits while the
// in-app camera is open, and for a moment after it closes, so it never
// shares the phone with the camera, or holds up the next finding's camera
// when findings are being added quickly. Thumbnails and marked copies are
// made one at a time (export copies have their own queue, see db).

const QUIET_MS = 1500;
let cameraOpen = false;
let closedAt = 0;

export function setCameraOpen(on: boolean) {
  cameraOpen = on;
  if (!on) closedAt = Date.now();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves once the camera's been closed for a moment. */
export async function whenCameraIdle(): Promise<void> {
  for (;;) {
    if (cameraOpen) {
      await sleep(300);
      continue;
    }
    const wait = closedAt + QUIET_MS - Date.now();
    if (wait <= 0) return;
    await sleep(wait);
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** fn, after the jobs before it, once the camera's idle. (fn mustn't wait
 * on another photoJob, or the two would wait on each other.) */
export function photoJob<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    await whenCameraIdle();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}
