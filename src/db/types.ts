export type SiteKind = "afss" | "project";

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
