"""Edit plan for the Plinth film, built from the real recording of the app (live.mp4).

Each beat is a piece of the live session: which seconds of the recording to use, how fast, and which narration chunks
play on top. The beat's length follows the narration and the footage; nothing here is invented footage.

  python tools/plan.py           voice + timing + sound + trimmed shots (needs the kokoro venv)
  python tools/build_html.py     writes index.html from assets/timing.json
"""
import json, os, subprocess, sys
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_audio as A  # helpers: tone, whoosh, reverb, smooth, SR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
SHOTS = os.path.join(ASSETS, "shots")
LIVE = os.environ.get("LIVE", "/tmp/claude-0/-home-user-plinth-v2/330d461b-e79f-5f5a-b64f-53599d43d621/scratchpad/live/live.mp4")
SR = A.SR
TITLE = 1.2  # seconds a chapter card stays up before a scene's footage starts

TEXT = {
    "a1": "This is Plinth, a payment gateway for USDC.",
    "a2": "Instead of reading about it, let's use it, starting at the front page.",
    "a3": "Every invoice gets its own address, and the money lands in a vault only the merchant can open.",
    "b1": "I sign in to the merchant dashboard.",
    "b2": "It starts with one question: how do you want to get paid? A link, your own website, or a chat with an AI assistant.",
    "c1": "First, where will the money land? A vault, balance zero, one owner wallet, and no admin role for the gateway.",
    "d1": "Let's sell something. A payment link: a name, twenty-five USDC, a short description.",
    "d2": "One click, and it's live.",
    "e1": "Now I'm the customer. I open the link and review what I'm paying for.",
    "e2": "A wallet isn't connected here, so I'll pay the other way: straight to an address.",
    "e3": "This address and this QR code belong to this one order.",
    "e4": "I copy it, and send exactly twenty-five USDC from my wallet. A real transaction, on a local test chain.",
    "e5a": "The page is watching the chain.",
    "e5b": "Detected.",
    "e5c": "Verified.",
    "e5d": "Final.",
    "e5e": "Settling.",
    "e5f": "And then: payment complete. The funds are in the merchant's vault.",
    "f1": "Back on the merchant side, the overview already knows: twenty-five received, a five cent fee, twenty-four ninety-five delivered.",
    "f2": "The payment shows as settled. Its page lists every step the backend recorded, from detection to the relayer's sweep.",
    "f3": "In settlements, the relayer paid the network fee, and the destination is my vault. And the vault itself: from zero, to twenty-four ninety-five.",
    "g1": "If you'd rather automate this, it's one API call. The app even hands you the snippet.",
    "g2a": "I run it with my test key,",
    "g2b": "and the order shows up in the dashboard, waiting for payment.",
    "g3": "Every step also sends a signed webhook to your server. Detected, confirmed, settled, completed. Each one delivered, and acknowledged.",
    "h1": "A link, an address, proof from the chain, and money in a vault only you control.",
    "h2": "Plinth. Non-custodial stablecoin payments, built on Arc.",
}

# scene: chapter card text (None = the film opens straight on the site)
SCENES = {
    "s1": None,
    "s2": ("Sign in.", "One question to start."),
    "s3": ("Where it lands.", "Before the first payment."),
    "s4": ("Create a link.", "Name. Amount. Done."),
    "s5": ("The customer pays.", "A link, an address, the chain."),
    "s6": ("The merchant's view.", "Received. Fee. Settled."),
    "s7": ("Or automate it.", "One API call."),
    "s8": None,
}

