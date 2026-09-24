export type SiteKind = "afss" | "project";

// Advanced-controls field — see lib/defectTypes.ts for labels and colours.
export type DefectType = "critical" | "non-critical" | "non-compliance" | "recommend" | "note-only";

export interface Site {
  id: string;
  name: string;
  address: string;
  kind: SiteKind;
  createdAt: number;
  updatedAt: number;
}

export interface Finding {
  id: string;
  siteId: string;
  note: string;
  location: string;
  // Optional, only offered while advanced controls are on. Absent on
  // findings that never had one set (including every pre-existing finding).
  defectType?: DefectType;
  // Optional building level, stored as its display text ("Level 25",
  // "Ground", "Basement 2", "Mezzanine", "Roof") — see lib/levels.ts.
  // Advanced-controls field, absent unless one was entered.
  level?: string;
  // manual sort position within a site's findings list — lower sorts
  // first. New findings get a very small (very negative) value so they
  // appear first, same as the old createdAt-desc default, until dragged.
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Photo {
  id: string;
  findingId: string;
  siteId: string;
  blob: Blob;
  takenAt: number;
  order: number;
}
