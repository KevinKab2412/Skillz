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

## Auto-start on login (macOS)
The daemon runs as a LaunchAgent from `~/.skill-router` (NOT this repo dir):
macOS TCC blocks background launchd agents from reading `~/Documents`. `deploy.sh`
copies the source there, builds a venv, regenerates data, and loads the agent.
```bash
./deploy.sh          # install/update; starts now and on every login (KeepAlive)
./deploy.sh --stop   # disable auto-start + weekly refresh (unload both agents)
launchctl list | grep skillrouter          # PIDs / last-exit status
tail -f ~/.skill-router/routerd.log        # daemon log
~/.skill-router/.venv/bin/python ~/.skill-router/src/ask.py "review my changes"
```
`ask.py` from anywhere finds the deployed daemon (or set `SKILLROUTER_SOCK`).

**Weekly self-refresh.** A second agent (`com.kevinkabeya.skillrouter.refresh`,
Mon 09:00) runs `refresh.sh`: rebuild `data/` from the latest transcripts, then
restart the daemon so it learns from new skill usage. Run `refresh.sh` by hand
anytime; log at `~/.skill-router/refresh.log`. Change the cadence by editing the
`StartCalendarInterval` block in `deploy.sh` and re-running it.

To fully remove: `./deploy.sh --stop && rm -rf ~/.skill-router ~/Library/LaunchAgents/com.kevinkabeya.skillrouter*.plist`

Footprint: ~130 MB RAM peak, 30 MB model + 193 MB venv on disk. No GPU, no network at query time.

## Known limits
- **No gate.** 96% of turns load nothing; the score can't separate load-vs-skip. Shortlist only.
- **Frequency leak.** worktree/code-review are 40% of history and still ride high on vague queries.
- **Small data.** 196 positives, 85% from one repo. More routing history is the main lever — re-run
  `extract.py` periodically as usage grows.
- **Cold start.** Skills never used before rank on their description alone.
