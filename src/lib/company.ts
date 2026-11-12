import { useSyncExternalStore } from "react";
import { getFlowMode } from "./settings";

// Contractor mode's company branding (canvas "Inspecta for contractors"):
// the company's name, its logo for the app and report covers, and its
// three colours. Kept on this phone (localStorage); EnFact mode ignores it.
//
// A scheme is always three colours, like the presets: a very dark
// background (primary), one vivid accent (secondary) and a near-white for
// text (light). Colours picked from a logo are reshaped to that recipe.

export type Scheme = { primary: string; secondary: string; light: string };
export type Preset = Scheme & { id: string; name: string; desc: string };

export type Company = {
  name: string;
  logo: string | null; // PNG data URL, resized on upload
  plate: boolean; // white background behind the logo
  logoColours: string[]; // the logo's main colours, found on upload
  schemeId: string; // a preset id, "logo1".."logo3" or "custom"
  custom: Scheme;
  setUp: boolean; // the setup has been finished on this phone
};

export const PRESETS: Preset[] = [
  // the app's own colours (index.css), used as they are: no logo needed
  { id: "default", name: "Default", desc: "Navy · teal", primary: "#071b2c", secondary: "#2ec4b6", light: "#f4f7f9" },
  { id: "firetruck", name: "Firetruck", desc: "Charcoal · red", primary: "#16181d", secondary: "#e0313a", light: "#faf5f5" },
  { id: "signal", name: "Signal", desc: "Navy · red", primary: "#081a2b", secondary: "#e8423f", light: "#f6f8fa" },
  { id: "oxblood", name: "Oxblood", desc: "Deep red · red", primary: "#220c0f", secondary: "#f0524f", light: "#fbf4f4" },
  { id: "coral", name: "Coral", desc: "Slate · coral", primary: "#1c2430", secondary: "#ff6b5b", light: "#f7f8fa" },
  { id: "rust", name: "Rust", desc: "Espresso · burnt red", primary: "#201512", secondary: "#d9572e", light: "#faf4f0" },
  { id: "ember", name: "Ember", desc: "Charcoal · orange", primary: "#1b1e23", secondary: "#f28c38", light: "#faf6f1" },
  { id: "hazard", name: "Hazard", desc: "Black · yellow", primary: "#111315", secondary: "#ffc629", light: "#fbf9f2" },
  { id: "gold", name: "Midnight", desc: "Midnight · gold", primary: "#0b1630", secondary: "#f2b632", light: "#fbf8f0" },
  { id: "eucalypt", name: "Eucalypt", desc: "Forest · leaf", primary: "#0f2a22", secondary: "#8fd16a", light: "#f3f7f2" },
  { id: "ocean", name: "Ocean", desc: "Deep blue · blue", primary: "#0a1a33", secondary: "#3d8bfd", light: "#f3f7fd" },
  { id: "steel", name: "Steel", desc: "Gunmetal · sky", primary: "#1a2129", secondary: "#5fb3d9", light: "#f2f6f8" },
  { id: "berry", name: "Berry", desc: "Aubergine · raspberry", primary: "#1d1220", secondary: "#ff4f7b", light: "#fcf4f7" },
  { id: "plum", name: "Plum", desc: "Plum · lilac", primary: "#1e1430", secondary: "#c084fc", light: "#f8f5fd" },
];

// the Custom tab's quick swatches
export const DARK_SWATCHES = ["#071b2c", "#0b1630", "#0a1a33", "#1a2129", "#1c2430", "#16181d", "#0d0e10", "#201512", "#220c0f", "#1d1220", "#1e1430", "#0f2a22"];
export const BRIGHT_SWATCHES = ["#e0313a", "#e8423f", "#ff6b5b", "#d9572e", "#f28c38", "#ffc629", "#8fd16a", "#2ec4b6", "#5fb3d9", "#3d8bfd", "#c084fc", "#ff4f7b"];

const KEY = "inspecta.company";

const EMPTY: Company = {
  name: "",
  logo: null,
  plate: false,
  logoColours: [],
  schemeId: "default",
  custom: { primary: PRESETS[0].primary, secondary: PRESETS[0].secondary, light: PRESETS[0].light },
  setUp: false,
};

