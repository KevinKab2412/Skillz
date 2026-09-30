#!/usr/bin/env python3
"""
A/B the ensemble against a frequency-debiased variant. The live daemon showed
worktree/code-review (40% of history) swamping tail queries. Fix candidate:
score each skill by its BEST-matching historical example (max-sim per class,
not summed votes) so a 2-example skill competes with a 40-example one, blended
with description similarity for cold-start skills. Must hold top-k on the test
split while fixing the diverse probes.
"""
import json, os, re, math
import numpy as np
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "..", "data")
cat = json.load(open(os.path.join(DATA, "catalog.json")))
ev  = json.load(open(os.path.join(DATA, "events.json")))
names = [c["name"] for c in cat]; idx = {n: i for i, n in enumerate(names)}; N = len(names)
tails = {n.split(":")[-1] for n in names}
docs = [f'{c["name"]}. {c["name"]}. {c.get("description","")}' for c in cat]

from model2vec import StaticModel
model = StaticModel.from_pretrained("minishlab/potion-base-8M")
def emb(t):
    v = np.asarray(model.encode(list(t)), np.float32); v /= (np.linalg.norm(v,axis=1,keepdims=True)+1e-9); return v
def strip(text):
    return re.sub(r"/([a-z0-9][a-z0-9:_-]+)",
                  lambda m: " " if (m.group(1).lower() in idx or m.group(1).lower().split(":")[-1] in tails) else m.group(0), text)

skill_emb = emb(docs)
for e in ev: e["q"] = strip(e["text"])
ev_sorted = sorted(ev, key=lambda e: e["ts"] or "")
cut = int(len(ev_sorted)*0.65); cutoff = ev_sorted[cut]["ts"]
train = [e for e in ev_sorted if (e["ts"] or "") < cutoff]
test  = [e for e in ev_sorted if (e["ts"] or "") >= cutoff]
tr_emb = emb([e["q"] for e in train]); tr_lab = [e["skill"] for e in train]
prior = np.zeros(N)
for s,c in Counter(tr_lab).items():
    if s in idx: prior[idx[s]] = math.log1p(c)
prior /= (prior.max()+1e-9)
# rows per skill for max-sim
rows_by = {s: np.array([i for i,l in enumerate(tr_lab) if l==s]) for s in set(tr_lab)}
norm = lambda a:(a-a.min())/(np.ptp(a)+1e-9)

def old_ensemble(qv):
    e = skill_emb@qv; sims = tr_emb@qv; order=np.argsort(-sims)[:15]; k=np.zeros(N)
    for i in order: k[idx[tr_lab[i]]]+=max(sims[i],0.)
    k += 0.15*(skill_emb@qv)
    return 0.6*norm(k)+0.3*norm(e)+0.1*prior

def _mx(qv):
    sims = tr_emb@qv; e = skill_emb@qv
    mx = np.full(N, -1.0)
    for s,r in rows_by.items():
        if s in idx: mx[idx[s]] = sims[r].max()
    mx[mx<0] = e[mx<0]
    return mx, e

def maxsim(qv):
    mx,e = _mx(qv); return 0.6*norm(mx)+0.4*norm(e)

def hybrid(qv):
    # max-sim (freq-neutral) + description + a CAPPED prior so frequent skills
    # get a nudge, not a landslide
    mx,e = _mx(qv)
    return 0.5*norm(mx)+0.3*norm(e)+0.2*np.minimum(prior,0.6)

def blend(qv):
    return 0.5*old_ensemble(qv)+0.5*maxsim(qv)

def topk(rows, fn):
    if not rows: return (0,0,0,0)
    qv = emb([r["q"] for r in rows]); t1=t3=t10=0; rr=[]
    for r,v in zip(rows,qv):
        o=np.argsort(-fn(v)); rank=int(np.where(o==idx[r["skill"]])[0][0])
        t1+=rank<1; t3+=rank<3; t10+=rank<10; rr.append(1/(rank+1))
    n=len(rows); return (t1/n,t3/n,t10/n,float(np.mean(rr)))

print(f"test n={len(test)}  (train {len(train)})")
variants = [("old ensemble",old_ensemble),("maxsim debiased",maxsim),
            ("hybrid capped",hybrid),("50/50 blend",blend)]
for nm,fn in variants:
    t1,t3,t10,mrr = topk(test,fn)
    print(f"  {nm:16s} top1 {t1*100:4.0f}%  top3 {t3*100:4.0f}%  top10 {t10*100:4.0f}%  MRR {mrr:.2f}")

probes = ["can you review my changes before I merge this branch",
          "make me a standup update from this week",
          "let's nail down the design before we build this",
          "help me actually understand what this diff does",
          "research the best way to do rate limiting"]
print("\ndiverse probes (top-5): old  vs  maxsim")
for p in probes:
    v = emb([strip(p)])[0]
    print(f"\n  {p!r}")
    for nm,fn in [("old",old_ensemble),("hybrid",hybrid)]:
        print(f"    {nm:7s}: {[names[i] for i in np.argsort(-fn(v))[:5]]}")
