// Admin PIN for Settings → Admin (keyword tuning). It keeps staff out of
// the admin tools, not a real security boundary — everything stays on the
// phone. Starts as 2021; change it from the admin menu.
//
// Forgotten PIN: "Forgot PIN?" on the PIN screen takes a recovery code and
// sets a new PIN. Either the master code (works on any phone, below) or
// this phone's own code, which the admin menu can email.

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

// Master recovery code: works on every phone, with no setup — kept by
// the app's owner, not in the app. Only its SHA-256 fingerprint is here,
// so it can't be read out of the code or the APK.
const MASTER_HASH = "3cd2eb2f3e73140e9377237863e07de548458c5057d3d528b403c2ba746f7a5d";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// the code as typed (any case, dashes optional): this phone's emailed code
// or the master code
export async function checkRecoveryCode(typed: string): Promise<boolean> {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const stored = get(RECOVERY_KEY);
  if (stored && norm(typed) === norm(stored)) return true;
  return (await sha256Hex(`inspecta-admin:${norm(typed)}`)) === MASTER_HASH;
}

// Unlocked until the app is closed, so moving around the admin screens
// doesn't ask again.
let unlocked = false;
export const isAdminUnlocked = () => unlocked;
export const unlockAdmin = () => {
  unlocked = true;
};