# segs: (src_in, src_out, speed) seconds of the live recording. vo: (chunk, offset or None = after the previous one).
# min: shortest the beat may be. zoom: camera moves on the footage (t in beat seconds, scale, css-px centre of the 1280x720 page).
BEATS = [
    dict(id="hero", scene="s1", segs=[(0.35, 4.8, 1.0)], min=5.0, vo=[("a1", 0.5), ("a2", None)]),
    dict(id="idea", scene="s1", segs=[(26.8, 30.2, 1.0)], min=4.0, vo=[("a3", 0.5)]),
    dict(id="signin", scene="s2", segs=[(44.0, 48.0, 1.7), (56.0, 74.1, 2.8), (74.6, 77.2, 1.0)], min=5.0, vo=[("b1", 0.3)]),
    dict(id="paths", scene="s2", segs=[(84.4, 90.0, 1.3), (93.2, 97.5, 1.3)], min=5.0, vo=[("b2", 0.3)]),
    dict(id="vault0", scene="s3", segs=[(105.0, 113.0, 1.0)], min=5.0, vo=[("c1", 0.5)],
         zoom=[(3.9, 1.3, 760, 540)]),
    dict(id="create", scene="s4", segs=[(117.5, 121.6, 1.2), (124.4, 134.6, 2.6), (139.6, 141.7, 1.0)], min=5.0, vo=[("d1", 2.4)]),
    dict(id="live", scene="s4", segs=[(141.8, 153.0, 2.2)], min=3.0, vo=[("d2", 0.4)]),
    dict(id="cust", scene="s5", segs=[(158.7, 168.5, 1.9)], min=3.0, vo=[("e1", 0.3)]),
    dict(id="nowallet", scene="s5", segs=[(175.6, 183.5, 2.6), (190.3, 204.8, 3.4)], min=3.0, vo=[("e2", 0.4)]),
    dict(id="addr", scene="s5", segs=[(212.3, 219.5, 1.3)], min=3.0, vo=[("e3", 0.4)],
         zoom=[(1.8, 1.6, 930, 250)]),
    dict(id="send", scene="s5", segs=[(225.3, 235.8, 1.7)], min=3.0, vo=[("e4", 0.3)]),
    dict(id="chain", scene="s5", segs=[(237.0, 239.4, 1.0), (239.4, 245.8, 1.0), (245.8, 249.0, 1.0), (253.2, 258.2, 1.0)], min=3.0,
         vo=[("e5a", 0.2), ("e5b", 2.6), ("e5c", 3.75), ("e5d", 4.9), ("e5e", 6.0), ("e5f", 8.9)]),
    dict(id="over", scene="s6", segs=[(264.6, 267.6, 1.3), (277.0, 291.5, 1.9)], min=5.0, vo=[("f1", 3.6)],
         zoom=[(6.4, 1.3, 770, 300)]),
    dict(id="detail", scene="s6", segs=[(292.6, 295.0, 1.0), (362.7, 369.3, 1.3), (375.4, 388.0, 3.6)], min=5.0, vo=[("f2", 3.4)],
         zoom=[(5.0, 1.45, 742, 400), (8.0, 1.0, 640, 360)]),
    dict(id="settle", scene="s6", segs=[(390.9, 396.0, 1.5), (403.2, 411.5, 1.4)], min=5.0, vo=[("f3", 0.4)],
         zoom=[(0.5, 1.35, 742, 330), (3.2, 1.0, 640, 360), (7.7, 1.4, 640, 470)]),
    dict(id="api", scene="s7", segs=[(418.0, 432.5, 3.0)], min=3.0, vo=[("g1", 0.3)]),
    dict(id="term", scene="s7", kind="terminal", min=4.5, vo=[("g2a", 0.4)]),
    dict(id="pays", scene="s7", segs=[(438.9, 445.0, 1.5)], min=3.0, vo=[("g2b", 0.3)]),
    dict(id="hooks", scene="s7", segs=[(451.2, 466.5, 2.3)], min=3.0, vo=[("g3", 0.3)]),
    dict(id="end", scene="s8", kind="end", min=5.0, vo=[("h1", 0.6), ("h2", None)]),
]
GAP = 0.3
TAIL = 0.4


