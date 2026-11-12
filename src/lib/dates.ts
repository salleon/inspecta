// The app's date and time formats, in one place (Australian English, the
// phone's own time zone), on the built-in Intl formatting.

// "12 Nov 2026": lists, headings, file names
export const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

// "12/11/2026": the reports' date boxes
export const numericDate = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });

// "14:05": a run's time on the stair report
export const clock24 = (ms: number) => new Date(ms).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });

// "2026-11-12", the local date: file names that sort by date, and date inputs
export function isoDay(ms: number) {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

// a report's file name: "Harbour Tower – Flow tests – 12 Nov 2026.pdf"
// (characters Windows won't have in a file name become spaces)
export const reportFileName = (siteName: string, what: string, ext: string, at = Date.now()) =>
  `${(siteName || "Site").replace(/[\\/:*?"<>|]/g, " ").trim()} – ${what} – ${shortDate(at)}.${ext}`;
