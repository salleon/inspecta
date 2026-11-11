"""Renders the launch sound (android/app/src/main/res/raw/splash_jingle.mp3,
and the same file for the iPhone app in ios/App/App/splash_jingle.mp3):
"In-spec-ta", three electric-piano notes, short-short-long, timed to the
2.9s splash animation (src/components/Splash.css):
  1.10s  G#4  the swoosh closes
  1.32s  B4   the letters land
  1.56s  E5   "Inspecta" lights up (with a low E, a soft pad and a bell sparkle)

Needs numpy, scipy and ffmpeg:  python3 scripts/splash-jingle.py
"""
import numpy as np, wave, os, shutil, subprocess, tempfile
from scipy.signal import fftconvolve, butter, sosfilt

SR = 44100
LEN = 3.1
rng = np.random.default_rng(7)

def hz(n):  # midi -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def buf():
    return np.zeros((2, int(SR * LEN)))

def place(out, sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    sig = sig[: out.shape[1] - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    out[0, i:i + len(sig)] += sig * gain * l * 1.414
    out[1, i:i + len(sig)] += sig * gain * r * 1.414

def tt(d):
    return np.arange(int(d * SR)) / SR

def env(t, a, d):  # attack then exponential decay
    e = np.exp(-t / d)
    att = np.clip(t / a, 0, 1)
    return e * (np.sin(att * np.pi / 2) ** 2)

def bell(f, d=2.2, bright=1.0):
    t = tt(d + 0.5)
    # glassy FM bell: modulator at 3.5x, index decays fast
    idx = bright * 2.2 * np.exp(-t / 0.25)
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t))
    s += 0.25 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.6)
    return s * env(t, 0.003, d * 0.45)

def epiano(f, d=1.8):
    t = tt(d + 0.4)
    idx = 1.6 * np.exp(-t / 0.18) + 0.25
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    tine = 0.18 * np.sin(2 * np.pi * f * 7.0 * t) * np.exp(-t / 0.03)
    return (s + tine) * env(t, 0.004, d * 0.4)

def pad(freqs, d, a=0.5, rel=0.8):
    t = tt(d)
    s = np.zeros_like(t)
    for f in freqs:
        for det in (-0.06, 0.0, 0.06):  # soft detuned triangle-ish
            ph = 2 * np.pi * f * 2 ** (det / 12) * t
            s += np.sin(ph) + 0.12 * np.sin(3 * ph) + 0.05 * np.sin(5 * ph)
    s /= len(freqs) * 3
    e = np.clip(t / a, 0, 1) ** 2 * np.clip((d - t) / rel, 0, 1)
    return s * e

def reverb(x, size=1.6, mix=0.22):
    n = int(size * SR); t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t / (size / 5))
    sos = butter(1, 5000, btype="low", fs=SR, output="sos")
    ir = sosfilt(sos, ir) ; ir[:, : int(0.012 * SR)] = 0  # pre-delay
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    wet = np.stack([fftconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])
    return x * (1 - mix) + wet * mix * 2.2

def finish(x, name):
    x = reverb(x)
    # gentle high-pass (phone speakers) + fade tail
    sos = butter(2, 160, btype="high", fs=SR, output="sos")
    x = sosfilt(sos, x)
    fade = np.ones(x.shape[1]); k = int(0.35 * SR); fade[-k:] = np.linspace(1, 0, k) ** 2
    x *= fade
    x = np.tanh(x / np.abs(x).max() * 1.2) ; x *= 0.7 / np.abs(x).max()
    pcm = (x.T * 32767).astype("<i2")
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "jingle.wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-b:a", "96k", name], check=True)
    return name

def opt_motif():
    """In-spec-ta: a three-note sonic logo, short-short-long, rising a sixth.
    Each note lands on a beat of the animation: swoosh closes, letters land,
    name lights up."""
    x = buf()
    place(x, epiano(hz(68), 1.0), 1.10, pan=-0.2, gain=0.32)   # G#4  "In"
    place(x, epiano(hz(71), 1.0), 1.32, pan=0.1, gain=0.32)    # B4   "spec"
    place(x, epiano(hz(76), 2.0), 1.56, gain=0.40)             # E5   "ta"
    place(x, bell(hz(88), 2.0, 0.5), 1.56, gain=0.13)          # E6 sparkle
    place(x, epiano(hz(40), 2.0), 1.56, gain=0.30)             # E2 root
    place(x, pad([hz(64), hz(68), hz(71), hz(75)], 1.6, a=0.25), 1.5, gain=0.11)
    return x

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "android", "app", "src", "main", "res", "raw")
os.makedirs(OUT, exist_ok=True)
mp3 = finish(opt_motif(), os.path.join(OUT, "splash_jingle.mp3"))
ios = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ios", "App", "App", "splash_jingle.mp3")
shutil.copyfile(mp3, ios)
print(mp3, ios)
