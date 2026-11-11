import type { Finding, Photo, Site } from "../db/types";

// Names inside a backup file (lib/backup): one folder per site, named so a
// person can find their way around it on OneDrive or a computer, and photos
// named after their finding.

// Characters Windows, macOS or OneDrive won't take in a file or folder name.
// eslint-disable-next-line no-control-regex
const BAD = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

export function safeName(text: string, max = 80): string {
  const cleaned = text.replace(BAD, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  // a trailing dot or space vanishes on Windows
  return cleaned.replace(/[. ]+$/, "");
}

// "Name (2)", "Name (3)"… for repeats, compared as Windows does (any case)
function unique(name: string, taken: Set<string>): string {
  let out = name;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${name} (${n})`;
  taken.add(out.toLowerCase());
  return out;
}

// Site folder names: the site's name and address ("Harbour Tower - 1
// Harbour St"), so two sites with the same name still read apart.
export function siteFolders(sites: Pick<Site, "id" | "name" | "address">[]): Map<string, string> {
  const taken = new Set<string>();
  const folders = new Map<string, string>();
  for (const site of sites) {
    const base = safeName([site.name, site.address].map((s) => (s ?? "").trim()).filter(Boolean).join(" - ")) || "Untitled site";
    folders.set(site.id, unique(base, taken));
  }
  return folders;
}

const EXT: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
export const photoExtension = (mime: string) => EXT[mime] ?? "jpg";

// Photo file names inside a site's folder, without the extension (that
// follows the photo's type), e.g. "photos/F03 Level 2 - Exit sign out (1)":
// the finding's number in the site's order, its level and the start of its
// note, then the photo's place in the finding.
export function photoFiles(
  findings: Pick<Finding, "id" | "order" | "level" | "note" | "location">[],
  photos: Pick<Photo, "id" | "findingId" | "order">[],
): Map<string, string> {
  const sorted = [...findings].sort((a, b) => a.order - b.order);
  const width = Math.max(2, String(sorted.length).length);
  const label = new Map<string, string>();
  sorted.forEach((f, i) => {
    const words = [f.level, (f.note || f.location || "").split("\n")[0]].map((s) => (s ?? "").trim()).filter(Boolean).join(" - ");
    label.set(f.id, safeName(`F${String(i + 1).padStart(width, "0")}${words ? ` ${words}` : ""}`, 70));
  });
  const byFinding = new Map<string, typeof photos>();
  for (const p of photos) byFinding.set(p.findingId, [...(byFinding.get(p.findingId) ?? []), p]);
  const taken = new Set<string>();
  const files = new Map<string, string>();
  for (const [findingId, list] of byFinding) {
    list.sort((a, b) => a.order - b.order);
    list.forEach((p, i) => {
      const base = label.get(findingId) ?? safeName(`Photo ${p.id}`);
      const name = unique(list.length > 1 ? `${base} (${i + 1})` : base, taken);
      files.set(p.id, `photos/${name}`);
    });
  }
  return files;
}

// When a site last changed, for "new since last backup"
export const siteChangedAt = (site: Pick<Site, "changedAt" | "updatedAt">) => site.changedAt ?? site.updatedAt;

// "new": never backed up; "changed": changed since its last backup;
// "saved": its last backup has everything
export function siteBackupState(site: Pick<Site, "changedAt" | "updatedAt" | "backedUpAt">): "new" | "changed" | "saved" {
  if (!site.backedUpAt) return "new";
  return siteChangedAt(site) > site.backedUpAt ? "changed" : "saved";
}
