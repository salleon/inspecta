// Per-device app preferences, stored locally alongside the inspector's name
// (see profile.ts). Toggled from the settings sheet behind the dashboard's
// gear button.
//
// (Advanced controls used to be a switch here; every phone now always has
// them. Which app this is, EnFact or Contractor, is fixed when it's built:
// lib/edition.)

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
