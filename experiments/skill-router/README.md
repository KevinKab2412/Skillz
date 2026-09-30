# skill-router (throwaway experiment)

Can a cheap, local, no-LLM model shortlist skills so a frontier model doesn't weigh all 59 every turn?
Replicates the "Jev / Liar" video on real Claude Code session data. Gitignored — not committed.

**Verdict:** works as a *shortlist behind an existing decision*, not as a gate. History-trained scorer
hits top-3 67% / top-10 81% / AUROC 0.876 on substantive asks. It cannot decide *whether* to load a
skill (gate ROC-AUC ~0.50). See `report.html` (published artifact).

## Layout
```
src/extract.py      parse ~/.claude/projects/*.jsonl -> data/{catalog,events,negatives}.json (ground truth)
src/route.py        4 routers + time-split eval -> results/{metrics,examples,test_detail}.json
src/tune.py         A/B of scorer variants (how the frequency-bias fix was chosen)
src/router_core.py  shipped scorer (hybrid: max-sim + description + capped prior), trains on ALL history
src/routerd.py      always-warm daemon (builds once ~0.7s, serves over Unix socket ~0.3 ms/query)
src/ask.py          CLI client (falls back to in-process build if daemon is down)
.venv/              numpy, scikit-learn, rank_bm25, model2vec (potion-base-8M, 30 MB)
```

## Use
```bash
# refresh ground truth from current transcripts (run after using more skills)
python3 src/extract.py

# re-run the evaluation
./.venv/bin/python src/route.py

# start the warm daemon (leave running), then query it
./.venv/bin/python src/routerd.py &
./.venv/bin/python src/ask.py "open a draft PR for this branch"
./.venv/bin/python src/ask.py --k 3 --json "review my changes before I merge"
```

Footprint: ~130 MB RAM peak, 30 MB model + 193 MB venv on disk. No GPU, no network at query time.

## Known limits
- **No gate.** 96% of turns load nothing; the score can't separate load-vs-skip. Shortlist only.
- **Frequency leak.** worktree/code-review are 40% of history and still ride high on vague queries.
- **Small data.** 196 positives, 85% from one repo. More routing history is the main lever — re-run
  `extract.py` periodically as usage grows.
- **Cold start.** Skills never used before rank on their description alone.
