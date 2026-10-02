// Each export of the same file gets its own name, so uploading a newer copy
// to the same folder (OneDrive and the like refuse a name that's already
// there) works: the first is named as usual, then "Name (1).xlsx",
// "Name (2).xlsx" and so on. Counted per file name on this phone, and only
// once the file has actually been shared (a cancelled share doesn't count).

const KEY = "inspecta.exportCounts";

function counts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

// "Site report.xlsx" with n → "Site report (n).xlsx"
export function withCopyNumber(filename: string, n: number): string {
  if (!n) return filename;
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? `${filename.slice(0, dot)} (${n})${filename.slice(dot)}` : `${filename} (${n})`;
}

// the name for the next export of `filename`, and `shared` to call once it's shared
export function numberedExport(filename: string): { name: string; shared: () => void } {
  const key = filename.toLowerCase();
  const n = counts()[key] ?? 0;
  return {
    name: withCopyNumber(filename, n),
    shared: () => {
      try {
        const all = counts();
        all[key] = Math.max(all[key] ?? 0, n + 1);
        localStorage.setItem(KEY, JSON.stringify(all));
      } catch {
        // storage unavailable: the next one just gets the same name
      }
    },
  };
}
