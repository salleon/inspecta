// Flow test equipment, from EnFact's flow charts (Sprinkler test sheet data
// / Flowtest Pipe Schedule): Ambit 20T & 21T Accutubes on medium steel and
// Sched 40 pipe, and AWR 73 & 74 and GCR Diamond 2 annubars. Every chart is
// the same sum: flow (L/min) = the device's flow at 1 " Hg × √" Hg. For the
// Ambit probes that's 0.12272 × K factor × pipe ID² (mm), and the chart's
// maximum ("do not exceed the maximum flow") is kept: past it a 20T reading
// should be taken with the 21T. (The charts' Sched 40 21T columns are
// labelled DN80 to DN150; their pipe sizes are 3", 4", 6", 8" and 10".)

import type { FlowTest } from "../db/types";

export interface FlowDevice {
  make: string;
  model: string;
  size: string;
  pipe: "Medium steel" | "Sched 40";
  q1: number; // L/min at 1 " Hg
  maxHg: number; // the chart's limit (30: the chart's end)
}

// make, model, size, pipe, L/min at 1 " Hg, max " Hg
const TABLE: [string, string, string, FlowDevice["pipe"], number, number][] = [
  ["Ambit", "20T", "DN50", "Medium steel", 220.77, 25],
  ["Ambit", "20T", "DN65", "Medium steel", 359.46, 18],
  ["Ambit", "20T", "DN80", "Medium steel", 534.13, 18],
  ["Ambit", "20T", "DN90", "Medium steel", 710.7, 11],
  ["Ambit", "20T", "DN100", "Medium steel", 914.45, 8],
  ["Ambit", "20T", "DN125", "Medium steel", 1385.27, 6],
  ["Ambit", "20T", "DN150", "Medium steel", 2084.3, 6],
  ["Ambit", "21T", "DN80", "Medium steel", 534.13, 30],
  ["Ambit", "21T", "DN90", "Medium steel", 710.7, 30],
  ["Ambit", "21T", "DN100", "Medium steel", 914.45, 23],
  ["Ambit", "21T", "DN125", "Medium steel", 1385.27, 18],
  ["Ambit", "21T", "DN150", "Medium steel", 2084.3, 18],
  ["Ambit", "20T", "2\"", "Sched 40", 215.65, 30],
  ["Ambit", "20T", "2.5\"", "Sched 40", 297.49, 25],
  ["Ambit", "20T", "3\"", "Sched 40", 495.51, 18],
  ["Ambit", "20T", "4\"", "Sched 40", 862.41, 12],
  ["Ambit", "20T", "6\"", "Sched 40", 2056.98, 6],
  ["Ambit", "21T", "3\"", "Sched 40", 495.51, 30],
  ["Ambit", "21T", "4\"", "Sched 40", 862.41, 30],
  ["Ambit", "21T", "6\"", "Sched 40", 2056.98, 17],
  ["Ambit", "21T", "8\"", "Sched 40", 3354.54, 12],
  ["Ambit", "21T", "10\"", "Sched 40", 5526.36, 8],
  ["AWR", "73 & 74 annubar", "50mm", "Medium steel", 245.635, 30],
  ["AWR", "73 & 74 annubar", "65mm", "Medium steel", 357, 30],
  ["AWR", "73 & 74 annubar", "80mm", "Medium steel", 574.183, 30],
  ["AWR", "73 & 74 annubar", "100mm", "Medium steel", 976.183, 30],
  ["AWR", "73 & 74 annubar", "150mm", "Medium steel", 2130.548, 30],
  ["AWR", "73 & 74 annubar", "200mm", "Medium steel", 3886.365, 30],
  ["AWR", "73 & 74 annubar", "50mm", "Sched 40", 239.635, 30],
  ["AWR", "73 & 74 annubar", "65mm", "Sched 40", 343.365, 30],
  ["AWR", "73 & 74 annubar", "80mm", "Sched 40", 532.635, 30],
  ["AWR", "73 & 74 annubar", "100mm", "Sched 40", 920.183, 30],
  ["AWR", "73 & 74 annubar", "150mm", "Sched 40", 2097.182, 30],
  ["AWR", "73 & 74 annubar", "200mm", "Sched 40", 3741.365, 30],
  ["GCR", "Diamond 2 annubar", "50mm", "Medium steel", 204.817, 30],
  ["GCR", "Diamond 2 annubar", "65mm", "Medium steel", 302.547, 30],
  ["GCR", "Diamond 2 annubar", "80mm", "Medium steel", 493.818, 30],
  ["GCR", "Diamond 2 annubar", "100mm", "Medium steel", 849.452, 30],
  ["GCR", "Diamond 2 annubar", "150mm", "Medium steel", 1875.817, 30],
  ["GCR", "Diamond 2 annubar", "200mm", "Medium steel", 3440.452, 30],
  ["GCR", "Diamond 2 annubar", "50mm", "Sched 40", 199.817, 30],
  ["GCR", "Diamond 2 annubar", "65mm", "Sched 40", 290.452, 30],
  ["GCR", "Diamond 2 annubar", "80mm", "Sched 40", 457, 30],
  ["GCR", "Diamond 2 annubar", "100mm", "Sched 40", 800, 30],
  ["GCR", "Diamond 2 annubar", "150mm", "Sched 40", 1845.817, 30],
  ["GCR", "Diamond 2 annubar", "200mm", "Sched 40", 3218, 30],
];