def synth():
    from kokoro_onnx import Kokoro
    os.makedirs(A.VOICE_DIR, exist_ok=True)
    k = Kokoro(f"{A.MODEL}/kokoro-v1.0.onnx", f"{A.MODEL}/voices-v1.0.bin")
    out = {}
    for cid, text in TEXT.items():
        path = os.path.join(A.VOICE_DIR, f"{cid}.wav")
        if os.path.exists(path):
            x, sr = sf.read(path)
        else:
            x, sr = k.create(text, voice=A.VOICE, speed=1.02, lang="en-us")
            x = A.trim(np.asarray(x)); sf.write(path, x, sr)
        if sr != SR:
            n = int(len(x) * SR / sr); x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
        out[cid] = x.astype(np.float32)
    return out


def schedule(voice):
    t = 0.0; beats = []; chunks = {}; scene_seen = set()
    for b in BEATS:
        card = SCENES.get(b["scene"]) is not None and b["scene"] not in scene_seen
        scene_seen.add(b["scene"])
        lead = TITLE if card else 0.0
        segs = b.get("segs", [])
        seg_len = sum((e - s) / sp for s, e, sp in segs)
        cur = 0.0; vo_end = 0.0; placed = []
        for cid, off in b["vo"]:
            st = cur + (GAP if placed and off is None else 0) if off is None else off
            st = max(st, cur if placed else 0)
            d = len(voice[cid]) / SR
            placed.append((cid, st, d)); cur = st + d; vo_end = cur
        body = max(b["min"], seg_len, vo_end + TAIL)
        beat = dict(id=b["id"], scene=b["scene"], kind=b.get("kind", "footage"), start=round(t, 3), card=bool(card), lead=lead,
                    body_start=round(t + lead, 3), dur=round(lead + body, 3), seg_len=round(seg_len, 3), zoom=b.get("zoom", []),
                    segs=segs, title=SCENES.get(b["scene"]) if card else None)
        for cid, st, d in placed:
            chunks[cid] = dict(text=TEXT[cid], beat=b["id"], start=round(t + lead + st, 3), end=round(t + lead + st + d, 3))
        beats.append(beat); t += lead + body
    return beats, chunks, round(t + 0.2, 3)


def cut(beats):
    os.makedirs(SHOTS, exist_ok=True)
    tmp = os.path.join(SHOTS, "_tmp"); os.makedirs(tmp, exist_ok=True)
    for b in beats:
        if b["kind"] != "footage":
            continue
        body = b["dur"] - b["lead"]
        parts = []
        for i, (s_, e_, sp) in enumerate(b["segs"]):  # each piece is cut on its own: seeking is fast and nothing is buffered
            f = os.path.join(tmp, f"{b['id']}_{i}.mp4")
            r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(s_), "-t", str(e_ - s_), "-i", LIVE, "-vf", f"setpts=(PTS-STARTPTS)/{sp},fps=30", "-an", "-c:v", "libx264", "-crf", "14", "-preset", "veryfast", f])
            if r.returncode: raise SystemExit(f"cut failed: {b['id']} {i}")
            parts.append(f)
        lst = os.path.join(tmp, b["id"] + ".txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
        hold = max(0.0, body - b["seg_len"]) + 0.2
        out = os.path.join(SHOTS, f"{b['id']}.mp4")
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-vf", f"tpad=stop_mode=clone:stop_duration={hold:.3f},trim=duration={body:.3f},format=yuv420p", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-movflags", "+faststart", out])
        if r.returncode: raise SystemExit(f"concat failed: {b['id']}")
        print("  shot", b["id"], f"{body:.1f}s (footage {b['seg_len']:.1f}s)")
    import shutil; shutil.rmtree(tmp, ignore_errors=True)


