"""Fills tools/reel.tpl.html from assets/timing.json and writes index.html (run after plan.py)."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, "assets/timing.json")))
tpl = open(os.path.join(ROOT, "tools/reel.tpl.html")).read()
sc = D["scenes"]; S = lambda i: sc[i]["start"]; E = lambda i: sc[i]["start"] + sc[i]["dur"]
# card -> (scene, seconds after the scene starts that its video begins)
cards = {"create": ("s2", 0.25), "addr": ("s3", 0.3), "paid": ("s4", 0.2), "numbers": ("s5", 0.9), "vault0": ("s6", 0.35), "vault1": ("s6", 3.2), "hooks": ("s7", 1.7), "mcp": ("s7", 2.9)}
for cid, (s, off) in cards.items():
    start = round(S(s) + off, 3); dur = round(min(D["cards"][cid], E(s) - start + 0.1), 3)
    tpl = tpl.replace("{{%s.start}}" % cid, str(start)).replace("{{%s.dur}}" % cid, str(dur))
steps = "".join(f'<div class="step"><b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></b>{n}</div>' for n in ["Detected", "Verified", "Final", "Swept", "In vault"])
out = tpl.replace("{{STEPS}}", steps).replace("{{TOTAL}}", str(D["total"])).replace("/*DATA*/null", json.dumps(D))
open(os.path.join(ROOT, "index.html"), "w").write(out)
print("ok", D["total"])
