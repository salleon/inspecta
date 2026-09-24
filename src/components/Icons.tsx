import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export function IconChevronLeft({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  );
}

export function IconCamera({ size = 40, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
      <circle cx="12" cy="13" r="4"></circle>
    </svg>
  );
}

export function IconPlus({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

export function IconRetake({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <polyline points="1 4 1 10 7 10"></polyline>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
    </svg>
  );
}

export function IconTrash({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  );
}

export function IconShare({ size = 19, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
      <polyline points="16 6 12 2 8 6"></polyline>
      <line x1="12" y1="2" x2="12" y2="15"></line>
    </svg>
  );
}

export function IconSearch({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}

export function IconBuilding({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"></path>
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path>
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"></path>
      <line x1="10" y1="6" x2="14" y2="6"></line>
      <line x1="10" y1="10" x2="14" y2="10"></line>
      <line x1="10" y1="14" x2="14" y2="14"></line>
    </svg>
  );
}

export function IconCheck({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

export function IconEdit({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  );
}

export function IconChevronRight({ size = 18, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  );
}

export function IconSettings({ size = 15, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );
}

// A drag-handle "grip" — two columns of three dots. Deliberately filled
// (not stroked, unlike every other icon here) since a grip is conventionally
// a dot/dash pattern rather than a line drawing, and it needs to read as
// "grab me" at a glance among otherwise-linework icons. Takes `color` the
// same way every other icon here does (an SVG presentation attribute that
// `fill="currentColor"` resolves against).
export function IconGrip({ size = 20, ...p }: IconProps) {
  return (
    <svg width={size} height={(size * 26) / 20} viewBox="0 0 20 26" fill="currentColor" {...p}>
      <circle cx="6" cy="5" r="2"></circle>
      <circle cx="14" cy="5" r="2"></circle>
      <circle cx="6" cy="13" r="2"></circle>
      <circle cx="14" cy="13" r="2"></circle>
      <circle cx="6" cy="21" r="2"></circle>
      <circle cx="14" cy="21" r="2"></circle>
    </svg>
  );
}
