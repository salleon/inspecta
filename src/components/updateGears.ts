// The picture on the updating screen (design canvas UpdateGearsLive): two
// meshed gears turning steadily, drawn into a 300 × 230 SVG and rendered to a
// looping video by scripts/render-animations (see AnimationVideo). The small
// gear riding the progress bar is drawn live by UpdateScreen, so it follows
// the real download.

export type UpdateStep = "downloading" | "installing" | "restarting";

const NS = "http://www.w3.org/2000/svg";
const A = "var(--accent)";
const NAVY = "var(--bg)";

type Attrs = Record<string, string | number>;
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
}
// the two main gears, drawn as on the canvas board: chunky teeth with
// sloped sides, a navy ring and a hub; a seamless loop every LOOP_S seconds
export const MAIN_GEARS = { w: 300, h: 230 };
const BIG = { r: 72, teeth: 16, x: 114, y: 99, fill: A };
const SMALL = { r: 44, teeth: 10, x: 204, y: 154, fill: "#3f5a73" };
const DEPTH = 10;
// ten of the big gear's teeth per loop, so both gears are back where they started
const LOOP_TURN = (10 * 360) / BIG.teeth;
export const LOOP_S = 4;
const SMALL_OFFSET = 10.1;

function boardGear(parent: Element, r: number, teeth: number, fill: string) {
  const g = el("g", {}, parent);
  const pts: string[] = [];
  for (let k = 0; k < teeth * 2; k++) {
    const a0 = (Math.PI * 2 * k) / (teeth * 2);
    const a1 = (Math.PI * 2 * (k + 1)) / (teeth * 2);
    const R = k % 2 ? r - DEPTH : r;
    for (const a of [a0 + 0.04, a1 - 0.04]) pts.push(`${(R * Math.cos(a)).toFixed(2)} ${(R * Math.sin(a)).toFixed(2)}`);
  }
  el("path", { d: `M${pts.join(" L")}Z`, fill }, g);
  el("circle", { r: r * 0.42, fill: NAVY }, g);
  el("circle", { r: r * 0.16, fill }, g);
  return g;
}

// smallOffset: turns the small gear so its teeth sit in the big one's gaps
export function mountMainGears(svg: SVGSVGElement, smallOffset = SMALL_OFFSET): (t: number) => void {
  const big = boardGear(svg, BIG.r, BIG.teeth, BIG.fill);
  const small = boardGear(svg, SMALL.r, SMALL.teeth, SMALL.fill);
  return (t) => {
    const a = (LOOP_TURN * (t % LOOP_S)) / LOOP_S;
    big.setAttribute("transform", `translate(${BIG.x} ${BIG.y}) rotate(${a})`);
    // meshed: the other way, faster by the ratio of teeth
    small.setAttribute("transform", `translate(${SMALL.x} ${SMALL.y}) rotate(${(-a * BIG.teeth) / SMALL.teeth + smallOffset})`);
  };
}