const listeners = new Set<() => void>();
let cache: Company | null = null;

export function getCompany(): Company {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Company>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

// false if it couldn't be saved (no room): it still applies until the app
// closes, but won't be there next time
export function setCompany(change: Partial<Company>): boolean {
  cache = { ...getCompany(), ...change };
  let saved = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    saved = false;
  }
  listeners.forEach((l) => l());
  return saved;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCompany(): Company {
  return useSyncExternalStore(subscribe, getCompany);
}

// Contractor mode with the setup not yet finished: the setup shows first
export const needsCompanySetup = () => getFlowMode() === "contractor" && !getCompany().setUp;

export const companyName = (c: Company = getCompany()) => c.name.trim();

export function companyInitials(c: Company = getCompany()): string {
  const words = companyName(c).split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

// ---- colours ----

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(c: number[]): string {
  return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminance(hex: string): number {
  const c = rgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const dist = (a: string, b: string) => {
  const x = rgb(a);
  const y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
function hueName(h: number): string {
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 65) return "yellow";
  if (h < 165) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// Three schemes from a logo's colours, each in the presets' recipe: the
// logo's strongest colour made vivid as the accent, over charcoal, navy (or
// a deep tone of a cool brand colour), and the logo's own dark colour, a
// deep tone of the brand colour or black. The one whose background best
// matches the logo's other colours comes first.
export function logoSchemes(cols: string[]): Preset[] {
  if (!cols.length) return [];
  const scored = cols
    .map((hx, i) => {
      const q = hsl(hx);
      const ok = q[2] > 0.18 && q[2] < 0.85 ? 1 : 0.15;
      return { q, score: (q[1] * ok) / Math.sqrt(i + 1) };
    })
    .sort((a, b) => b.score - a.score);
  const brand = scored[0];
  const hasColour = brand.q[1] > 0.25;
  const hue = hasColour ? brand.q[0] : 4; // a grey-only logo falls back to fire red
  const accent = fromHsl(hue, hasColour ? Math.min(0.88, Math.max(0.68, brand.q[1])) : 0.78, hue >= 40 && hue < 75 ? 0.55 : 0.52);
  const light = fromHsl(hue, 0.3, 0.97);
  const name = hueName(hue);
  const out: (Preset & { fit?: number; i?: number })[] = [];
  out.push({ id: "logo1", name: "Charcoal", desc: `Charcoal · ${name}`, primary: fromHsl(220, 0.14, 0.1), secondary: accent, light });
  const warm = hue < 75 || hue >= 330;
  out.push(
    warm
      ? { id: "logo2", name: "Navy", desc: `Navy · ${name}`, primary: fromHsl(210, 0.7, 0.1), secondary: accent, light }
      : { id: "logo2", name: `Deep ${name}`, desc: `Deep ${name} · ${name}`, primary: fromHsl(hue, 0.6, 0.09), secondary: accent, light },
  );
  const taken = out.map((o) => o.primary);
  const fresh = (hx: string) => taken.every((t) => dist(t, hx) > 28);
  const dark = cols
    .map(hsl)
    .filter((q) => q[2] < 0.38 && q[1] > 0.2 && Math.abs(q[0] - hue) > 25)
    .map((q) => fromHsl(q[0], Math.min(0.7, q[1]), 0.1))
    .find(fresh);
  if (dark) out.push({ id: "logo3", name: "Logo dark", desc: `Your logo's dark · ${name}`, primary: dark, secondary: accent, light });
  else if (hue < 15 || hue >= 75) out.push({ id: "logo3", name: "Tonal", desc: `Deep ${name} · ${name}`, primary: fromHsl(hue, 0.45, 0.085), secondary: accent, light });
  else out.push({ id: "logo3", name: "Black", desc: `Black · ${name}`, primary: "#0d0e10", secondary: accent, light });

  const others = cols.map(hsl).filter((q) => Math.abs(q[0] - brand.q[0]) > 25 || q[1] < 0.2);
  const fit = (o: Preset) => {
    const q = hsl(o.primary);
    let best = 0;
    for (const c of others) {
      const score = c[1] < 0.2 ? (q[1] < 0.25 ? 0.6 : 0) : q[1] >= 0.25 && hueGap(c[0], q[0]) < 30 ? 1 - hueGap(c[0], q[0]) / 60 : 0;
      best = Math.max(best, score);
    }
    return best;
  };
  out.forEach((o, i) => {
    o.fit = fit(o);
    o.i = i;
  });
  out.sort((a, b) => b.fit! - a.fit! || a.i! - b.i!);
  if (out[0].fit! > 0) out[0].desc = `Best match · ${out[0].desc}`;
  return out.map(({ fit: _f, i: _i, ...p }) => p);
}

export function companyScheme(c: Company = getCompany()): Preset {
  if (c.schemeId === "harbour") return PRESETS[0]; // Harbour became Default
  if (c.schemeId === "custom") return { id: "custom", name: "Custom", desc: "", ...c.custom };
  const all = [...PRESETS, ...(c.logo ? logoSchemes(c.logoColours) : [])];
  return all.find((p) => p.id === c.schemeId) ?? PRESETS[0];
}

// text on a coloured fill: white, or a very dark tone of the background
export function onColour(fill: string, primary: string): string {
  return luminance(fill) > 0.38 ? mix(primary, "#000000", 0.45) : "#ffffff";
}

// The app's colours (index.css variables) from a scheme
function themeVars(s: Scheme): Record<string, string> {
  const dark = luminance(s.primary) < 0.4;
  const text = dark ? s.light : "#14202b";
  const toward = dark ? "#ffffff" : "#000000";
  return {
    "--bg": s.primary,
    "--panel": mix(s.primary, toward, 0.05),
    "--panel-2": mix(s.primary, toward, 0.1),
    "--border": mix(s.primary, toward, 0.12),
    "--border-strong": mix(s.primary, toward, 0.18),
    "--text": text,
    "--muted": mix(text, s.primary, 0.38),
    "--muted-2": mix(text, s.primary, 0.5),
    "--accent": s.secondary,
    "--accent-text": onColour(s.secondary, s.primary),
    "--accent-rgb": rgb(s.secondary).join(", "),
  };
}

// The app's pages keep index.css's own colours in both modes: the company's
// colours are only for the Contractor splash (splashVars) and the report
// covers (lib/contractorCover). Clears any colours an older build put on
// the page.
export function applyTheme() {
  const root = document.documentElement;
  for (const k of Object.keys(themeVars(PRESETS[0]))) root.style.removeProperty(k);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", "#14161a");
}

// The company's colours for the Contractor splash, set on its own element;
// none for Default, which keeps the app's.
export function splashVars(c: Company = getCompany()): Record<string, string> {
  const scheme = companyScheme(c);
  return scheme.id === "default" ? {} : themeVars(scheme);
}

// ---- the logo ----

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = src;
  });
}

// Every stored logo is a PNG of at most 800 x 400 (keeps transparency), as
// the report covers add it as a PNG. Any picture the phone can open is
// taken: bigger ones are shrunk, and a drawing (SVG) is drawn at full size,
// as it stays sharp at any size.
type PreparedLogo = { logo: string; colours: string[]; width: number; height: number };

function shrinkLogo(img: HTMLImageElement, vector = false): PreparedLogo {
  const w0 = img.naturalWidth || 400;
  const h0 = img.naturalHeight || 200;
  const k = vector ? Math.min(800 / w0, 400 / h0) : Math.min(1, 800 / w0, 400 / h0);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * k));
  canvas.height = Math.max(1, Math.round(h0 * k));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { logo: canvas.toDataURL("image/png"), colours: logoColours(canvas), width: canvas.width, height: canvas.height };
}

