export type SiteKind = "afss" | "project";

// Advanced-controls field — see lib/defectTypes.ts for labels and colours.
export type DefectType = "critical" | "non-critical" | "non-compliance" | "recommend" | "note-only" | "rectified" | "outstanding";

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
  // ESR category item code ("1.6", "6.3.4", "13") — see
  // lib/esrCategories.ts. Advanced-controls field; absent = Uncategorised.
  esrCategory?: string;
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

// the copy of a photo the PDF / Excel exports work from (see lib/exportCopy),
// plus the stamped photos made from it, kept so a repeat export can reuse
// them (key: what they were made for, so a change there remakes them)
export interface StampedPhoto {
  key: string;
  blob: Blob;
  width: number;
  height: number;
}
export interface ExportCopy {
  photoId: string;
  siteId: string;
  blob: Blob;
  excel?: StampedPhoto;
  pdf?: StampedPhoto;
}

// small JPEG of a photo for list thumbnails (see lib/thumbnail)
export interface Thumbnail {
  photoId: string;
  siteId: string;
  blob: Blob;
}

// ---- flow tests (Flow tests tab on a site; see lib/flowTest) ----

// sprinkler / hydrant: a section per supply (Town main, Electric pump,
// Diesel pump…); combined: a section per pump, all on one graph; blank:
// the inspector's own columns and rows
export type FlowKind = "sprinkler" | "hydrant" | "combined" | "blank";
// a flow as typed, in L/min or L/s (every sum works in L/min)
export type FlowUnit = "min" | "sec";

// one reading, every figure kept as typed ("" = not filled in)
export interface FlowReading {
  hg: string; // " Hg
  flow: string; // blank: worked out from " Hg (see FlowTest.k)
  flowUnit?: FlowUnit;
  dis: string; // discharge kPa
  suc: string; // suction kPa
  rpm?: string;
  amps?: string;
}

export interface FlowSection {
  name: string;
  rows: FlowReading[];
}

export interface DemandPoint {
  flow: string;
  flowUnit?: FlowUnit;
  kpa: string;
}

export interface FlowTest {
  id: string;
  siteId: string;
  kind: FlowKind;
  name: string;
  testedAt: number;
  // L/min per √(" Hg), for flows worked out from " Hg; 0 = flows are typed
  k: number;
  sections: FlowSection[];
  demand: DemandPoint[];
  // the template's header and comment lines
  equipment?: string;
  testedBy?: string;
  comment?: string;
  // lines on the graph, by "dis:<section>" / "suc:<section>"; missing
  // ones take the default (discharge shown, suction hidden)
  graph?: Record<string, boolean>;
  // blank sheet only
  columns?: string[];
  cells?: string[][];
  order: number;
  createdAt: number;
  updatedAt: number;
}
