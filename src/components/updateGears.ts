// The picture on the updating screen (design canvas UpdateGearsLive): two
// meshed gears turning steadily, drawn into a 260 × 230 SVG and rendered to a
// looping video by scripts/render-animations (see AnimationVideo). The small
// gear riding the progress bar is drawn live by UpdateScreen, so it follows
// the real download.
//
// mountGears below is the earlier picture (the gear riding a drawn track);
// it's kept for the record but no longer rendered.

export type UpdateStep = "downloading" | "installing" | "restarting";
// t: seconds since the screen appeared; stepT: seconds since this step
// began; pct: the download, 0–100
export type GearsUpdate = (t: number, step: UpdateStep, stepT: number, pct: number) => void;

const NS = "http://www.w3.org/2000/svg";
const A = "#2ec4b6";
const NAVY = "#071b2c";

type Attrs = Record<string, string | number>;
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
}
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
// overshoots a little, for a part landing in place
const back = (x: number) => {
  x = clamp(x);
  return 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
};

// a gear centred on 0,0: square teeth 9 deep around radius r
function gear(parent: Element, r: number, teeth: number, fill: string) {
  const g = el("g", {}, parent);
  let d = "";
  for (let k = 0; k < teeth * 2; k++) {
    const a0 = (k / (teeth * 2)) * Math.PI * 2;
    const a1 = ((k + 1) / (teeth * 2)) * Math.PI * 2;
    const R = k % 2 ? r : r + 9;
    d += `${k ? "L" : "M"}${R * Math.cos(a0)} ${R * Math.sin(a0)} L${R * Math.cos(a1)} ${R * Math.sin(a1)} `;
  }
  el("path", { d: d + "Z", fill }, g);
  el("circle", { r: r * 0.36, fill: NAVY }, g);
  return g;
}

const TRACK_Y = 218; // centre of the progress track
const TRACK_X = 20;
const TRACK_W = 220;
const PLACE = { x: 182, y: 118 }; // where the small gear meshes with the big one
const ON_TRACK = 0.6; // the new gear's size while it rides the track

export function mountGears(svg: SVGSVGElement): GearsUpdate {
  el("rect", { x: TRACK_X, y: TRACK_Y - 4, width: TRACK_W, height: 8, rx: 4, fill: "#143452" }, svg);
  const trackFill = el("rect", { x: TRACK_X, y: TRACK_Y - 4, width: 0, height: 8, rx: 4, fill: A }, svg);
  const big = gear(svg, 52, 12, "#3a6286");
  const old = gear(svg, 30, 8, "#6a8098");
  const neu = gear(svg, 30, 8, A);

  return (t, step, stepT, pct) => {
    const done = step === "downloading" ? clamp(pct / 100) : 1;
    trackFill.setAttribute("width", String(TRACK_W * done));
    // spins down once it's restarting
    const spin = t * 60 - (step === "restarting" ? 30 * ease(stepT) : 0);
    big.setAttribute("transform", `translate(98 118) rotate(${spin})`);
    const small = -spin * (52 / 30) + 15; // meshed: turns the other way, faster

    // the old gear drops away as it installs
    const drop = step === "downloading" ? 0 : ease(stepT / 0.6);
    old.setAttribute("transform", `translate(${PLACE.x + 30 * drop} ${PLACE.y + 140 * drop}) rotate(${small + 90 * drop})`);
    old.setAttribute("opacity", String(1 - drop));

    if (step === "downloading") {
      // rolls along the track, centred on the line, keeping pace with the fill
      const x = TRACK_X + 12 + (TRACK_W - 24) * done;
      neu.setAttribute("transform", `translate(${x} ${TRACK_Y}) rotate(${(x - TRACK_X) * 3.2}) scale(${ON_TRACK})`);
    } else {
      // from the end of the track up into its place, growing to full size
      const lift = back((stepT - 0.3) / 0.7);
      const x = TRACK_X + TRACK_W - 12 + (PLACE.x - (TRACK_X + TRACK_W - 12)) * clamp(lift);
      const y = TRACK_Y + (PLACE.y - TRACK_Y) * lift;
      const scale = ON_TRACK + (1 - ON_TRACK) * clamp(lift);
      neu.setAttribute("transform", `translate(${x} ${y}) rotate(${lift >= 1 ? small : (TRACK_W - 24) * 3.2 + 200 * lift}) scale(${scale})`);
    }
  };
}

// the two main gears; a seamless loop every LOOP_S seconds
export const MAIN_GEARS = { w: 260, h: 230 };
const BIG = { r: 62, teeth: 14, x: 104, y: 98 };
const SMALL = { r: 36, teeth: 9 };
// pitch radii (half way up the teeth) touch, along a line 35° below level
const PITCH = BIG.r + 4.5 + SMALL.r + 4.5;
const SMALL_AT = { x: BIG.x + PITCH * Math.cos((35 * Math.PI) / 180), y: BIG.y + PITCH * Math.sin((35 * Math.PI) / 180) };
// ten of the big gear's teeth per loop, so both gears are back where they started
const LOOP_TURN = (10 * 360) / BIG.teeth;
export const LOOP_S = 4;

// smallOffset: turns the small gear so its teeth sit in the big one's gaps
export function mountMainGears(svg: SVGSVGElement, smallOffset = 29.7): (t: number) => void {
  const big = gear(svg, BIG.r, BIG.teeth, A);
  const small = gear(svg, SMALL.r, SMALL.teeth, "#3f5a73");
  return (t) => {
    const a = (LOOP_TURN * (t % LOOP_S)) / LOOP_S;
    big.setAttribute("transform", `translate(${BIG.x} ${BIG.y}) rotate(${a})`);
    // meshed: the other way, faster by the ratio of teeth
    small.setAttribute("transform", `translate(${SMALL_AT.x} ${SMALL_AT.y}) rotate(${(-a * BIG.teeth) / SMALL.teeth + smallOffset})`);
  };
}