// The cover prints the logo up to 220 x 60 pt. Under 2 pixels per point
// (less than 440 wide and 120 tall) it starts to look soft.
export const logoLooksSmall = (logo: { width: number; height: number }) => logo.width < 440 && logo.height < 120;

// the largest picture taken as a logo
const MAX_LOGO_BYTES = 25 * 1024 * 1024;
const MAX_LOGO_MB = MAX_LOGO_BYTES / 1024 / 1024;

// An uploaded logo. Throws an Error saying why it can't be used.
export async function prepareLogo(file: Blob): Promise<PreparedLogo> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file isn't a picture.");
  if (file.size > MAX_LOGO_BYTES) throw new Error(`That picture is too big (over ${MAX_LOGO_MB} MB).`);
  const url = URL.createObjectURL(file);
  try {
    let img: HTMLImageElement;
    try {
      img = await loadImage(url);
    } catch {
      throw new Error("That picture can't be read. It may be damaged, or in a format this phone can't open: try a PNG or JPG.");
    }
    return shrinkLogo(img, file.type === "image/svg+xml");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PNG_LOGO = "data:image/png;base64,";

// A logo from a setup file, taken as an upload is. Throws an Error saying
// why it can't be used.
export async function logoFromFile(dataUrl: unknown): Promise<PreparedLogo> {
  const head = typeof dataUrl === "string" ? /^data:(image\/[a-z0-9.+-]+)(;base64)?,/i.exec(dataUrl) : null;
  if (typeof dataUrl !== "string" || !head) throw new Error("The logo in this setup file isn't a picture.");
  const chars = dataUrl.length - head[0].length;
  if ((head[2] ? chars * 0.75 : chars) > MAX_LOGO_BYTES) throw new Error(`The logo in this setup file is too big (over ${MAX_LOGO_MB} MB).`);
  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    throw new Error("The logo in this setup file can't be read. It may be damaged, or in a format this phone can't open.");
  }
  return shrinkLogo(img, head[1].toLowerCase() === "image/svg+xml");
}

