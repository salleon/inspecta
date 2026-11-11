// The phone as a sound level meter, for a reference check only (design
// canvas StairTestSimple, Noise): the microphone's level, A-weighted, in
// dB(A). Never a result: the result is typed from a calibrated meter.

// dB(A) for a full-scale signal: a typical phone microphone. (It could once
// be nudged ±1 on the phone; any nudge saved then is ignored.)
const OFFSET = 100;

// ---- A-weighting (IEC 61672) ----
// The analog curve is four real high-pass poles (20.6 Hz twice, 107.7 Hz,
// 737.9 Hz) and two real low-pass poles (12 194 Hz twice). Each becomes a
// first-order digital filter by the bilinear transform at the microphone's
// sample rate, and the whole is scaled to 0 dB at 1 kHz. (The first version
// used second-order filters for each pole, which cut low sounds far too
// hard: about 11 dB too much at 250 Hz, and more below, so a quiet room,
// which is mostly low hum, read near zero.)

const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;

// a first-order section: y = b0·x + b1·x[-1] − a1·y[-1]
export interface Section {
  b: [number, number];
  a: [number, number];
}

// analog (c1·s + c0) / (s + p) → digital, by the bilinear transform
function bilinear(c1: number, c0: number, p: number, fs: number): Section {
  const k = 2 * fs;
  const d = k + p;
  return { b: [(c1 * k + c0) / d, (c0 - c1 * k) / d], a: [1, (p - k) / d] };
}

function sectionGain(sec: Section, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  // e^{-jw}
  const re = Math.cos(w);
  const im = -Math.sin(w);
  const num = Math.hypot(sec.b[0] + sec.b[1] * re, sec.b[1] * im);
  const den = Math.hypot(sec.a[0] + sec.a[1] * re, sec.a[1] * im);
  return num / den;
}

// the A-weighting filter at a sample rate: six first-order sections, the
// first scaled so the whole is exactly 0 dB at 1 kHz
export function aWeightingSections(fs: number): Section[] {
  // the bilinear transform squeezes the top of the range, so the 12 kHz
  // poles are placed to give the right shape up to 8 kHz (the high-pass
  // poles are low enough not to notice)
  const w = (f: number) => 2 * fs * Math.tan((Math.PI * f) / fs);
  const top = (w(8000) / 8000) * F4;
  const highs = [F1, F1, F2, F3].map((f) => bilinear(1, 0, w(f), fs));
  const lows = [top, top].map((p) => bilinear(0, p, p, fs));
  const sections = [...highs, ...lows];
  const g = sections.reduce((acc, sec) => acc * sectionGain(sec, 1000, fs), 1);
  sections[0] = { b: [sections[0].b[0] / g, sections[0].b[1] / g], a: sections[0].a };
  return sections;
}

// the filter's gain at a frequency, in dB (for checking it against the standard)
export function aWeightingDb(f: number, fs: number): number {
  return 20 * Math.log10(aWeightingSections(fs).reduce((acc, sec) => acc * sectionGain(sec, f, fs), 1));
}

// what the phone actually gave us, for the diagnostic line under the meter
export interface MeterInfo {
  sampleRate: number;
  // undefined: the phone didn't say
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  echoCancellation?: boolean;
}

export interface Meter {
  stop: () => void;
}

const flag = (v: unknown) => (typeof v === "boolean" ? v : undefined);

// starts listening; onLevel gets the level about 8 times a second: the
// A-weighted dB(A), and the same with no weighting (diagnostics)
export async function startMeter(onLevel: (dba: number, raw: number) => void): Promise<Meter & { info: MeterInfo }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const AC: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  let node: AudioNode = source;
  for (const sec of aWeightingSections(ctx.sampleRate)) {
    const f = ctx.createIIRFilter(sec.b, sec.a);
    node.connect(f);
    node = f;
  }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  node.connect(analyser);
  // straight from the microphone, no weighting
  const rawAnalyser = ctx.createAnalyser();
  rawAnalyser.fftSize = 4096;
  source.connect(rawAnalyser);
  const buf = new Float32Array(analyser.fftSize);
  const level = (a: AnalyserNode) => {
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    return Math.max(0, 20 * Math.log10(Math.max(rms, 1e-9)) + OFFSET);
  };
  const timer = window.setInterval(() => onLevel(level(analyser), level(rawAnalyser)), 125);
  const settings = (stream.getAudioTracks()[0]?.getSettings?.() ?? {}) as MediaTrackSettings;
  return {
    info: { sampleRate: ctx.sampleRate, noiseSuppression: flag(settings.noiseSuppression), autoGainControl: flag(settings.autoGainControl), echoCancellation: flag(settings.echoCancellation) },
    stop() {
      window.clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