export const FLOW_DEVICES: FlowDevice[] = TABLE.map(([make, model, size, pipe, q1, maxHg]) => ({ make, model, size, pipe, q1, maxHg }));

/** As it's written in the Equipment field, e.g. "Ambit 20T DN80 · Medium steel". */
export function deviceLabel(d: FlowDevice) {
  return `${d.make} ${d.model} ${d.size} · ${d.pipe}`;
}

/** The device the Equipment field names, if it's one from the charts. */
export function deviceFor(equipment: string | undefined): FlowDevice | null {
  const e = (equipment ?? "").trim().toLowerCase();
  if (!e) return null;
  return FLOW_DEVICES.find((d) => deviceLabel(d).toLowerCase() === e) ?? null;
}

// what each device can be found by: its name, pipe, and the other ways its
// size is written (DN80, 80 mm, 3")
const SIZE_WORDS: Record<string, string> = {
  DN50: "50 50mm 2in", DN65: "65 65mm 2.5in", DN80: "80 80mm 3in", DN90: "90 90mm", DN100: "100 100mm 4in", DN125: "125 125mm 5in", DN150: "150 150mm 6in",
  '2"': "2in 50 dn50", '2.5"': "2.5in 65 dn65", '3"': "3in 80 dn80", '4"': "4in 100 dn100", '6"': "6in 150 dn150", '8"': "8in 200 dn200", '10"': "10in 250 dn250",
  "50mm": "50 dn50 2in", "65mm": "65 dn65 2.5in", "80mm": "80 dn80 3in", "100mm": "100 dn100 4in", "150mm": "150 dn150 6in", "200mm": "200 dn200 8in",
};
const inches = (s: string) => s.toLowerCase().replace(/"/g, "in");
const WORDS = FLOW_DEVICES.map((d) =>
  inches(`${d.make} ${d.model} ${d.size} ${d.pipe} ${SIZE_WORDS[d.size] ?? ""} ${d.make === "Ambit" ? "accutube" : "annubar"} ${d.pipe === "Sched 40" ? "schedule sch40" : "med"}`)
    .split(/\s+/)
    .filter(Boolean),
);

/** Devices matching what's typed: every word typed starts one of the device's, in any order. */
export function matchDevices(typed: string): FlowDevice[] {
  const want = inches(typed).split(/\s+/).filter(Boolean);
  if (!want.length) return [];
  return FLOW_DEVICES.filter((_, i) => want.every((w) => WORDS[i].some((x) => x.startsWith(w))));
}

/** The flow (L/min, whole) at a reading's " Hg, or null if there's no " Hg. */
export function deviceFlow(d: FlowDevice, hg: string): number | null {
  const h = parseFloat(String(hg).replace(",", "."));
  return Number.isFinite(h) && h >= 0 ? Math.round(d.q1 * Math.sqrt(h)) : null;
}

/** Over the chart's maximum at this " Hg. */
export function overLimit(d: FlowDevice, hg: string): boolean {
  const h = parseFloat(String(hg).replace(",", "."));
  return d.maxHg < 30 && Number.isFinite(h) && h > d.maxHg;
}

/**
 * The flows worked out from " Hg, for a test whose Equipment is one of the
 * devices: every reading with a " Hg and no typed flow gets the device's
 * flow (L/min), marked as worked out, so it follows its " Hg; a typed flow
 * is left as it is. Without a device, the worked-out flows are cleared (the
 * flows are typed). In place.
 */
export function applyEquipment(test: FlowTest) {
  if (test.kind === "hydrant" || test.kind === "blank") return;
  const d = deviceFor(test.equipment);
  for (const section of test.sections) {
    for (const r of section.rows) {
      // typed (or being typed): left as it is
      if (r.flowAuto === false || (!r.flowAuto && r.flow.trim() !== "")) continue;
      const flow = d ? deviceFlow(d, r.hg) : null;
      if (flow === null) {
        if (r.flowAuto) {
          r.flow = "";
          delete r.flowAuto;
        }
        continue;
      }
      r.flow = String(flow);
      r.flowUnit = "min";
      r.flowAuto = true;
    }
  }
}
