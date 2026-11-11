import { useSyncExternalStore } from "react";

// Per-device app preferences, stored locally alongside the inspector's name
// (see profile.ts). Toggled from the settings sheet behind the dashboard's
// gear button.
//
// (Advanced controls used to be a switch here; every phone now always has
// them. The mode, EnFact or Contractor, is the switch instead.)

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The app's mode (Admin → Mode): "enfact", EnFact's own app (its
// branding, and the stripped-down flow tests for its consultants: graph
// always discharge + town main, no line options; supplies Town main /
// Electric / Diesel or a custom name), or "contractor", for other
// companies (their own name, logo and colours, every flow option).
//
// A new phone starts in Contractor; the office switches its phones to
// EnFact in Admin. A phone already in use when modes came in (it has an
// inspector's name) stays EnFact. Settled once at start-up (settleMode),
// before the name prompt, so naming a new phone doesn't change it.
export type FlowMode = "enfact" | "contractor";
const FLOW_MODE_KEY = "inspecta.flowMode";

export function settleMode() {
  try {
    if (localStorage.getItem(FLOW_MODE_KEY)) return;
    const inUse = (localStorage.getItem("inspecta.inspectorName") ?? "").trim().length > 0;
    localStorage.setItem(FLOW_MODE_KEY, inUse ? "enfact" : "contractor");
  } catch {
    // best-effort: without storage the phone stays EnFact
  }
}

export function getFlowMode(): FlowMode {
  try {
    return localStorage.getItem(FLOW_MODE_KEY) === "contractor" ? "contractor" : "enfact";
  } catch {
    return "enfact";
  }
}

export const isContractor = () => getFlowMode() === "contractor";

export function setFlowMode(mode: FlowMode) {
  try {
    localStorage.setItem(FLOW_MODE_KEY, mode);
  } catch {
    // best-effort
  }
  listeners.forEach((l) => l());
}

export function useFlowMode(): FlowMode {
  return useSyncExternalStore(subscribe, getFlowMode);
}

// Zero shutter lag on the Android camera system: the photo is the moment the
// shutter's pressed. On (the default) unless turned off by itself on a phone
// that handed back the same photo twice (lib/nativeCamera).
const ZSL_KEY = "inspecta.cameraZsl";

export function getCameraZsl(): boolean {
  try {
    return localStorage.getItem(ZSL_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setCameraZsl(on: boolean) {
  try {
    localStorage.setItem(ZSL_KEY, on ? "1" : "0");
  } catch {
    // best-effort
  }
  listeners.forEach((l) => l());
}

// The in-app camera's flash: on or off (no auto), kept between photos.
const FLASH_KEY = "inspecta.cameraFlash";

export function getCameraFlash(): boolean {
  try {
    return localStorage.getItem(FLASH_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCameraFlash(on: boolean) {
  try {
    localStorage.setItem(FLASH_KEY, on ? "1" : "0");
  } catch {
    // best-effort
  }
}