def mix(voice, beats, chunks, total):
    N = int(total * SR); t_ax = np.arange(N) / SR
    vox = np.zeros(N, np.float32)
    for cid, c in chunks.items():
        s = int(c["start"] * SR); vox[s:s + len(voice[cid])] += voice[cid]
    vox = A.reverb(vox, 0.9, 0.06); vox /= np.max(np.abs(vox)) + 1e-9; vox *= 0.9

    chords = [(146.83, 185.00, 220.00, 329.63), (123.47, 146.83, 185.00, 277.18), (98.00, 123.47, 146.83, 220.00), (110.00, 138.59, 164.81, 246.94)]
    bar = 60 / 84 * 4; pad = np.zeros(N, np.float32)
    for i, ch in enumerate(chords * int(total / (bar * 4) + 2)):
        s = int(i * bar * SR)
        if s >= N: break
        n = min(int((bar + 1.6) * SR), N - s); tt = np.arange(n) / SR
        env = np.minimum(tt / 1.4, 1) * np.exp(-np.maximum(tt - bar, 0) * 2.2); y = np.zeros(n)
        for f in ch:
            for det in (-0.12, 0.0, 0.12):
                y += np.sin(2 * np.pi * (f + det) * tt) + 0.25 * np.sin(2 * np.pi * 2 * (f + det) * tt)
        pad[s:s + n] += (y * env * 0.017).astype(np.float32)
    scale = [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99]
    plucks = np.zeros(N, np.float32); beat_s = 60 / 84; tt0 = 4.0; rng = np.random.default_rng(11)
    while tt0 < total - 3:
        if rng.random() < 0.3:
            y = A.tone(scale[int(rng.integers(0, len(scale)))], 1.6, 3.2, (1, 0.18), 0.045); s = int(tt0 * SR); plucks[s:s + len(y)] += y[:N - s]
        tt0 += beat_s / 2
    bed = A.reverb(pad + plucks, 3.0, 0.45) * np.minimum(t_ax / 3.0, 1) * np.minimum((total - t_ax) / 3.5, 1)
    bed = bed * A.smooth(1 - 0.55 * np.clip(A.smooth(np.abs(vox), 160) / 0.12, 0, 1), 220)

    sfx = np.zeros(N, np.float32)
    def put(y, at, g=1.0):
        s = int(at * SR)
        if 0 <= s < N:
            e = min(s + len(y), N); sfx[s:e] += y[:e - s] * g
    for b in beats:
        if b["card"]:
            put(A.whoosh(1.0, True), b["start"] - 0.2, 0.55)
            put(A.tone(1568, 0.8, 6, (1, 0.35), 0.13), b["start"] + 0.45)
    for i, cid in enumerate(("e5b", "e5c", "e5d")):
        c = chunks[cid]["start"]; put(A.tone([880, 1046.5, 1318.5][i], 0.7, 7, (1, 0.4, 0.15), 0.22), c - 0.02); put(A.tone([440, 523.25, 659.25][i], 0.9, 5, (1, 0.3), 0.12), c - 0.02)
    c = chunks["e5f"]["start"]; put(A.tone(55, 1.6, 2.2, (1, 0.5, 0.2), 0.45), c); put(A.tone(1760, 1.2, 4.5, (1, 0.3), 0.14), c + 0.05); put(A.tone(2093, 1.4, 4.0, (1, 0.3), 0.10), c + 0.2)
    sfx = A.reverb(sfx, 1.6, 0.25)
    mix = vox + bed * 0.9 + sfx * 0.9
    rms = np.sqrt(np.mean(mix[np.abs(mix) > 0.01] ** 2)); mix *= 0.115 / (rms + 1e-9)
    mix = np.tanh(mix * 1.15) / np.tanh(1.15) * 0.8
    sf.write(os.path.join(ASSETS, "soundtrack.wav"), np.stack([mix, np.roll(mix, int(0.0006 * SR))], axis=1), SR, subtype="PCM_16")


def main():
    voice = synth()
    beats, chunks, total = schedule(voice)
    json.dump(dict(total=total, beats=beats, chunks=chunks), open(os.path.join(ASSETS, "timing.json"), "w"), indent=1)
    print("total", total)
    if "--no-cut" not in sys.argv:
        cut(beats)
    mix(voice, beats, chunks, total)
    for b in beats:
        print(f"{b['start']:7.1f}  {b['dur']:5.1f}  {b['id']}")


if __name__ == "__main__":
    main()
