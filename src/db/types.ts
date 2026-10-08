// flow: a site that's only flow testing (no findings or photos)
export type SiteKind = "afss" | "project" | "flow";

// Advanced-controls field — see lib/defectTypes.ts for labels and colours.
export type DefectType = "critical" | "non-critical" | "non-compliance" | "recommend" | "note-only" | "rectified" | "outstanding";

export interface Site {
  id: string;
  name: string;
  address: string;
  kind: SiteKind;
  createdAt: number;
  updatedAt: number;
  // customised reports made on the export page (see lib/customReports);
  // absent until the first one is made
  reports?: SiteReport[];
}

// A customised report: a chosen group of the site's findings, exported on
// its own under its name, laid out by time taken or ESR category.
export interface SiteReport {
  id: string;
  name: string;
  findingIds: string[];
  order: "time" | "esr";
  createdAt: number;
  updatedAt: number;
}

export interface Finding {
  id: string;
  siteId: string;
  note: string;
  location: string;
  // Optional. Absent on
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
  // circles, measurements etc. drawn on it (✎ Mark up), kept apart so they
  // can be changed later; the original stays in `blob`
  marks?: Mark[];
  // the photo with the marks drawn in, what's shown and exported (only
  // when there are marks; made again from blob + marks after a restore)
  marked?: Blob;
}

// A mark on a photo. Positions are fractions of the photo's width (x) and
// height (y), so they fit the photo at any size.
export type Mark =
  | { t: "circle"; cx: number; cy: number; rx: number; ry: number }
  | { t: "measure"; x0: number; y0: number; x1: number; y1: number; label: string }
  | { t: "arrow"; x0: number; y0: number; x1: number; y1: number }
  | { t: "pen"; pts: [number, number][] };

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
  flow: string; // typed, or worked out from " Hg (flowAuto)
  flowUnit?: FlowUnit;
  // true: the flow was worked out from " Hg with the test's flow equipment
  // (lib/flowEquipment), and follows the " Hg; false: it's being typed
  // (even if it's empty for now); absent: typed, or none
  flowAuto?: boolean;
  dis: string; // discharge kPa
  suc: string; // suction kPa
  rpm?: string;
  amps?: string;
  temp?: string; // engine temp °C (combined, Contractor)
  oil?: string; // oil pressure kPa (combined, Contractor)
  extra?: string[]; // the test's added columns (FlowTest.extraCols), in order
}

export interface FlowSection {
  name: string;
  rows: FlowReading[];
  // where a pump's suction comes from (any test); absent = not picked
  suction?: "tank" | "town";
  cutIn?: string; // a pump's cut-in pressure, kPa (combined, Contractor)
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
  // the flow unit the test is read in, when it was switched (combined: the
  // pump duty's unit; absent = the kind's own, see flowUnitFor)
  unit?: FlowUnit;
  yearInstalled?: string; // combined, Contractor
  // the template's header and comment lines
  equipment?: string;
  testedBy?: string;
  comment?: string;
  // columns added by the inspector (oil pressure, engine temp…), after Amps
  extraCols?: { name: string; unit?: string }[];
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
