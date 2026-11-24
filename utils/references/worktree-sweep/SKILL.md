---
name: worktree-sweep
description: >
  Audit every git worktree under a directory and prune the ones that are done: report which have
  open PRs, merged or closed PRs, commits on no origin branch, uncommitted work, or running
  containers; push or commit-and-push what would be lost; then remove the rest. Use for "sweep my
  worktrees", "are all my worktrees pushed", "delete worktrees except the ones with PRs", or
  "clean up V1".
---

# Worktree sweep

Bring a folder of worktrees down to the ones still in use, without losing work. The audit is
read-only; every push, commit, and removal follows the user's go for that step.

The script is [`scripts/sweep.py`](scripts/sweep.py) (Python 3, needs `git`, `gh`, and `docker`).
For Signal Lift, the repo is `~/Documents/Signal-lift-Dev/V1/signal-lift-dev` and the root is `V1/`.

## Step 1 — Audit

```bash
python3 <module-dir>/scripts/sweep.py audit --repo <main checkout> [--root <dir>] [--keep NAME ...]
```

It fetches with `--prune`, then prints one row per worktree and a verdict:

| Verdict | Meaning |
|---|---|
| `keep` | the main checkout, or a name passed in `--keep` |
| `keep (open PR)` | the branch has an open or draft PR |
| `blocked: running containers` | a running container's compose dir is inside the worktree |
| `blocked: unpushed commits` | commits reachable from no origin ref, after rebased copies are set aside |
| `blocked: uncommitted work` | changed or untracked files, apart from tool state such as `.codex/hooks` |
| `safe to remove` | nothing would be lost |

Report the counts and the blocked rows. Lead with what would be lost, by worktree and file names.
"Merged" means a PR on that branch merged. A branch with no remote copy and no unique commits was
usually merged and auto-deleted; say so only when its PR row shows the merge.

## Step 2 — Save what would be lost (only on the user's go)

- **Unpushed commits:** `git push -u origin <branch>`, never with force. When a local branch and its
  origin copy have diverged, show both sides and ask; a "rebased copies" count means the local
  commits already exist upstream, and pushing them would need a force-push over newer work.
- **Uncommitted work:** read `git status` and `git diff --stat` for each one first. Scan the diff and
  untracked files for secrets and customer data, and leave out anything suspect. Commit with a
  message that names what the files do, add the session's attribution line, and push. A branch
  that belongs to a teammate, or whose PR already merged or closed, gets the commit too, but say so
  in the report.
- Re-run the audit to show that those rows are now `safe to remove`.

## Step 3 — Remove (only on the user's go)

```bash
python3 <module-dir>/scripts/sweep.py remove --repo <main checkout> [--allow-noise] NAME ...
```

`remove` re-checks each worktree and refuses one that has uncommitted work, commits on no origin
branch, or running containers. Before removing a worktree, it runs the worktree's own
`worktree-down.local.sh --volumes` to clear any leftover dev-stack volumes. It removes the worktree
folder only, so the branch survives and the worktree can be recreated. Deleting a large data copy is
slow, so run any batch of more than about 20 in the background. Never remove a worktree with running
containers unless the user names that stack; recreating a stack can lose its state.

End with the remaining worktrees and anything you skipped and why.
