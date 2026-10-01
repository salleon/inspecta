import { useSyncExternalStore } from "react";

// Per-device app preferences, stored locally alongside the inspector's name
// (see profile.ts). Toggled from the settings sheet behind the dashboard's
// gear button.
//
// Advanced controls: when ON, screens show extra menus/dropdowns for richer
// data entry. ON by default — only an explicit switch-off ("0") turns it
// off, so a new install (or anyone who never touched it) starts with it on.
// The flag only gates the *inputs* — any advanced data already saved on a
// finding is always displayed (and exported to the PDF) whether the flag is
// on or off, so flipping it never hides entered information.

const ADVANCED_KEY = "inspecta.advancedControls";

const listeners = new Set<() => void>();

function getAdvancedControls(): boolean {
  try {
    return localStorage.getItem(ADVANCED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAdvancedControls(on: boolean) {
  try {
    localStorage.setItem(ADVANCED_KEY, on ? "1" : "0");
  } catch {
    // best-effort — worst case the toggle resets to on next launch
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Any component can read the flag with this hook and will re-render the
// moment it's toggled — no provider needed.
export function useAdvancedControls(): boolean {
  return useSyncExternalStore(subscribe, getAdvancedControls);
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
