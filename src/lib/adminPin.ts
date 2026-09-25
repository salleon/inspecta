// Admin PIN for Settings → Admin (keyword tuning). It keeps staff out of
// the admin tools, not a real security boundary — everything stays on the
// phone. Starts as 2021; change it from the admin menu.
//
// Forgotten PIN: the admin menu can email a recovery code (a random code
// made on this phone the first time Admin is opened). "Forgot PIN?" on the
// PIN screen takes that code and sets a new PIN.

const PIN_KEY = "inspecta.adminPin";
const RECOVERY_KEY = "inspecta.adminRecovery";
const DEFAULT_PIN = "2021";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best effort
  }
}

export function checkPin(pin: string): boolean {
  return pin === (get(PIN_KEY) ?? DEFAULT_PIN);
}

export function setPin(pin: string) {
  set(PIN_KEY, pin);
}

// e.g. "K7QM-2XPA": no 0/O or 1/I, so it's easy to type from an email
export function recoveryCode(): string {
  let code = get(RECOVERY_KEY);
  if (!code) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
    code = `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
    set(RECOVERY_KEY, code);
  }
  return code;
}

// the code as typed (any case, dash optional)
export function checkRecoveryCode(typed: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const stored = get(RECOVERY_KEY);
  return !!stored && norm(typed) === norm(stored);
}

// Unlocked until the app is closed, so moving around the admin screens
// doesn't ask again.
let unlocked = false;
export const isAdminUnlocked = () => unlocked;
export const unlockAdmin = () => {
  unlocked = true;
};
