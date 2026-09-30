#!/usr/bin/env python3
"""
Cheap skill routers (stand-ins for the video's Jev / Liar decision models) and
an evaluation that mirrors the video: does the actually-loaded skill land in the
router's top-1 / top-3 / top-10, plus MRR and AUROC.

Routers
  bm25          lexical, zero-shot          (rank_bm25 over name+description)
  embed         static embeddings, zero-shot (model2vec cosine, query vs skill doc)
  knn           learns from routing history  (nearest past queries vote for skills)
  ensemble      knn + embed + usage prior    (the "fine-tuned" analog)

All routers rank the SAME catalog. History routers see only the TRAIN split
(older turns); everything is scored on the SAME chronological TEST split so the
comparison is apples-to-apples. Slash tokens that match a skill name are stripped
from the query so a literal "/code-review" can't be a free hit.
"""
import json, os, re, math
import numpy as np
from collections import Counter, defaultdict
from rank_bm25 import BM25Okapi

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data")
RES  = os.path.join(HERE, "..", "results")
TEST_FRAC = 0.35          # most-recent 35% of turns = test
KNN_K     = 15

def load(n): return json.load(open(os.path.join(DATA, n)))

catalog   = load("catalog.json")
events    = load("events.json")
negatives = load("negatives.json")

names = [c["name"] for c in catalog]
idx   = {n: i for i, n in enumerate(names)}
N     = len(names)
skill_docs = [f'{c["name"]}. {c["name"]}. {c.get("description","")}' for c in catalog]

tok = lambda s: re.findall(r"[a-z0-9]+", (s or "").lower())

def strip_slash(text):
    # remove "/skillname" tokens that match a catalog skill so they aren't free hits
    def repl(m):
        return " " if m.group(1).lower() in idx or m.group(1).lower().split(":")[-1] in \
            {n.split(":")[-1] for n in names} else m.group(0)
    return re.sub(r"/([a-z0-9][a-z0-9:_-]+)", repl, text)

for e in events:
    e["q"] = strip_slash(e["text"])

# ---------------------------------------------------- chronological split ---
ev_sorted = sorted(events, key=lambda e: e["ts"] or "")
cut = int(len(ev_sorted) * (1 - TEST_FRAC))
cutoff_ts = ev_sorted[cut]["ts"]
train = [e for e in ev_sorted if (e["ts"] or "") < cutoff_ts]
test  = [e for e in ev_sorted if (e["ts"] or "") >= cutoff_ts]

