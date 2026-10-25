"""Plinth launch reel (about 52 s): timing on a musical grid, narration, music, sound design and trimmed app footage.

Every picture of the product in this film is a crop of the real recording of the app (live.mp4); nothing is mocked up.

  python tools/plan.py        voice + music + timing + trimmed footage cards (needs the kokoro venv)
  python tools/build_html.py  writes index.html
"""
import json, os, subprocess, sys, shutil
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_helpers as A

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
SHOTS = os.path.join(ASSETS, "shots")
LIVE = os.environ.get("LIVE", "/tmp/claude-0/-home-user-plinth-v2/330d461b-e79f-5f5a-b64f-53599d43d621/scratchpad/live/live.mp4")
SR = A.SR
BPM = 112
BEAT = 60 / BPM
BAR = BEAT * 4

SCENES = [("s1", 2), ("s2", 3), ("s3", 3), ("s4", 4), ("s5", 3), ("s6", 3), ("s7", 3), ("s8", 3)]  # bars each

# narration: id -> (scene, seconds after the scene starts, text)
VO = {
    "a1": ("s1", 0.45, "Getting paid in stablecoins should be simple."),
    "b1": ("s2", 0.45, "One link. Name it, price it, share it."),
    "c1": ("s3", 0.45, "Every order gets its own address."),
    "c2": ("s3", 3.15, "It exists before the contract does."),
    "d1": ("s4", 0.35, "The chain proves the payment."),
    "d2": ("s4", 2.95, "Detected."),
    "d3": ("s4", 3.95, "Verified."),
    "d4": ("s4", 4.95, "Final."),
    "d5": ("s4", 5.8, "Swept."),
    "d6": ("s4", 6.75, "In your vault."),
    "e1": ("s5", 0.35, "Twenty-five in. Five cents of fee."),
    "e2": ("s5", 3.35, "Twenty-four ninety-five is yours."),
    "f1": ("s6", 0.35, "A vault only you can open."),
    "f2": ("s6", 3.0, "No admin key."),
    "g1": ("s7", 0.35, "One API call. Webhooks. Even your AI assistant."),
    "h1": ("s8", 0.55, "Plinth. Non-custodial stablecoin payments."),
    "h2": ("s8", 3.4, "Built on Arc."),
}

# footage cards: id -> segments (src_in, src_out, speed) of the recording, and how long the card must play (hold the last frame)
CARDS = {
    "create": dict(segs=[(120.4, 121.6, 1.0), (124.4, 134.6, 2.9), (139.6, 141.7, 1.3)], dur=7.0),
    "addr": dict(segs=[(214.0, 219.9, 1.0)], dur=6.6),
    "paid": dict(segs=[(239.4, 245.8, 2.0), (245.8, 249.0, 1.0)], dur=9.0),
    "numbers": dict(segs=[(283.7, 292.0, 1.0)], dur=7.2),
    "vault0": dict(segs=[(109.3, 113.0, 1.0)], dur=7.0),
    "vault1": dict(segs=[(410.9, 413.2, 1.0)], dur=4.0),
    "hooks": dict(segs=[(451.2, 456.5, 1.0)], dur=6.2),
    "mcp": dict(segs=[(94.8, 98.4, 1.0)], dur=6.2),
}


def synth():
    from kokoro_onnx import Kokoro
    os.makedirs(A.VOICE_DIR, exist_ok=True)
    k = Kokoro(f"{A.MODEL}/kokoro-v1.0.onnx", f"{A.MODEL}/voices-v1.0.bin")
    out = {}
    for cid, (_, _, text) in VO.items():
        path = os.path.join(A.VOICE_DIR, f"{cid}.wav")
        if os.path.exists(path):
            x, sr = sf.read(path)
        else:
            x, sr = k.create(text, voice=A.VOICE, speed=1.05, lang="en-us")
            x = A.trim(np.asarray(x)); sf.write(path, x, sr)
        if sr != SR:
            n = int(len(x) * SR / sr); x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
        out[cid] = x.astype(np.float32)
    return out


