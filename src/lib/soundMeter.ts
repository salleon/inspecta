// The phone as a sound level meter, for a reference check only (design
// canvas StairTestSimple, Noise): the microphone's level, roughly A-weighted,
// in dB(A). Never a result: the result is typed from a calibrated meter.
// Phone microphones read within a few dB once lined up against a calibrated
// meter, so the offset can be nudged and is kept on the phone.

const OFFSET_KEY = "inspecta.meterOffset";
// dB(A) for a full-scale signal; a typical phone microphone, before lining up
const DEFAULT_OFFSET = 100;

export function meterOffset(): number {
  try {
    const v = Number(localStorage.getItem(OFFSET_KEY));
    return Number.isFinite(v) && v !== 0 ? v : DEFAULT_OFFSET;
  } catch {
    return DEFAULT_OFFSET;
  }
}

export function setMeterOffset(v: number) {
  try {
    localStorage.setItem(OFFSET_KEY, String(v));
  } catch {
    // not kept: the default is used next time
  }
}

export interface Meter {
  stop: () => void;
}

// starts listening; onLevel gets the level about 8 times a second
export async function startMeter(onLevel: (dba: number) => void): Promise<Meter> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const AC: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  // A-weighting, near enough: the low end rolled off hard, the very top a
  // little (IEC 61672 poles at 20.6, 107.7, 737.9 and 12 194 Hz)
  const filter = (type: BiquadFilterType, frequency: number) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = 0.5;
    return f;
  };
  const chain = [filter("highpass", 20.6), filter("highpass", 20.6), filter("highpass", 107.7), filter("highpass", 737.9), filter("lowpass", 12194), filter("lowpass", 12194)];
  let node: AudioNode = source;
  for (const f of chain) {
    node.connect(f);
    node = f;
  }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  node.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    const dbfs = 20 * Math.log10(Math.max(rms, 1e-9));
    onLevel(Math.max(0, dbfs + meterOffset()));
  }, 125);
  return {
    stop() {
      window.clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
