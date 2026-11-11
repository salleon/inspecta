import { getFlowMode } from "./settings";

// Admin PIN for Settings → Admin (keywords, setup file, the PIN). It keeps
// staff out of the admin tools, not a real security boundary — everything
// stays on the phone.
//
// Who sets it:
// - EnFact phones start with EnFact's PIN (2021) until the office changes it.
// - Contractor phones have no PIN at first: the first time Admin is opened,
//   the company's manager chooses one. EnFact's PIN never works on them.
// - A phone that joins a company with its setup file gets the manager's PIN
//   from the file, without anyone typing it: staff join, but Admin stays
//   locked to them. The file only has a salted fingerprint of the PIN, so
//   the phone keeps that fingerprint (PRINT_KEY) instead of the PIN itself.
//
// Forgotten PIN: "Forgot PIN?" on the PIN screen takes this phone's own
// recovery code (the admin menu can email it), then a new PIN is chosen.
// The owner's master code (below) also goes there: it opens Admin as the
// owner, which is the only way to see the EnFact / Contractor switch on a
// Contractor phone, and leaves the company's PIN as it is.

const PIN_KEY = "inspecta.adminPin";
const PRINT_KEY = "inspecta.adminPinPrint";
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

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // best effort
  }
}

// a salted SHA-256 fingerprint of a PIN, as kept in setup files
export type PinPrint = { salt: string; hash: string };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makePinPrint(pin: string): Promise<PinPrint> {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { salt, hash: await sha256Hex(salt + pin) };
}

export async function pinMatchesPrint(print: PinPrint, pin: string): Promise<boolean> {
  return (await sha256Hex(print.salt + pin)) === print.hash;
}

function storedPrint(): PinPrint | null {
  try {
    const p = JSON.parse(get(PRINT_KEY) ?? "null") as Partial<PinPrint> | null;
    return p && typeof p.salt === "string" && typeof p.hash === "string" ? { salt: p.salt, hash: p.hash } : null;
  } catch {
    return null;
  }
}

// the PIN typed on this phone; EnFact phones fall back to EnFact's PIN.
// (null on a phone that has only a fingerprint, or no PIN yet)
function storedOrDefault(): string | null {
  if (get(PIN_KEY) === null && storedPrint()) return null;
  return get(PIN_KEY) ?? (getFlowMode() === "enfact" ? DEFAULT_PIN : null);
}

// false on a Contractor phone whose company hasn't chosen a PIN yet
export function hasPin(): boolean {
  return storedOrDefault() !== null || storedPrint() !== null;
}

export async function checkPin(pin: string): Promise<boolean> {
  const current = storedOrDefault();
  if (current !== null) return pin === current;
  const print = storedPrint();
  return print !== null && (await pinMatchesPrint(print, pin));
}

// this phone's PIN as a fingerprint, for the company setup file (Admin is
// unlocked by then, so there is one)
export async function currentPinPrint(): Promise<PinPrint> {
  return storedPrint() ?? makePinPrint(storedOrDefault() ?? DEFAULT_PIN);
}

// writes down the PIN this phone opens with, so it carries on as it is
// when the mode changes (an EnFact phone on EnFact's PIN moved to
// Contractor keeps that PIN, rather than being left with none)
export function keepPin() {
  const current = storedOrDefault();
  if (current !== null && get(PIN_KEY) === null) set(PIN_KEY, current);
}

// a PIN typed on this phone (chosen, changed, or entered to load a file)
export function setPin(pin: string) {
  set(PIN_KEY, pin);
  remove(PRINT_KEY);
}

// the manager's PIN from a setup file, as its fingerprint (nobody typed it)
export function setPinPrint(print: PinPrint) {
  set(PRINT_KEY, JSON.stringify({ salt: print.salt, hash: print.hash }));
  remove(PIN_KEY);
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

// the code as typed (any case, dashes optional): "phone" for this phone's
// emailed code, "owner" for the master code, null for neither
export async function checkRecoveryCode(typed: string): Promise<"phone" | "owner" | null> {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const stored = get(RECOVERY_KEY);
  if (stored && norm(typed) === norm(stored)) return "phone";
  return (await sha256Hex(`inspecta-admin:${norm(typed)}`)) === MASTER_HASH ? "owner" : null;
}

// Unlocked until the app is closed, so moving around the admin screens
// doesn't ask again. "owner" (the master code) also shows the mode switch.
let unlocked: false | "pin" | "owner" = false;
export const isAdminUnlocked = () => unlocked !== false;
export const isOwnerUnlocked = () => unlocked === "owner";
export const unlockAdmin = (as: "pin" | "owner" = "pin") => {
  if (unlocked !== "owner") unlocked = as;
};
