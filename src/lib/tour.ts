import { useEffect, useSyncExternalStore } from "react";
import { addFlowTest, addPhoto, createFinding, createSite, deleteSite, getSite, saveSiteReports, updateFinding } from "../db/db";
import type { FlowReading } from "../db/types";

// The tour (canvas TourFull): once per phone, a welcome offers a walk
// through the app, in 8 topics, or a pick of one topic. It runs on
// temporary example sites (an AFSS site with two findings, a sprinkler
// flow test and a saved "Fire doors" report, and a Flow testing site), so
// every screen has something to show, moving screen to screen on Next.
// They're deleted when the tour ends (Done, Skip or Android back).
// Settings → Replay tour runs it again. Real sites are never touched. A
// step can set a "scene" that a screen acts out (the New site sheet open,
// the readings full screen...): see useTourScene. See components/Tour.

const OFFERED_KEY = "inspecta.tourOffered"; // the welcome has been shown
const SITE_KEY = "inspecta.tourSite"; // the example sites, while a tour runs (a JSON list)
export const SITES_CHANGED = "inspecta:sites-changed";

export interface TourIds {
  siteId: string; // the AFSS example site
  findingId: string; // with a photo, categorised
  noteId: string; // no photo, no category yet
  testId: string; // the AFSS site's sprinkler test
  flowSiteId: string; // the Flow testing site
}

export interface TourState {
  welcome: boolean; // the "Welcome, want a tour?" card
  active: boolean;
  step: number; // index into the steps the Tour component shows
  ids?: TourIds;
  topics: boolean; // the Pick a topic list is showing
  single: boolean; // one topic picked from the list, not the whole tour
  scene: string | null; // what the current step has a screen act out
}

let state: TourState = { welcome: false, active: false, step: 0, topics: false, single: false, scene: null };
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

function leftoverIds(): string[] {
  const raw = storage()?.getItem(SITE_KEY);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [raw];
  } catch {
    return [raw]; // an older build kept just the one id
  }
}

// on opening: show the welcome if it's due, and clear away example sites
// left behind if the app was closed mid-tour
export async function initTour() {
  const leftover = leftoverIds();
  if (leftover.length && !state.active) {
    storage()?.removeItem(SITE_KEY);
    for (const id of leftover) if (await getSite(id)) await deleteSite(id);
    window.dispatchEvent(new Event(SITES_CHANGED));
  }
  if (storage() && storage()?.getItem(OFFERED_KEY) !== "1") set({ welcome: true });
}

export function dismissWelcome() {
  storage()?.setItem(OFFERED_KEY, "1");
  set({ welcome: false });
}

// readings for the example sprinkler test: " Hg, flow (typed, L/min), discharge, suction, RPM / amps
const reading = ([hg, flow, dis, suc = "", amps = ""]: (string | number)[]): FlowReading => ({ hg: String(hg), flow: String(flow), dis: String(dis), suc: String(suc), amps: String(amps) });
const sampleTest = (siteId: string) => ({
  siteId,
  kind: "sprinkler" as const,
  name: "Sprinkler",
  testedAt: Date.now(),
  k: 0,
  equipment: "80 mm / 20T Ambient",
  testedBy: "Sample Fire Services",
  comment: "Sample only.",
  demand: [
    { flow: "1100", kpa: "270" },
    { flow: "1350", kpa: "240" },
  ],
  sections: [
    { name: "Town main", rows: [[0, 0, 460], [2, 755.4, 250], [4, 1068.3, 240], [6, 1308.4, 205], [8, 1510.8, 180]].map(reading) },
    { name: "Electric pump", rows: [[0, 0, 980, 120, 48], [2, 755.4, 750, 110, 52], [4, 1068.3, 670, 100, 55], [6, 1308.4, 430, 95, 58], [8, 1510.8, 250, 90, 61]].map(reading) },
  ],
});

// topic: start on the Pick a topic list
export async function startTour(opts: { topics?: boolean } = {}) {
  storage()?.setItem(OFFERED_KEY, "1");
  const site = await createSite("Example site", "Sample only, removed after the tour", "afss");
  const flowSite = await createSite("Example pump room", "Sample only, removed after the tour", "flow");
  storage()?.setItem(SITE_KEY, JSON.stringify([site.id, flowSite.id]));
  const finding = await createFinding(site.id, { level: "Level 3" });
  await updateFinding(finding.id, { note: "Fire door closer not self-closing, door held open with wedge", location: "Stair 2 lobby", esrCategory: "1.6", defectType: "non-critical" });
  const photo = await samplePhoto();
  if (photo) await addPhoto(finding.id, site.id, photo);
  const note = await createFinding(site.id, { level: "Basement 1" });
  await updateFinding(note.id, { note: "Hose reel cupboard used for storage", location: "Car park" });
  const test = await addFlowTest(sampleTest(site.id));
  await addFlowTest(sampleTest(flowSite.id));
  const now = Date.now();
  await saveSiteReports(site.id, [{ id: crypto.randomUUID(), name: "Fire doors", findingIds: [finding.id], order: "esr", createdAt: now, updatedAt: now }]);
  window.dispatchEvent(new Event(SITES_CHANGED));
  set({ welcome: false, active: true, step: 0, topics: !!opts.topics, single: false, scene: null, ids: { siteId: site.id, findingId: finding.id, noteId: note.id, testId: test.id, flowSiteId: flowSite.id } });
}

export function setTourStep(step: number, single = state.single) {
  set({ step, topics: false, single });
}

export function showTopics(on: boolean) {
  set({ topics: on });
}

export function setTourScene(scene: string | null) {
  if (state.scene !== scene) set({ scene });
}

// Done, Skip tour or back: remove the example sites
export async function endTour() {
  const ids = state.ids;
  set({ active: false, welcome: false, step: 0, topics: false, single: false, scene: null, ids: undefined });
  storage()?.removeItem(SITE_KEY);
  if (ids) for (const id of [ids.siteId, ids.flowSiteId]) await deleteSite(id);
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

// A screen acting out a tour step: `on` when the step with this scene
// starts, `off` when it ends (e.g. open the New site sheet, then close it).
export function useTourScene(scene: string, on: () => void, off?: () => void) {
  const tour = useTour();
  const hit = tour.active && !tour.topics && tour.scene === scene;
  useEffect(() => {
    if (!hit) return;
    on();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit]);
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
