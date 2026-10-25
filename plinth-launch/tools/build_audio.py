"""Voice, music bed and sound design for the Plinth launch film.

Generates the narration chunk by chunk (Kokoro, male voice), lays the chunks on a timeline with deliberate gaps,
synthesises a quiet music bed and a few UI sounds, ducks the bed under the voice and writes:
  assets/soundtrack.wav   the one audio track the composition plays
  assets/timing.json      start/end of every chunk, scene starts and the film length, read by build_html.py
Run with the venv that has kokoro-onnx, soundfile and numpy installed.
"""
import json, os, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
VOICE_DIR = os.path.join(ASSETS, "voice")
MODEL = os.environ.get("KOKORO_DIR", "/tmp/claude-0/tts")
VOICE = os.environ.get("VOICE", "am_michael")
SR = 48000
rng = np.random.default_rng(7)

# (id, scene, text, seconds of silence before this chunk)
CHUNKS = [
    ("a1", "s1", "Getting paid in stablecoins should be simple.", 1.0),
    ("b1", "s2", "But you either hand your balance to a processor.", 1.25),
    ("b2", "s2", "Or you match transfers to orders by hand.", 0.35),
    ("c1", "s3", "This is Plinth.", 1.5),
    ("c2", "s3", "Get paid in USDC, wherever you already sell.", 0.3),
    ("d1", "s4", "Every order gets its own address.", 1.5),
    ("d2", "s4", "It exists before any contract does,", 0.3),
    ("d3", "s4", "so there is nothing to fund, and nothing to babysit.", 0.2),
    ("e1", "s5", "Your customer pays with one gasless signature.", 1.4),
    ("e2", "s5", "Or simply scans the code, and sends USDC.", 0.4),
    ("f1", "s6", "The chain proves the payment.", 1.4),
    ("f2", "s6", "Detected.", 0.55),
    ("f3", "s6", "Verified.", 0.75),
    ("f4", "s6", "Final.", 0.75),
    ("f5", "s6", "Swept.", 0.75),
    ("f6", "s6", "And it lands in your vault.", 0.6),
    ("g1", "s7", "A vault only you can open.", 3.0),
    ("g2", "s7", "Plinth holds no key that can move your money.", 0.4),
    ("h1", "s8", "The fee is twenty basis points,", 1.5),
    ("h2", "s8", "and the contract itself caps it at one percent.", 0.3),
    ("i1", "s9", "One API call per order.", 1.4),
    ("i2", "s9", "Signed webhooks.", 0.55),
    ("i3", "s9", "Payment links.", 0.45),
    ("i4", "s9", "A Telegram Mini App.", 0.45),
    ("i5", "s9", "Even an MCP server,", 0.5),
    ("i6", "s9", "so your AI assistant can run your payments in plain English.", 0.2),
    ("j1", "s10", "Plinth.", 1.6),
    ("j2", "s10", "Non-custodial stablecoin payments.", 0.45),
    ("j3", "s10", "Built on Arc.", 0.55),
]
TAIL = 4.2  # seconds of picture after the last word


def trim(x, thr=0.004):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    return x[max(idx[0] - int(0.02 * len(x) / len(x) * SR), 0): idx[-1] + int(0.06 * SR)]


def synth_voice():
    os.makedirs(VOICE_DIR, exist_ok=True)
    k = Kokoro(f"{MODEL}/kokoro-v1.0.onnx", f"{MODEL}/voices-v1.0.bin")
    out = {}
    for cid, _, text, _ in CHUNKS:
        path = os.path.join(VOICE_DIR, f"{cid}.wav")
        if os.path.exists(path):
            x, sr = sf.read(path)
        else:
            x, sr = k.create(text, voice=VOICE, speed=0.97, lang="en-us")
            x = trim(np.asarray(x))
            sf.write(path, x, sr)
        if sr != SR:  # linear resample, enough for speech
            n = int(len(x) * SR / sr)
            x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
        out[cid] = x.astype(np.float32)
    return out


def env_pluck(n, decay):
    t = np.arange(n) / SR
    return np.exp(-t * decay) * np.minimum(t * 400, 1)


def tone(f, dur, decay=6.0, harm=(1, 0.35, 0.12), amp=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * (i + 1) * t) for i, a in enumerate(harm))
    return (y * env_pluck(n, decay) * amp).astype(np.float32)


def whoosh(dur=0.9, up=True):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # crude band sweep: moving-average length changes along the sweep, summed in blocks
    spec = np.fft.rfft(noise)
    f = np.fft.rfftfreq(n, 1 / SR)
    c = np.linspace(400, 5200, 1) if False else None
    centre = 700 + 3200 * (np.arange(n) / n) ** 2 if up else 3900 - 3000 * (np.arange(n) / n)
    # filter in 8 slices
    y = np.zeros(n)
    for s in range(8):
        a, b = s * n // 8, (s + 1) * n // 8
        fc = centre[(a + b) // 2]
        seg = np.fft.rfft(noise[a:b])
        ff = np.fft.rfftfreq(b - a, 1 / SR)
        g = np.exp(-((ff - fc) / (fc * 0.7)) ** 2)
        y[a:b] = np.fft.irfft(seg * g, b - a)
    w = np.sin(np.pi * np.arange(n) / n) ** 1.6
    y = y * w
    return (y / (np.max(np.abs(y)) + 1e-9) * 0.5).astype(np.float32)


def reverb(x, secs=2.2, wet=0.28):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.2)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    y = y / (np.max(np.abs(y)) + 1e-9) * np.max(np.abs(x))
    return x * (1 - wet) + y * wet


