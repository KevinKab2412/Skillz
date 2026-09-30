#!/usr/bin/env python3
"""
Shared router used by the daemon and CLI. Trains the winning ensemble
(kNN over routing history + static-embedding similarity + usage prior) on ALL
available ground truth and exposes rank(query) -> ranked [(skill, score)].

Build cost (model load + index) is paid once at import/construction; a warm
rank() is just one small encode + a couple of matmuls.
"""
import json, os, re, math
import numpy as np
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
KNN_K = 15


class Router:
    def __init__(self, model_name="minishlab/potion-base-8M"):
        from model2vec import StaticModel
        self.model = StaticModel.from_pretrained(model_name)
        cat = json.load(open(os.path.join(DATA, "catalog.json")))
        ev  = json.load(open(os.path.join(DATA, "events.json")))
        self.names = [c["name"] for c in cat]
        self.idx   = {n: i for i, n in enumerate(self.names)}
        self.N     = len(self.names)
        self._skill_tails = {n.split(":")[-1] for n in self.names}
        docs = [f'{c["name"]}. {c["name"]}. {c.get("description","")}' for c in cat]
        self.skill_emb = self._embed(docs)

        # train on ALL history (production: no held-out split)
        q = [self._strip_slash(e["text"]) for e in ev]
        self.train_emb = self._embed(q) if q else np.zeros((0, self.skill_emb.shape[1]), np.float32)
        self.train_lab = [e["skill"] for e in ev]

        self.prior = np.zeros(self.N)
        for s, c in Counter(self.train_lab).items():
            if s in self.idx:
                self.prior[self.idx[s]] = math.log1p(c)
        self.prior /= (self.prior.max() + 1e-9)

        # training-row indices per skill, for frequency-neutral max-sim scoring
        self.rows_by = {}
        for i, l in enumerate(self.train_lab):
            if l in self.idx:
                self.rows_by.setdefault(l, []).append(i)
        self.rows_by = {s: np.array(r) for s, r in self.rows_by.items()}
        self.n_train = len(q)

    # -- helpers --
    def _embed(self, texts):
        v = np.asarray(self.model.encode(list(texts)), dtype=np.float32)
        v /= (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
        return v

    def _strip_slash(self, text):
        def repl(m):
            t = m.group(1).lower()
            return " " if (t in self.idx or t.split(":")[-1] in self._skill_tails) else m.group(0)
        return re.sub(r"/([a-z0-9][a-z0-9:_-]+)", repl, text)

    # -- scoring: hybrid capped (freq-neutral max-sim + description + capped prior)
    #    beat the summed-kNN ensemble on top-3/top-10/MRR AND fixed tail queries.
    def _score(self, qv):
        desc = self.skill_emb @ qv
        mx = desc.copy()                          # cold-start skills fall back to description
        if len(self.train_emb):
            sims = self.train_emb @ qv
            for s, r in self.rows_by.items():
                mx[self.idx[s]] = sims[r].max()   # each skill judged by its BEST match, not vote count
        norm = lambda a: (a - a.min()) / (np.ptp(a) + 1e-9)
        return 0.5 * norm(mx) + 0.3 * norm(desc) + 0.2 * np.minimum(self.prior, 0.6)

    def rank(self, query, k=10):
        qv = self._embed([self._strip_slash(query or "")])[0]
        s = self._score(qv)
        order = np.argsort(-s)[:k]
        return [{"skill": self.names[i], "score": round(float(s[i]), 4)} for i in order]


if __name__ == "__main__":
    import sys, time
    t = time.time(); r = Router(); build = time.time() - t
    q = " ".join(sys.argv[1:]) or "can you review this branch before I merge it"
    t = time.time(); out = r.rank(q); warm = (time.time() - t) * 1000
    print(f"built in {build:.2f}s on {r.n_train} history turns / {r.N} skills; warm rank {warm:.1f} ms\n")
    print(f"query: {q}\n")
    for i, o in enumerate(out, 1):
        print(f"  {i:2d}. {o['skill']:32s} {o['score']:.3f}")