def cut():
    os.makedirs(SHOTS, exist_ok=True)
    tmp = os.path.join(SHOTS, "_tmp"); os.makedirs(tmp, exist_ok=True)
    for cid, c in CARDS.items():
        parts = []; seg_len = sum((e - s) / sp for s, e, sp in c["segs"])
        for i, (s, e, sp) in enumerate(c["segs"]):
            f = os.path.join(tmp, f"{cid}_{i}.mp4")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(s), "-t", str(e - s), "-i", LIVE, "-vf", f"setpts=(PTS-STARTPTS)/{sp},fps=30,scale=1920:1080:flags=lanczos", "-an", "-c:v", "libx264", "-crf", "14", "-preset", "veryfast", f], check=True)
            parts.append(f)
        lst = os.path.join(tmp, cid + ".txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
        hold = max(0.0, c["dur"] - seg_len) + 0.2
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-vf", f"tpad=stop_mode=clone:stop_duration={hold:.3f},trim=duration={c['dur']:.3f},format=yuv420p", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-movflags", "+faststart", os.path.join(SHOTS, cid + ".mp4")], check=True)
        print("  card", cid, f"{c['dur']:.1f}s (footage {seg_len:.1f}s)")
    shutil.rmtree(tmp, ignore_errors=True)


def music(total, scene_start, kick_from, vox_env):
    N = int(total * SR); rng = np.random.default_rng(5)
    t_ax = np.arange(N) / SR
    mus = np.zeros(N, np.float32)

    def put(buf, y, at, g=1.0):
        s = int(at * SR)
        if 0 <= s < len(buf):
            e = min(s + len(y), len(buf)); buf[s:e] += y[:e - s] * g

    # pads: D, Bm, G, A
    chords = [(146.83, 185.00, 220.00, 329.63), (123.47, 146.83, 185.00, 277.18), (98.00, 123.47, 146.83, 220.00), (110.00, 138.59, 164.81, 246.94)]
    for i in range(int(total / BAR) + 2):
        ch = chords[i % 4]; s = int(i * BAR * SR)
        if s >= N: break
        n = min(int((BAR + 1.4) * SR), N - s); tt = np.arange(n) / SR
        env = np.minimum(tt / 0.9, 1) * np.exp(-np.maximum(tt - BAR, 0) * 2.4); y = np.zeros(n)
        for f in ch:
            for det in (-0.1, 0.0, 0.1):
                y += np.sin(2 * np.pi * (f + det) * tt) + 0.22 * np.sin(2 * np.pi * 2 * (f + det) * tt)
        mus[s:s + n] += (y * env * 0.016).astype(np.float32)
    # kick on every beat, soft; hats on the off-beat; clap on 2 and 4
    kick = np.zeros(N, np.float32); hat = np.zeros(N, np.float32); clap = np.zeros(N, np.float32); bass = np.zeros(N, np.float32); arp = np.zeros(N, np.float32)
    kt = np.arange(int(0.32 * SR)) / SR
    kick_y = (np.sin(2 * np.pi * (48 + 110 * np.exp(-kt * 38)) * kt) * np.exp(-kt * 9.5) * 0.9).astype(np.float32)
    hn = rng.standard_normal(int(0.07 * SR)); hat_y = (np.diff(hn, prepend=0) * np.exp(-np.arange(len(hn)) / SR * 70) * 0.5).astype(np.float32)
    cn = rng.standard_normal(int(0.18 * SR)); clap_y = (np.diff(cn, prepend=0) * np.exp(-np.arange(len(cn)) / SR * 26) * 0.55).astype(np.float32)
    nb = int(total / BEAT)
    roots = [73.42, 61.74, 49.0, 55.0]
    penta = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0]
    for b in range(nb):
        t = b * BEAT; bar = int(t / BAR)
        if t >= kick_from and t < total - 2 * BAR * 0.5:
            put(kick, kick_y, t, 1.0)
            put(hat, hat_y, t + BEAT / 2, 0.7)
            if b % 4 in (1, 3) and t >= kick_from + 2 * BAR:
                put(clap, clap_y, t, 0.6)
            put(bass, A.tone(roots[bar % 4], BEAT * 0.9, 3.0, (1, 0.25), 0.34), t + (BEAT * 0.5 if b % 2 else 0), 1.0)
        if t >= kick_from - BAR:
            for q in range(4):
                if rng.random() < 0.55:
                    put(arp, A.tone(penta[int(rng.integers(0, len(penta)))], 0.9, 6.0, (1, 0.15), 0.05), t + q * BEAT / 4, 1.0)
    duck = 1 - 0.7 * np.clip(A.smooth(kick, 90) / 0.05, 0, 1)
    body = (mus + bass * 1.0 + A.reverb(arp, 1.6, 0.4)) * A.smooth(duck, 40)
    out = body + kick * 0.9 + hat * 0.6 + clap * 0.7
    out = out * np.minimum(t_ax / 1.2, 1) * np.minimum((total - t_ax) / 2.4, 1)
    out = out * A.smooth(1 - 0.5 * np.clip(vox_env / 0.1, 0, 1), 200)
    return out.astype(np.float32)


