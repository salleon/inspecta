// Pictures for the loading overlay, one per job, as approved on the design
// canvas: a conveyor of fire-safety kit into a report for PDFs, a
// spreadsheet filling in for Excel, photos dropping into a pouch that zips
// shut for the photos zip, and sites / findings / photos packed into a box
// for backups. Each is drawn into a 240 × 220 SVG and moved frame by frame
// by the function mountArt returns (time, and progress 0–100). Exports draw
// them live (components/ProgressOverlay); the backup's is played as a video
// that scripts/render-animations renders from here (see AnimationVideo).

export type LoaderArt = "conveyor" | "sheet" | "zip" | "box";
export type LoaderUpdate = (t: number, pct: number, count?: number) => void;

const NS = "http://www.w3.org/2000/svg";
const A = "#2ec4b6";
const PANEL2 = "#16324d";
const PAPER = "#e8eef3";
const INK = "#9fb0bf";
const RISK = ["#ff0000", "#ffc000", "#00b050", "#92d050", "#ffc000", "#ff0000", "#00b050"];

type Attrs = Record<string, string | number>;
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
}
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const set = (e: Element, attrs: Attrs) => {
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
};

// a small stamped photo, centred on 0,0
function snap(parent: Element, w: number, h: number, hue: number) {
  const g = el("g", {}, parent);
  el("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 2, fill: "#f4f7f9" }, g);
  el("rect", { x: -w / 2 + 3, y: -h / 2 + 3, width: w - 6, height: h - 12, fill: `hsl(${hue},20%,48%)` }, g);
  const iw = w - 6;
  const ih = h - 12;
  el("path", { d: `M${-w / 2 + 3} ${h / 2 - 9} l${iw * 0.3} ${-ih * 0.45} l${iw * 0.25} ${ih * 0.3} l${iw * 0.18} ${-ih * 0.15} l${iw * 0.27} ${ih * 0.3} z`, fill: `hsl(${hue},22%,34%)` }, g);
  const st = el("text", { x: w / 2 - 4, y: h / 2 - 12, "text-anchor": "end", "font-size": Math.max(5, w / 9), "font-weight": 800, fill: "#fff" }, g);
  st.textContent = "09:14";
  return { g, st };
}

// PDF: fire-safety kit rides a conveyor into a report that fills up
function conveyor(svg: SVGSVGElement): LoaderUpdate {
  el("rect", { x: 0, y: 150, width: 170, height: 14, rx: 7, fill: PANEL2 }, svg);
  const dots = Array.from({ length: 9 }, (_, i) => el("circle", { cx: i * 20, cy: 157, r: 3, fill: "#2b577a" }, svg));
  el("rect", { x: 168, y: 60, width: 66, height: 104, rx: 6, fill: PAPER }, svg);
  const fill = el("rect", { x: 168, y: 164, width: 66, height: 0, fill: "#8fd9d1" }, svg);
  [40, 32, 44, 28, 38].forEach((w, r) => el("rect", { x: 178, y: 74 + r * 16, width: w, height: 5, rx: 2.5, fill: INK }, svg));
  const icons: SVGGElement[] = [];
  const icon = (draw: (g: SVGGElement) => void) => {
    const g = el("g", {}, svg);
    draw(g);
    icons.push(g);
  };
  icon((g) => {
    // extinguisher
    el("rect", { x: -9, y: -26, width: 18, height: 30, rx: 6, fill: "#e53935" }, g);
    el("rect", { x: -4, y: -32, width: 8, height: 7, fill: "#333" }, g);
    el("path", { d: "M4 -30 q10 0 10 10", fill: "none", stroke: "#333", "stroke-width": 2.5 }, g);
  });
  icon((g) => {
    // old-style EXIT sign
    el("rect", { x: -21, y: -23, width: 42, height: 21, rx: 3, fill: "#fff" }, g);
    el("rect", { x: -19.5, y: -21.5, width: 39, height: 18, rx: 2, fill: "#1e8a3c" }, g);
    const tx = el("text", { x: 0, y: -7.2, "text-anchor": "middle", "font-size": 12.5, "font-weight": 800, "letter-spacing": 1, fill: "#fff", "font-family": "Arial, Helvetica, sans-serif" }, g);
    tx.textContent = "EXIT";
  });
  icon((g) => {
    // sprinkler
    el("rect", { x: -3, y: -30, width: 6, height: 12, fill: "#b0bec5" }, g);
    el("path", { d: "M-12 -18 h24 l-4 6 h-16z", fill: "#cfd8dc" }, g);
    el("circle", { cx: 0, cy: -6, r: 4, fill: "#e53935" }, g);
    for (const dx of [-10, 0, 10]) el("line", { x1: dx * 0.6, y1: -2, x2: dx, y2: 4, stroke: "#64b5f6", "stroke-width": 2, "stroke-linecap": "round" }, g);
  });
  icon((g) => {
    // fire door
    el("rect", { x: -12, y: -34, width: 24, height: 34, rx: 2, fill: "#8d6e63" }, g);
    el("rect", { x: -5, y: -28, width: 10, height: 12, fill: "#b3e5fc" }, g);
    el("circle", { cx: 7, cy: -16, r: 2, fill: "#ffd54f" }, g);
  });
  return (t, pct) => {
    const off = (t * 60) % 20;
    dots.forEach((d, i) => d.setAttribute("cx", String(i * 20 + off - 10)));
    icons.forEach((g, i) => {
      const u = (t / 1.4 + i / icons.length) % 1;
      const x = -20 + u * 190;
      let y = 150;
      let s = 1;
      let o = 1;
      if (x > 150) {
        const k = clamp((x - 150) / 20);
        y = 150 - 60 * k;
        s = 1 - 0.6 * k;
        o = 1 - k;
      }
      set(g, { transform: `translate(${Math.min(x, 172)},${y}) scale(${s})`, opacity: o });
    });
    const h = 104 * clamp(pct / 100) * 0.99;
    set(fill, { y: 164 - h, height: h });
  };
}

// Excel: a table fills in row by row, a highlighted cell moving along
function sheet(svg: SVGSVGElement): LoaderUpdate {
  const g = el("g", { transform: "translate(20,14)" }, svg);
  el("rect", { x: 0, y: 0, width: 200, height: 190, rx: 8, fill: PAPER }, g);
  el("rect", { x: 0, y: 0, width: 200, height: 24, rx: 8, fill: "#bfbfbf" }, g);
  el("rect", { x: 0, y: 16, width: 200, height: 8, fill: "#bfbfbf" }, g);
  for (const x of [40, 74, 146]) el("line", { x1: x, y1: 0, x2: x, y2: 190, stroke: "#c4ced6", "stroke-width": 1.2 }, g);
  for (let r = 1; r < 7; r++) el("line", { x1: 0, y1: 24 + r * 23.5, x2: 200, y2: 24 + r * 23.5, stroke: "#c4ced6", "stroke-width": 1.2 }, g);
  const rows = RISK.map((risk, r) => {
    const y = 24 + r * 23.5;
    return [
      el("rect", { x: 9, y: y + 4, width: 24, height: 15, rx: 2, fill: "#7d8f9c", opacity: 0 }, g),
      el("rect", { x: 48, y: y + 8, width: 0, height: 6, rx: 3, fill: INK }, g),
      el("rect", { x: 82, y: y + 8, width: 0, height: 6, rx: 3, fill: INK }, g),
      el("rect", { x: 152, y: y + 5, width: 40, height: 13, rx: 6.5, fill: risk, opacity: 0 }, g),
    ];
  });
  const cursor = el("rect", { x: 0, y: 0, width: 36, height: 23.5, fill: "none", stroke: A, "stroke-width": 2.5, rx: 2 }, g);
  const colX = [0, 40, 74, 146];
  const colW = [40, 34, 72, 54];
  return (t, pct) => {
    const k = clamp(pct / 100) * 7 * 4;
    let cx = 0;
    let cy = 24;
    let cw = 40;
    rows.forEach((cells, r) =>
      cells.forEach((c, i) => {
        const u = clamp(k - (r * 4 + i));
        if (i === 0 || i === 3) c.setAttribute("opacity", String(u));
        if (i === 1) c.setAttribute("width", String(22 * u));
        if (i === 2) c.setAttribute("width", String(56 * u));
        if (u > 0 && u < 1) {
          cx = colX[i];
          cw = colW[i];
          cy = 24 + r * 23.5;
        }
      }),
    );
    set(cursor, { x: cx, y: cy, width: cw, opacity: 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) });
  };
}

