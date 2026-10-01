---
name: worktree
description: >
  Spin up a local git worktree for a branch in one step, then drop into it ready to work. Given a
  source repo and a branch name, it figures out where that branch lives — already local, only on
  origin, or not yet existing — and runs the right `git worktree add` for that case: attach to the
  local branch, create a tracking branch from origin, or cut a brand-new branch from a base (default
  origin/dev). The worktree lands in the directory the skill was launched from, named
  <repo>-<branch>, the repo's gitignored .env and personal `.local.*` files (e.g. AGENTS.local.md,
  a personal script, a compose override) are copied in, and the agent cd's into it so work can begin
  immediately. Use whenever the user wants a worktree for a branch — "make a worktree
  for feature-x", "spin up a worktree on my-branch", "check out that branch in a worktree", "give me
  a separate working copy of <branch>", "worktree this branch so I can work on it", "/worktree
  <branch>" — or when parallel work on another branch is needed without disturbing the current
  checkout. Trigger even if the user doesn't say "worktree" but clearly wants a fresh working copy
  of a branch to work in.
---

# worktree

Create a git worktree for a branch and start working in it — without the caller having to remember
which of the three `git worktree add` incantations applies.

A branch can be in one of three states, and each needs a different command:

1. **Local branch already exists** → attach a worktree to it:
   `git worktree add <launch-dir>/<repo>-<branch> <branch>`
2. **Branch is on origin but not local yet** → fetch, then create a local tracking branch:
   `git worktree add --track -b <branch> <launch-dir>/<repo>-<branch> origin/<branch>`
3. **Branch doesn't exist anywhere** → fetch, then cut it from a base (e.g. origin/dev):
   `git worktree add -b <branch> <launch-dir>/<repo>-<branch> origin/dev`

The worktree always lands **inside the directory the skill was launched from**, in a folder named
`<repo>-<branch>`. Then two kinds of gitignored file are copied into the new tree, because a worktree
already carries every *tracked* file and needs only the ignored ones:

- the repo's `.env` files (secret-bearing; tracked templates like `.env.example` are already there);
- personal `.local.*` files — `AGENTS.local.md`/`CONTEXT.local.md` instructions, but also a personal
  script, a compose override, anything one developer keeps gitignored rather than committed — which
  don't come across with a fresh worktree on their own.

Both copies are guarded by git's own ignore check, so only files the repo actually ignores are
copied and nothing untracked leaks into the new tree. The `.local.*` copy additionally skips anything
under a dot-directory (`.claude/`, `.git/`, a vendored `node_modules/**/.claude/`, …) — that's a tool's
own per-checkout state (e.g. `.claude/settings.local.json`), not a developer's personal file, and
copying it would leak one checkout's tool state into another rather than carry a personal file across
worktrees the way it's meant to.

`scripts/mkworktree.sh` does the state detection and all three cases so you don't have to branch by
hand. **Your job is to run it, then `cd` into the worktree it created** — the script runs in a
subprocess and cannot change your shell's directory, so that last step is yours.

## Steps

1. **Get the source repo and the branch.** Both are required. Ask the user for whichever they
   didn't give:
   - **Source repo** — the git repo to branch from (a path). This need not be the directory you're
     standing in; the worktree is created next to where the skill was launched, not next to the repo.
   - **Branch** — the branch name to check out in the new worktree.

2. **Run the script from the launch directory**, passing the source repo with `--repo`:

   ```bash
   bash <skill-dir>/scripts/mkworktree.sh <branch> --repo <source-repo-path>
   ```

   The worktree defaults to `<launch-dir>/<repo>-<branch>` — i.e. the current directory the skill
   was launched in. Do not `cd` into the repo first; run from where you started so the worktree
   lands there.

   Other overrides (optional):
   - `--base <ref>` — start point for a brand-new branch (case 3). Defaults to the first that
     exists: `origin/dev`, `origin/main`, `origin/master`, then origin's HEAD. Pass this if the user
     wants a new branch off something specific.
   - `--dir <path>` — override the worktree location entirely. Only needed if the user wants it
     somewhere other than the launch directory.

   The script prints human-readable progress and, as its **last line**, `WORKTREE=<absolute path>`.

3. **`cd` into the new worktree** so work continues there:

   ```bash
   cd "<the path from the WORKTREE= line>"
   ```

   Confirm you're in it (`pwd`), then you're ready — subsequent commands run inside the worktree.

4. **Report** to the user in one line: which case fired (existing local branch / tracking branch from
   origin / new branch from `<base>`), the worktree path, and which env and `.local.*` files were copied.

## Notes

- **Failures are surfaced, not swallowed.** If the target directory already exists, the branch is
  already checked out in another worktree, or there's no base to cut from, the script stops with a
  clear message. Relay it — don't retry blindly.
- **No `origin` remote?** The script skips the fetch and treats the branch as local-or-new.
- **Cleaning up later.** Before `git worktree remove <path>`, check the worktree root for a
  `.worktree-stack.local.env` file — the sign the repo gives each worktree its own throwaway dev stack
  (database, dev server, etc.) rather than sharing one. If it's there, tear that stack down first
  (e.g. in signal-lift-dev: `./worktree-down.local.sh --volumes` from
  `deploy/dockers/local-dev/` in that worktree) so its containers and volumes don't get orphaned once
  the directory that named them is gone. Then `git worktree remove <path>` (add `--force` if it's
  dirty). No `.worktree-stack.local.env` → plain `git worktree remove` is all there is to do.
