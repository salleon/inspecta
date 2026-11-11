import { companyName, getCompany, setCompany, type Company } from "./company";
import { currentPin, setPin } from "./adminPin";
import { applyKeywordFile, currentKeywordEdits, keywordEditsFrom } from "./esrKeywords";
import { getFlowMode, setFlowMode, type FlowMode } from "./settings";

// The company setup file (Admin → Share setup file): what a new phone
// needs to match the company's, made once and kept by whoever sets up
// phones (e.g. HR). It holds the mode, the company's name, logo and
// colours, the ESR keyword changes and the admin PIN, which comes across
// too. Nothing about sites, findings or the person.
//
// The PIN is kept only as a salted SHA-256 fingerprint, and loading a file
// asks for it, so a file on its own doesn't switch a phone to EnFact or
// change its PIN. (Like the admin PIN itself, this keeps staff out rather
// than being a hard security boundary: everything is on the phone.)

const FILE_TYPE = "inspecta-setup";

export type SetupFile = {
  type: typeof FILE_TYPE;
  version: 1;
  exportedAt: string;
  mode: FlowMode;
  company: Omit<Company, "setUp">;
  keywords: Record<string, unknown>;
  pin: { salt: string; hash: string };
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeSetupFile(): Promise<Blob> {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { setUp: _setUp, ...company } = getCompany();
  const body: SetupFile = {
    type: FILE_TYPE,
    version: 1,
    exportedAt: new Date().toISOString(),
    mode: getFlowMode(),
    company,
    keywords: currentKeywordEdits(),
    pin: { salt, hash: await sha256Hex(salt + currentPin()) },
  };
  return new Blob([JSON.stringify(body)], { type: "application/json" });
}

export function setupFileName(): string {
  const who = getFlowMode() === "enfact" ? "EnFact" : companyName() || "Company";
  return `${who.replace(/[\\/:*?"<>|]/g, "")} setup.inspecta`;
}

// throws if it isn't a setup file
export function readSetupFile(text: string): SetupFile {
  const f = JSON.parse(text) as Partial<SetupFile>;
  if (f?.type !== FILE_TYPE || (f.mode !== "enfact" && f.mode !== "contractor") || !f.pin?.salt || !f.pin?.hash || typeof f.company !== "object") {
    throw new Error("Not an Inspecta setup file");
  }
  return f as SetupFile;
}

export async function filePinMatches(file: SetupFile, pin: string): Promise<boolean> {
  return (await sha256Hex(file.pin.salt + pin)) === file.pin.hash;
}

// Sets this phone up from the file; pin is the PIN that unlocked it,
// which becomes this phone's admin PIN.
export function applySetupFile(file: SetupFile, pin: string) {
  const c = file.company;
  setCompany({
    name: typeof c.name === "string" ? c.name : "",
    logo: typeof c.logo === "string" && c.logo.startsWith("data:image/") ? c.logo : null,
    plate: !!c.plate,
    logoColours: Array.isArray(c.logoColours) ? c.logoColours.filter((x) => /^#[0-9a-f]{6}$/i.test(x)) : [],
    schemeId: typeof c.schemeId === "string" ? c.schemeId : "harbour",
    custom: c.custom && [c.custom.primary, c.custom.secondary, c.custom.light].every((x) => /^#[0-9a-f]{6}$/i.test(x ?? "")) ? c.custom : getCompany().custom,
    setUp: true,
  });
  applyKeywordFile(keywordEditsFrom(file.keywords));
  setPin(pin);
  setFlowMode(file.mode);
}