// A logo saved before logos were checked (e.g. from an early setup file)
// that isn't a PNG is made into one, or dropped if it can't be read, so the
// report covers can always use it. Run once at start.
export async function repairLogo() {
  const logo = getCompany().logo;
  if (!logo || logo.startsWith(PNG_LOGO)) return;
  try {
    setCompany({ logo: shrinkLogo(await loadImage(logo), logo.startsWith("data:image/svg")).logo });
  } catch {
    setCompany({ logo: null });
  }
}

// The logo's main colours: shrink it, bucket the pixels, merge near-same
// buckets, keep the biggest few (white and clear skipped)
function logoColours(source: HTMLCanvasElement | HTMLImageElement): string[] {
  const sw = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const sh = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  const k = Math.min(64 / (sw || 64), 64 / (sh || 64));
  const w = Math.max(1, Math.round((sw || 64) * k));
  const h = Math.max(1, Math.round((sh || 64) * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(source, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) continue;
    const key = `${d[i] >> 4}-${d[i + 1] >> 4}-${d[i + 2] >> 4}`;
    const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    e.r += d[i];
    e.g += d[i + 1];
    e.b += d[i + 2];
    e.n++;
    buckets.set(key, e);
    total++;
  }
  const list = [...buckets.values()].map((e) => ({ hex: toHex([e.r / e.n, e.g / e.n, e.b / e.n]), n: e.n })).sort((a, b) => b.n - a.n);
  const out: { hex: string; n: number }[] = [];
  for (const c of list) {
    const hit = out.find((o) => dist(o.hex, c.hex) < 56);
    if (hit) hit.n += c.n;
    else out.push({ ...c });
  }
  return out
    .filter((o) => o.n >= total * 0.015)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((o) => o.hex);
}

// The logo as a single-colour shape (any white background cleared), for
// the faint watermark on report covers
export async function logoShape(logo: string, colour: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(logo);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 400;
  c.height = img.naturalHeight || 200;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const px = ctx.getImageData(0, 0, c.width, c.height);
  const [r, g, b] = rgb(colour);
  for (let i = 0; i < px.data.length; i += 4) {
    const white = px.data[i] > 232 && px.data[i + 1] > 232 && px.data[i + 2] > 232;
    px.data[i + 3] = white ? 0 : px.data[i + 3];
    px.data[i] = r;
    px.data[i + 1] = g;
    px.data[i + 2] = b;
  }
  ctx.putImageData(px, 0, 0);
  return c;
}