def main():
    voice = synth()
    starts = {}; t = 0.0
    for sid, bars in SCENES:
        starts[sid] = dict(start=round(t, 3), dur=round(bars * BAR, 3), bars=bars); t += bars * BAR
    total = round(t, 3)
    chunks = {}
    for cid, (sc, off, text) in VO.items():
        st = starts[sc]["start"] + off; d = len(voice[cid]) / SR
        chunks[cid] = dict(scene=sc, text=text, start=round(st, 3), end=round(st + d, 3))
        room = starts[sc]["start"] + starts[sc]["dur"] - (st + d)
        if room < 0.15: print(f"  !! {cid} runs {-room:.2f}s past its scene")
    N = int(total * SR)
    vox = np.zeros(N, np.float32)
    for cid, c in chunks.items():
        s = int(c["start"] * SR); vox[s:s + len(voice[cid])] += voice[cid]
    vox = A.reverb(vox, 0.8, 0.05); vox /= np.max(np.abs(vox)) + 1e-9; vox *= 0.92
    vox_env = A.smooth(np.abs(vox), 160)

    mus = music(total, starts, starts["s2"]["start"], vox_env)

    sfx = np.zeros(N, np.float32)
    def put(y, at, g=1.0):
        s = int(at * SR)
        if 0 <= s < N:
            e = min(s + len(y), N); sfx[s:e] += y[:e - s] * g
    for sid, v in starts.items():
        if sid != "s1":
            put(A.whoosh(0.9, True), v["start"] - 0.5, 0.45)
    for i, cid in enumerate(("d2", "d3", "d4", "d5", "d6")):
        c = chunks[cid]["start"]; f = [880, 1046.5, 1318.5, 1568, 1760][i]
        put(A.tone(f, 0.7, 7, (1, 0.4, 0.15), 0.22), c - 0.02); put(A.tone(f / 2, 0.9, 5, (1, 0.3), 0.12), c - 0.02)
    c = chunks["e2"]["start"] + 0.15; put(A.tone(55, 1.4, 2.4, (1, 0.5, 0.2), 0.5), c); put(A.tone(1760, 1.2, 4.5, (1, 0.3), 0.14), c)
    sfx = A.reverb(sfx, 1.4, 0.22)

    mix = vox * 1.0 + mus * 0.95 + sfx * 0.9
    rms = np.sqrt(np.mean(mix[np.abs(mix) > 0.01] ** 2)); mix *= 0.12 / (rms + 1e-9)
    mix = np.tanh(mix * 1.2) / np.tanh(1.2) * 0.8
    os.makedirs(ASSETS, exist_ok=True)
    sf.write(os.path.join(ASSETS, "soundtrack.wav"), np.stack([mix, np.roll(mix, int(0.0006 * SR))], axis=1), SR, subtype="PCM_16")
    json.dump(dict(total=total, bpm=BPM, beat=BEAT, bar=BAR, scenes=starts, chunks=chunks, cards={k: v["dur"] for k, v in CARDS.items()}), open(os.path.join(ASSETS, "timing.json"), "w"), indent=1)
    print("total", total)
    if "--no-cut" not in sys.argv:
        cut()


if __name__ == "__main__":
    main()
