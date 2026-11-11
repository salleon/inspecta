import { companyName, getCompany, logoFromFile, setCompany, type Company } from "./company";
import { currentPinPrint, pinMatchesPrint, setPin, setPinPrint } from "./adminPin";
import { applyKeywordFile, currentKeywordEdits, keywordEditsFrom } from "./esrKeywords";
import { getFlowMode, setFlowMode, type FlowMode } from "./settings";

// The company setup file (Admin → Share setup file): what a new phone
// needs to match the company's, made once and kept by whoever sets up
// phones (e.g. HR). It holds the mode, the company's name, logo and
// colours, the ESR keyword changes and the admin PIN, which comes across
// too. Nothing about sites, findings or the person.
//
// The PIN is kept only as a salted SHA-256 fingerprint. A company's file
// loads without it: staff join with the file, and their Admin is locked
// with the manager's PIN, which they never see. An EnFact file asks for the
// PIN, so a file on its own doesn't make a phone EnFact. (Like the admin
// PIN itself, this keeps staff out rather than being a hard security
// boundary: everything is on the phone.)

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

export async function makeSetupFile(): Promise<Blob> {
  const { setUp: _setUp, ...company } = getCompany();
  const body: SetupFile = {
    type: FILE_TYPE,
    version: 1,
    exportedAt: new Date().toISOString(),
    mode: getFlowMode(),
    company,
    keywords: currentKeywordEdits(),
    pin: await currentPinPrint(),
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

// Checks the file's logo and makes it the PNG the app keeps (see
// logoFromFile), before anything is set up. Throws an Error saying why if
// the logo can't be used.
export async function checkSetupFile(file: SetupFile): Promise<SetupFile> {
  if (!file.company.logo) return file;
  const { logo, colours } = await logoFromFile(file.company.logo);
  const given = Array.isArray(file.company.logoColours) ? file.company.logoColours : [];
  return { ...file, company: { ...file.company, logo, logoColours: given.length ? given : colours } };
}

export async function filePinMatches(file: SetupFile, pin: string): Promise<boolean> {
  return pinMatchesPrint(file.pin, pin);
}

// an EnFact file asks for its PIN before loading; a company's doesn't
export const fileNeedsPin = (file: SetupFile) => file.mode === "enfact";

// Sets this phone up from the file (after checkSetupFile). pin is the PIN
// typed to load it (an EnFact file); without one, the file's fingerprint
// becomes this phone's admin PIN, so whoever made the file can open Admin
// and nobody else. Throws if the phone has no room to keep it.
export function applySetupFile(file: SetupFile, pin?: string) {
  const c = file.company;
  const saved = setCompany({
    name: typeof c.name === "string" ? c.name : "",
    logo: typeof c.logo === "string" && c.logo.startsWith("data:image/png;base64,") ? c.logo : null,
    plate: !!c.plate,
    logoColours: Array.isArray(c.logoColours) ? c.logoColours.filter((x) => /^#[0-9a-f]{6}$/i.test(x)) : [],
    schemeId: typeof c.schemeId === "string" ? c.schemeId : "default",
    custom: c.custom && [c.custom.primary, c.custom.secondary, c.custom.light].every((x) => /^#[0-9a-f]{6}$/i.test(x ?? "")) ? c.custom : getCompany().custom,
    setUp: true,
  });
  if (!saved) {
    // not kept: back to how it was, so the phone isn't half set up
    setCompany({ setUp: false });
    throw new Error("There isn't enough room on this phone to save the company setup. Free up some space, then try again.");
  }
  applyKeywordFile(keywordEditsFrom(file.keywords));
  if (pin !== undefined) setPin(pin);
  else setPinPrint(file.pin);
  setFlowMode(file.mode);
}
