import { useSyncExternalStore } from "react";
import { addPhoto, createFinding, createSite, deleteSite, getSite, updateFinding } from "../db/db";

// The first-time tour: once, for a new user (right after they enter their
// name), a welcome offers a walk through the app. It runs on a temporary
// "Example site" with one sample finding so every screen has something to
// show, moving screen to screen on Next, and the Example site is deleted
// when the tour ends (Done, Skip tour or Android back). Settings → Replay
// tour runs it again. Real sites are never touched. See components/Tour.

const PENDING_KEY = "inspecta.tourPending"; // welcome still to show
const SITE_KEY = "inspecta.tourSite"; // the Example site, while a tour runs
export const SITES_CHANGED = "inspecta:sites-changed";

export interface TourState {
  welcome: boolean; // the "Welcome, want a tour?" card
  active: boolean;
  step: number; // index into the steps the Tour component shows
  siteId?: string;
  findingId?: string;
}

let state: TourState = { welcome: false, active: false, step: 0 };
const subscribers = new Set<() => void>();
function set(changes: Partial<TourState>) {
  state = { ...state, ...changes };
  subscribers.forEach((fn) => fn());
}

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

// a new user just set their name: offer the tour once
export function markTourPending() {
  storage()?.setItem(PENDING_KEY, "1");
}

// on opening: show the welcome if it's due, and clear away an Example site
// left behind if the app was closed mid-tour
export async function initTour() {
  const leftover = storage()?.getItem(SITE_KEY);
  if (leftover && !state.active) {
    storage()?.removeItem(SITE_KEY);
    if (await getSite(leftover)) {
      await deleteSite(leftover);
      window.dispatchEvent(new Event(SITES_CHANGED));
    }
  }
  if (storage()?.getItem(PENDING_KEY) === "1") set({ welcome: true });
}

export function dismissWelcome() {
  storage()?.removeItem(PENDING_KEY);
  set({ welcome: false });
}

export async function startTour() {
  storage()?.removeItem(PENDING_KEY);
  const site = await createSite("Example site", "Sample only, removed after the tour", "afss");
  storage()?.setItem(SITE_KEY, site.id);
  const finding = await createFinding(site.id, { level: "Level 3" });
  await updateFinding(finding.id, { note: "Fire door closer not self-closing, door held open with wedge", location: "Stair 2 lobby" });
  const photo = await samplePhoto();
  if (photo) await addPhoto(finding.id, site.id, photo);
  window.dispatchEvent(new Event(SITES_CHANGED));
  set({ welcome: false, active: true, step: 0, siteId: site.id, findingId: finding.id });
}

export function setTourStep(step: number) {
  set({ step });
}

// Done, Skip tour or back: remove the Example site
export async function endTour() {
  const siteId = state.siteId;
  set({ active: false, welcome: false, step: 0, siteId: undefined, findingId: undefined });
  storage()?.removeItem(PENDING_KEY);
  storage()?.removeItem(SITE_KEY);
  if (siteId) await deleteSite(siteId);
  window.dispatchEvent(new Event(SITES_CHANGED));
}

export function useTour(): TourState {
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    () => state,
  );
}

// a simple drawn stand-in photo (a fire door in a corridor) for the sample
// finding, so the tour needs no image files
function samplePhoto(): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 900;
  const g = c.getContext("2d");
  if (!g) return Promise.resolve(null);
  const wall = g.createLinearGradient(0, 0, 0, 900);
  wall.addColorStop(0, "#c9ccc6");
  wall.addColorStop(1, "#9ea39c");
  g.fillStyle = wall;
  g.fillRect(0, 0, 1200, 900);
  g.fillStyle = "#6f6a62"; // floor
  g.fillRect(0, 760, 1200, 140);
  g.fillStyle = "#8a4b2a"; // door
  g.fillRect(420, 170, 360, 590);
  g.fillStyle = "#b9c8d6"; // vision panel
  g.fillRect(560, 250, 80, 200);
  g.fillStyle = "#d8d8d8"; // closer
  g.fillRect(430, 150, 200, 26);
  g.fillStyle = "#e4c22b"; // wedge
  g.beginPath();
  g.moveTo(770, 760);
  g.lineTo(860, 760);
  g.lineTo(770, 725);
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.font = "bold 44px sans-serif";
  g.fillText("Sample photo", 40, 70);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.85));
}
