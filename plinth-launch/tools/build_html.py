"""Fills tools/film.tpl.html from assets/timing.json and writes index.html (run after plan.py)."""
import json, os, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, "assets/timing.json")))
SCRATCH = "/tmp/claude-0/-home-user-plinth-v2/330d461b-e79f-5f5a-b64f-53599d43d621/scratchpad"
api = json.load(open(os.path.join(SCRATCH, "api_response.json")))
TITLE = 1.2
tpl = open(os.path.join(ROOT, "tools/film.tpl.html")).read()
B = {b["id"]: b for b in D["beats"]}

videos, cards = [], []
n_cards = sum(1 for b in D["beats"] if b["card"]); k = 1
for b in D["beats"]:
    if b["kind"] == "footage":
        s = max(0.0, b["body_start"] - 0.15); d = round(b["start"] + b["dur"] - s + 0.05, 3)
        videos.append(f'<video id="v_{b["id"]}" class="clip fv" src="assets/shots/{b["id"]}.mp4" muted playsinline data-start="{round(s,3)}" data-duration="{d}"></video>')
    if b["card"]:
        k += 1
        l1, l2 = b["title"]
        cards.append(f'<div id="tc_{b["scene"]}" class="tcard clip" data-start="{b["start"]}" data-duration="{TITLE + 0.15}"><div class="tnum mono">{k:02d} / {n_cards + 1:02d}</div><div class="tline"></div><div class="tt"><div class="l1">{html.escape(l1)}</div><div class="l2">{html.escape(l2)}</div></div></div>')

def lines_of(text, limit=56):
    words = text.split(); out = []; cur = []
    for w in words:
        cand = " ".join(cur + [w])
        if len(cand) > limit and cur:
            out.append(" ".join(cur)); cur = [w]
        else:
            cur.append(w)
        if cur and cur[-1][-1] in ".?!" and len(" ".join(cur)) > limit * 0.5:
            out.append(" ".join(cur)); cur = []
    if cur: out.append(" ".join(cur))
    return out

TOPCAPS = {"c1", "e3"}
caps = []
for cid, c in D["chunks"].items():
    ls = lines_of(c["text"]); tot = sum(len(x) for x in ls); acc = 0
    for i, line in enumerate(ls):
        t0 = c["start"] + (c["end"] - c["start"]) * acc / tot; acc += len(line); t1 = c["start"] + (c["end"] - c["start"]) * acc / tot
        last = i == len(ls) - 1
        s = round(t0 - 0.1, 3); d = round((t1 + (0.5 if last else 0.2)) - s, 3)
        words = "".join('<span class="cw">%s</span>' % html.escape(w) for w in line.split())
        caps.append(f'<div class="cap clip{" top" if cid in TOPCAPS else ""}" data-t0="{t0:.3f}" data-t1="{t1:.3f}" data-last="{1 if last else 0}" data-start="{s}" data-duration="{d}"><div class="box">{words}</div></div>')
data = dict(D, title=TITLE, api=dict(id=api["id"], status=api["status"], amount=api["amount"], currency=api["currency"], checkout_url=api["checkout_url"], deposit=api["networks"][0]["deposit_address"]))
steps = "".join(f'<div class="sp"><b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></b>{n}</div>' for n in ["Detected", "Verified", "Final", "Swept", "In vault"])
out = tpl.replace("{{STEPS}}", steps).replace("{{TOTAL}}", str(D["total"])).replace("{{VIDEOS}}", "\n      ".join(videos)).replace("{{CARDS}}", "\n      ".join(cards)).replace("{{CAPTIONS}}", "\n".join(caps))
out = out.replace("{{term.start}}", str(B["term"]["start"])).replace("{{term.dur}}", str(B["term"]["dur"])).replace("{{end.start}}", str(B["end"]["start"])).replace("{{end.dur}}", str(round(D["total"] - B["end"]["start"], 3)))
out = out.replace("/*DATA*/null", json.dumps(data))
co = os.path.join(ROOT, "tools/callouts.js")
out = out.replace("/*CALLOUTS*/", open(co).read() if os.path.exists(co) else "")
open(os.path.join(ROOT, "index.html"), "w").write(out)
print("ok", D["total"])