def smooth(x, ms):
    n = max(int(ms / 1000 * SR), 1)
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")


def main():
    voice = synth_voice()
    t = 0.0
    timing = {"chunks": {}, "scenes": {}}
    for cid, scene, text, gap in CHUNKS:
        t += gap
        d = len(voice[cid]) / SR
        timing["chunks"][cid] = {"scene": scene, "text": text, "start": round(t, 3), "end": round(t + d, 3)}
        timing["scenes"].setdefault(scene, {"start": round(t, 3)})["end"] = round(t + d, 3)
        t += d
    total = t + TAIL
    timing["total"] = round(total, 3)
    N = int(total * SR)

    # ── voice track
    vox = np.zeros(N, np.float32)
    for cid, c in timing["chunks"].items():
        s = int(c["start"] * SR)
        vox[s: s + len(voice[cid])] += voice[cid]
    vox = reverb(vox, 0.9, 0.06)
    vox /= np.max(np.abs(vox)) + 1e-9
    vox *= 0.9

    # ── music bed: slow pads and sparse plucks, key of D major, 84 bpm
    t_ax = np.arange(N) / SR
    chords = [  # D, Bm, G, A (root, third, fifth, ninth)
        (146.83, 185.00, 220.00, 329.63),
        (123.47, 146.83, 185.00, 277.18),
        (98.00, 123.47, 146.83, 220.00),
        (110.00, 138.59, 164.81, 246.94),
    ]
    bar = 60 / 84 * 4
    pad = np.zeros(N, np.float32)
    for i, ch in enumerate(chords * int(total / (bar * 4) + 2)):
        s = int(i * bar * SR)
        if s >= N:
            break
        n = min(int((bar + 1.6) * SR), N - s)
        tt = np.arange(n) / SR
        env = np.minimum(tt / 1.4, 1) * np.exp(-np.maximum(tt - bar, 0) * 2.2)
        y = np.zeros(n)
        for f in ch:
            for det in (-0.12, 0.0, 0.12):
                y += np.sin(2 * np.pi * (f + det) * tt) + 0.25 * np.sin(2 * np.pi * 2 * (f + det) * tt)
        pad[s: s + n] += (y * env * 0.018).astype(np.float32)
    beat = 60 / 84
    scale = [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99]
    plucks = np.zeros(N, np.float32)
    step = beat / 2
    k = 0
    tt0 = 6.0
    while tt0 < total - 3:
        if rng.random() < 0.34:
            f = scale[int(rng.integers(0, len(scale)))]
            y = tone(f, 1.6, decay=3.2, harm=(1, 0.18), amp=0.05)
            s = int(tt0 * SR)
            plucks[s: s + len(y)] += y[: N - s]
        tt0 += step
        k += 1
    bed = reverb(pad + plucks, 3.0, 0.45)
    fade = np.minimum(t_ax / 3.0, 1) * np.minimum((total - t_ax) / 3.5, 1)
    bed = bed * fade
    # duck the bed under the voice
    vox_env = smooth(np.abs(vox), 160)
    duck = 1 - 0.55 * np.clip(vox_env / 0.12, 0, 1)
    bed = bed * smooth(duck, 220)

    # ── sound design
    sfx = np.zeros(N, np.float32)

    def put(y, at, g=1.0):
        s = int(at * SR)
        if s < 0 or s >= N:
            return
        e = min(s + len(y), N)
        sfx[s:e] += y[: e - s] * g

    sc = timing["scenes"]
    for name in ("s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"):
        put(whoosh(1.0, up=True), sc[name]["start"] - 0.85, 0.5)
    ch = timing["chunks"]
    for i, cid in enumerate(("f2", "f3", "f4", "f5")):
        put(tone([880, 1046.5, 1318.5, 1568][i], 0.7, 7, (1, 0.4, 0.15), 0.22), ch[cid]["start"] - 0.02)
        put(tone([440, 523.25, 659.25, 784][i], 0.9, 5, (1, 0.3), 0.12), ch[cid]["start"] - 0.02)
    vault = ch["f6"]["start"] + 1.35
    put(tone(55, 1.6, 2.2, (1, 0.5, 0.2), 0.55), vault)
    put(tone(1760, 1.2, 4.5, (1, 0.3), 0.14), vault + 0.05)
    put(tone(2093, 1.4, 4.0, (1, 0.3), 0.10), vault + 0.15)
    put(tone(1318.5, 0.9, 6, (1, 0.35), 0.16), ch["a1"]["start"] + 1.55)  # "simple." settle
    put(tone(1568, 0.8, 6, (1, 0.35), 0.15), ch["c1"]["start"] + 0.05)     # brand reveal
    sfx = reverb(sfx, 1.6, 0.25)

    mix = vox * 1.0 + bed * 0.9 + sfx * 0.9
    # loudness: aim for about -16 LUFS integrated using a simple RMS match, then limit
    rms = np.sqrt(np.mean(mix[np.abs(mix) > 0.01] ** 2))
    mix *= 0.115 / (rms + 1e-9)
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    mix *= 0.85
    stereo = np.stack([mix, np.roll(mix, int(0.0006 * SR))], axis=1)
    sf.write(os.path.join(ASSETS, "soundtrack.wav"), stereo, SR, subtype="PCM_16")
    json.dump(timing, open(os.path.join(ASSETS, "timing.json"), "w"), indent=1)
    print("total", timing["total"])
    for sname, v in timing["scenes"].items():
        print(sname, v)


if __name__ == "__main__":
    main()
