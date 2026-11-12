"""Renders the launch sound (android/app/src/main/res/raw/splash_jingle.mp3,
and the same file for the iPhone app in ios/App/App/splash_jingle.mp3):
three soft, low "thocks" (a keycap bottoming out on a wooden desk), timed to
the 2.9s splash animation (src/components/Splash.css):
  1.10s  the swoosh closes
  1.32s  the letters land
  1.56s  "Inspecta" lights up (a slightly deeper, softer thock to settle)

It's deliberately quiet (peaks around -20 dBFS, no chime, no sustain) so it
reads as a small tactile cue rather than a jingle.

Needs numpy, scipy and ffmpeg:  python3 scripts/splash-jingle.py
"""
import numpy as np, wave, os, shutil, subprocess, tempfile
from scipy.signal import fftconvolve, butter, sosfilt

SR = 44100
LEN = 2.0
PEAK = 0.1  # about -20 dBFS
rng = np.random.default_rng(7)

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

def thock(f=230.0, d=0.07, wood=780.0, click=0.35):
    """A muted, woody knock: a low body whose pitch drops quickly as it
    settles, a short hollow resonance, and a tiny filtered-noise contact."""
    t = tt(d * 6)
    # body: pitch falls from ~1.5x to f in the first ~12ms
    fi = f * (1 + 0.5 * np.exp(-t / 0.012))
    ph = 2 * np.pi * np.cumsum(fi) / SR
    body = np.sin(ph) * np.exp(-t / d)
    # hollow wooden resonance, shorter than the body
    res = 0.35 * np.sin(2 * np.pi * wood * t) * np.exp(-t / (d * 0.35))
    # contact: soft, low-passed noise tick
    n = rng.standard_normal(len(t)) * np.exp(-t / 0.0025)
    n = sosfilt(butter(2, [400, 2500], btype="band", fs=SR, output="sos"), n)
    n *= click / (np.abs(n).max() + 1e-9)
    s = body + res + n
    # 1.5ms fade-in so there's no hard edge
    k = int(0.0015 * SR); s[:k] *= np.linspace(0, 1, k)
    return s / np.abs(s).max()

def room(x, size=0.35, mix=0.08):
    """A small, dark room so the thocks don't sound dry and clinical."""
    n = int(size * SR); t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t / (size / 6))
    ir = sosfilt(butter(1, 2500, btype="low", fs=SR, output="sos"), ir)
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    wet = np.stack([fftconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])
    return x * (1 - mix) + wet * mix

def finish(x, name):
    x = room(x)
    # gentle high-pass (phone speakers can't do the deep lows anyway)
    x = sosfilt(butter(2, 120, btype="high", fs=SR, output="sos"), x)
    # soften the top so nothing is clicky or harsh
    x = sosfilt(butter(2, 4500, btype="low", fs=SR, output="sos"), x)
    x *= PEAK / np.abs(x).max()
    pcm = (x.T * 32767).astype("<i2")
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "jingle.wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-b:a", "96k", name], check=True)
    return name

def thocks():
    """Three quiet thocks on the splash's beats: swoosh, letters, name."""
    x = buf()
    place(x, thock(240, 0.060, 820), 1.10, pan=-0.15, gain=0.80)
    place(x, thock(265, 0.060, 880), 1.32, pan=0.15, gain=0.80)
    place(x, thock(200, 0.085, 700, click=0.25), 1.56, gain=1.0)
    return x

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "android", "app", "src", "main", "res", "raw")
os.makedirs(OUT, exist_ok=True)
mp3 = finish(thocks(), os.path.join(OUT, "splash_jingle.mp3"))
ios = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ios", "App", "App", "splash_jingle.mp3")
shutil.copyfile(mp3, ios)
print(mp3, ios)
