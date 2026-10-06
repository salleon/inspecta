import { useSyncExternalStore } from "react";

// Per-device app preferences, stored locally alongside the inspector's name
// (see profile.ts). Toggled from the settings sheet behind the dashboard's
// gear button.
//
// (Advanced controls used to be a switch here; every phone now always has
// them. Flow testing mode, EnFact or Contractor, is the switch instead.)

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Converter tool (L/s ⇄ L/min) on the flow test screens: OFF by default,
// turned on from Settings.
const CONVERTER_KEY = "inspecta.converterTool";

function getConverterTool(): boolean {
  try {
    return localStorage.getItem(CONVERTER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setConverterTool(on: boolean) {
  try {
    localStorage.setItem(CONVERTER_KEY, on ? "1" : "0");
  } catch {
    // best-effort
  }
  listeners.forEach((l) => l());
}

export function useConverterTool(): boolean {
  return useSyncExternalStore(subscribe, getConverterTool);
}

// Flow testing mode (Admin): "enfact", the stripped-down version for
// EnFact's consultants (graph always discharge + town main, no line
// options; supplies Town main / Electric / Diesel or a custom name), or
// "contractor", every option. EnFact unless switched in Admin.
export type FlowMode = "enfact" | "contractor";
const FLOW_MODE_KEY = "inspecta.flowMode";

export function getFlowMode(): FlowMode {
  try {
    return localStorage.getItem(FLOW_MODE_KEY) === "contractor" ? "contractor" : "enfact";
  } catch {
    return "enfact";
  }
}

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

// The camera: Inspecta's own (on, the default) or the Android camera app.
const IN_APP_CAMERA_KEY = "inspecta.inAppCamera";

export function getInAppCamera(): boolean {
  try {
    return localStorage.getItem(IN_APP_CAMERA_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setInAppCamera(on: boolean) {
  try {
    localStorage.setItem(IN_APP_CAMERA_KEY, on ? "1" : "0");
  } catch {
    // best-effort
  }
  listeners.forEach((l) => l());
}

export function useInAppCamera(): boolean {
  return useSyncExternalStore(subscribe, getInAppCamera);
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