// Photos zip: stamped photos drop into a pouch that zips shut as it goes
function zip(svg: SVGSVGElement): LoaderUpdate {
  el("rect", { x: 34, y: 92, width: 172, height: 104, rx: 12, fill: "#1d4e6b" }, svg);
  const drops = [0, 1, 2, 3].map((i) => snap(svg, 48, 40, (i * 71) % 360));
  el("path", { d: "M34 112 H206 V184 a12 12 0 0 1 -12 12 H46 a12 12 0 0 1 -12 -12 Z", fill: "#2a6d8f" }, svg);
  const teethL: SVGRectElement[] = [];
  const teethR: SVGRectElement[] = [];
  for (let k = 0; k < 16; k++) {
    const x = 44 + k * 10.4;
    teethL.push(el("rect", { x, y: 104, width: 6, height: 7, rx: 1.5, fill: "#b0bec5" }, svg));
    teethR.push(el("rect", { x: x + 5, y: 110, width: 6, height: 7, rx: 1.5, fill: "#b0bec5" }, svg));
  }
  const pull = el("g", {}, svg);
  el("rect", { x: -7, y: -6, width: 14, height: 12, rx: 3, fill: A }, pull);
  el("rect", { x: -4, y: 6, width: 8, height: 18, rx: 4, fill: A }, pull);
  el("circle", { cx: 0, cy: 19, r: 2, fill: "#0e2740" }, pull);
  const label = el("text", { x: 120, y: 160, "text-anchor": "middle", "font-size": 20, "font-weight": 800, fill: "#e6f7f5", "letter-spacing": 2 }, svg);
  return (t, pct, count) => {
    drops.forEach((s, i) => {
      const u = (t / 1.0 + i / 4) % 1;
      set(s.g, { transform: `translate(${70 + i * 33},${-20 + 130 * ease(u)}) rotate(${(i % 2 ? 1 : -1) * 10 * u})`, opacity: u > 0.8 ? 0 : 1 });
      s.st.setAttribute("opacity", u > 0.35 ? "1" : "0");
    });
    const zx = 40 + 166 * clamp(pct / 100);
    pull.setAttribute("transform", `translate(${zx},110) rotate(${Math.sin(t * 10) * 6})`);
    teethL.forEach((r, k) => r.setAttribute("y", 44 + k * 10.4 < zx ? "104" : "98"));
    teethR.forEach((r, k) => r.setAttribute("y", 49 + k * 10.4 < zx ? "110" : "116"));
    label.textContent = count === undefined ? "" : `${count} PHOTO${count === 1 ? "" : "S"}`;
  };
}