# ------------------------------------------------------------- embeddings ---
from model2vec import StaticModel
model = StaticModel.from_pretrained("minishlab/potion-base-8M")
def embed(texts):
    v = np.asarray(model.encode(list(texts)), dtype=np.float32)
    v /= (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
    return v

skill_emb = embed(skill_docs)                       # [N, d]
train_q_emb = embed([e["q"] for e in train]) if train else np.zeros((0, skill_emb.shape[1]), np.float32)
train_lab   = [e["skill"] for e in train]

# usage prior (log frequency in train) -- "skills the agent really leans on"
prior = np.zeros(N)
for s, c in Counter(train_lab).items():
    if s in idx:
        prior[idx[s]] = math.log1p(c)
prior = prior / (prior.max() + 1e-9)

# per-skill usage centroid from training queries (blended into knn fallback)
cent = skill_emb.copy()
for s in set(train_lab):
    if s in idx:
        rows = [train_q_emb[i] for i, l in enumerate(train_lab) if l == s]
        m = np.mean(rows, axis=0)
        cent[idx[s]] = 0.5 * cent[idx[s]] + 0.5 * (m / (np.linalg.norm(m) + 1e-9))

# --------------------------------------------------------------- routers ---
bm25 = BM25Okapi([tok(d) for d in skill_docs])

def score_bm25(q, qv):
    s = np.asarray(bm25.get_scores(tok(q)), float)
    return s

def score_embed(q, qv):
    return skill_emb @ qv

def score_knn(q, qv):
    if len(train_q_emb) == 0:
        return cent @ qv
    sims = train_q_emb @ qv                          # sim to every past query
    order = np.argsort(-sims)[:KNN_K]
    s = np.zeros(N)
    for i in order:
        si = max(sims[i], 0.0)
        s[idx[train_lab[i]]] += si
    # fallback so unseen skills stay rankable (small semantic signal)
    s += 0.15 * (cent @ qv)
    return s

rows_by = {}
for i, l in enumerate(train_lab):
    if l in idx:
        rows_by.setdefault(l, []).append(i)
rows_by = {s: np.array(r) for s, r in rows_by.items()}

def score_ensemble(q, qv):
    # hybrid capped (shipped in router_core): freq-neutral max-sim + desc + capped prior
    desc = skill_emb @ qv
    mx = desc.copy()
    if len(train_q_emb):
        sims = train_q_emb @ qv
        for s, r in rows_by.items():
            mx[idx[s]] = sims[r].max()
    norm = lambda a: (a - a.min()) / (np.ptp(a) + 1e-9)
    return 0.5 * norm(mx) + 0.3 * norm(desc) + 0.2 * np.minimum(prior, 0.6)

ROUTERS = {"bm25": score_bm25, "embed": score_embed,
           "knn": score_knn, "ensemble": score_ensemble}

# ----------------------------------------------------------------- eval ---
def evaluate(rows, routers):
    qv = embed([r["q"] for r in rows]) if rows else np.zeros((0, skill_emb.shape[1]))
    out = {}
    detail = defaultdict(list)
    for name, fn in routers.items():
        top1 = top3 = top10 = 0
        rr, auroc = [], []
        for r, v in zip(rows, qv):
            s = fn(r["q"], v)
            gold = idx[r["skill"]]
            order = np.argsort(-s)
            rank = int(np.where(order == gold)[0][0])   # 0-based
            top1  += rank < 1
            top3  += rank < 3
            top10 += rank < 10
            rr.append(1.0 / (rank + 1))
            auroc.append((N - 1 - rank) / (N - 1))       # P(gold ranked above random other)
            if name == "ensemble":
                detail["rows"].append({"q": r["text"][:100], "gold": r["skill"],
                                       "top5": [names[i] for i in order[:5]], "rank": rank + 1})
        n = len(rows)
        out[name] = {"top1": top1/n, "top3": top3/n, "top10": top10/n,
                     "mrr": float(np.mean(rr)), "auroc": float(np.mean(auroc)), "n": n}
    return out, detail

def show(title, res):
    print(f"\n{title}")
    print(f"  {'router':10s} {'top1':>6} {'top3':>6} {'top10':>6} {'MRR':>6} {'AUROC':>6}")
    for name, m in res.items():
        print(f"  {name:10s} {m['top1']*100:5.0f}% {m['top3']*100:5.0f}% "
              f"{m['top10']*100:5.0f}% {m['mrr']:6.2f} {m['auroc']:6.3f}")

print(f"catalog={N} skills | train={len(train)} | test={len(test)} "
      f"(cutoff {cutoff_ts[:10]}) | test NL-only={sum(not e['user_invoked'] for e in test)}")

res_all, detail = evaluate(test, ROUTERS)
show("TEST (all positives, top-k contains the loaded skill)", res_all)

test_nl = [e for e in test if not e["user_invoked"]]
res_nl, _ = evaluate(test_nl, ROUTERS)
show("TEST (NL-only: user did NOT type the slash command)", res_nl)

# substantive task requests only: a real ask, not a 2-word continuation deep in
# an agent run (those auto-load pair sub-skills no message could predict)
test_sub = [e for e in test if len(e["text"]) >= 30]
res_sub, _ = evaluate(test_sub, ROUTERS)
show(f"TEST (substantive requests only, >=30 chars, n={len(test_sub)})", res_sub)

# zero-shot routers on ALL 196 (no split needed) for a max-data view
res_full, _ = evaluate(events, {"bm25": score_bm25, "embed": score_embed})
show("ALL 196 positives (zero-shot routers only)", res_full)

# ------------------------------------------------- load-nothing analysis ---
# can the top-1 score tell "should load a skill" from "should not"?
import random
random.seed(0)
neg_sample = random.sample(negatives, min(400, len(negatives)))
for r in neg_sample: r["q"] = strip_slash(r["text"])
def top_scores(rows):
    if not rows: return np.array([])
    qv = embed([r["q"] for r in rows])
    return np.array([score_ensemble(r["q"], v).max() for r, v in zip(rows, qv)])
pos_top = top_scores(test)
neg_top = top_scores(neg_sample)
# ROC-AUC of the load/skip decision from the top-1 score (rank-based, no sklearn)
def roc_auc(pos, neg):
    allv = np.concatenate([pos, neg]); order = allv.argsort()
    ranks = np.empty_like(order, float); ranks[order] = np.arange(len(allv))
    r_pos = ranks[:len(pos)].sum()
    return float((r_pos - len(pos)*(len(pos)-1)/2) / (len(pos)*len(neg)))
gate = {"pos_mean": float(pos_top.mean()), "neg_mean": float(neg_top.mean()),
        "gate_auc": roc_auc(pos_top, neg_top),
        "base_rate_load": len(events) / (len(events) + len(negatives)),
        "always_skip_acc": len(negatives) / (len(events) + len(negatives))}
print(f"\nLOAD-vs-SKIP gate (can the score decide WHETHER to load a skill?):"
      f"\n  pos_mean={gate['pos_mean']:.3f}  neg_mean={gate['neg_mean']:.3f}  "
      f"gate ROC-AUC={gate['gate_auc']:.3f} (0.5=useless)"
      f"\n  base rate of loading={gate['base_rate_load']*100:.1f}%  "
      f"=> 'always skip' already {gate['always_skip_acc']*100:.1f}% accurate")

# a few concrete test examples (successes + misses) for the writeup
ex_qv = embed([r["q"] for r in test])
examples = []
for r, v in zip(test, ex_qv):
    order = np.argsort(-score_ensemble(r["q"], v))
    rank = int(np.where(order == idx[r["skill"]])[0][0]) + 1
    examples.append({"q": r["text"][:120], "gold": r["skill"], "rank": rank,
                     "top3": [names[i] for i in order[:3]]})
examples.sort(key=lambda x: x["rank"])
json.dump({"hits": examples[:8], "misses": examples[-8:]},
          open(os.path.join(RES, "examples.json"), "w"), indent=2)

os.makedirs(RES, exist_ok=True)
json.dump({"config": {"catalog": N, "train": len(train), "test": len(test),
                      "cutoff_ts": cutoff_ts, "knn_k": KNN_K, "test_frac": TEST_FRAC},
           "test_all": res_all, "test_nl_only": res_nl,
           "test_substantive": res_sub, "all196_zeroshot": res_full,
           "gate": gate},
          open(os.path.join(RES, "metrics.json"), "w"), indent=2)
json.dump(detail["rows"], open(os.path.join(RES, "test_detail.json"), "w"), indent=2)
print("\nwrote results/metrics.json and results/test_detail.json")