// Backup: sites, findings and photos drop into a box, which closes and is
// taped up over the last few percent
function box(svg: SVGSVGElement): LoaderUpdate {
  const backFlap = el("path", { d: "M72 110 L168 110 L150 88 L90 88 Z", fill: "#9c7248" }, svg);
  const kinds = ["site", "finding", "photo", "photo", "finding", "photo"];
  const cards = kinds.map((kind) => {
    const g = el("g", {}, svg);
    el("rect", { x: -13, y: -10, width: 26, height: 20, rx: 4, fill: kind === "photo" ? "#f4f7f9" : PAPER }, g);
    if (kind === "photo") {
      el("rect", { x: -10, y: -7, width: 20, height: 12, fill: "#6d8494" }, g);
      el("path", { d: "M-10 5 l6 -5 4 3 4 -2 6 4z", fill: "#50697a" }, g);
    } else if (kind === "site") {
      el("rect", { x: -5, y: -7, width: 10, height: 14, fill: "#1d4e6b" }, g);
      for (const y of [-5, -1, 3]) el("rect", { x: -3, y, width: 6, height: 2, fill: A }, g);
    } else {
      el("rect", { x: -9, y: -6, width: 18, height: 3, rx: 1.5, fill: INK }, g);
      el("rect", { x: -9, y: -1, width: 13, height: 3, rx: 1.5, fill: INK }, g);
      el("rect", { x: -9, y: 4, width: 16, height: 3, rx: 1.5, fill: "#ffc000" }, g);
    }
    return g;
  });
  el("path", { d: "M72 110 H168 V180 a6 6 0 0 1 -6 6 H78 a6 6 0 0 1 -6 -6 Z", fill: "#c08a55" }, svg);
  el("rect", { x: 112, y: 110, width: 16, height: 76, fill: "#d9a86f", opacity: 0.5 }, svg);
  const flapL = el("path", {}, svg);
  const flapR = el("path", {}, svg);
  const tape = el("rect", { x: 112, y: 104, width: 16, height: 0, fill: "#e8d9b0" }, svg);
  el("rect", { x: 84, y: 136, width: 40, height: 24, rx: 3, fill: "#f4f7f9" }, svg);
  el("rect", { x: 88, y: 141, width: 22, height: 3, rx: 1.5, fill: INK }, svg);
  el("rect", { x: 88, y: 148, width: 30, height: 3, rx: 1.5, fill: INK }, svg);
  for (const f of [flapL, flapR]) f.setAttribute("fill", "#b07d4a");
  return (t, pct) => {
    const c = ease(clamp((pct - 93) / 5)); // flaps close over the last few percent
    cards.forEach((g, i) => {
      const u = (t / 1.1 + i / cards.length) % 1;
      set(g, { transform: `translate(${120 + ((i % 3) - 1) * 22},${-10 + 140 * ease(u)}) rotate(${(i % 2 ? 1 : -1) * 12 * u})`, opacity: c > 0.3 || u > 0.85 ? 0 : 1 });
    });
    const lift = 110 - 26 * (1 - c);
    flapL.setAttribute("d", `M72 110 L120 110 L120 ${lift} L${72 - 22 * (1 - c)} ${lift} Z`);
    flapR.setAttribute("d", `M168 110 L120 110 L120 ${lift} L${168 + 22 * (1 - c)} ${lift} Z`);
    backFlap.setAttribute("opacity", String(1 - c));
    tape.setAttribute("height", String(82 * clamp((pct - 98) / 2)));
  };
}

export function mountArt(svg: SVGSVGElement, art: LoaderArt): LoaderUpdate {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  return { conveyor, sheet, zip, box }[art](svg);
}
