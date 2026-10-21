#!/usr/bin/env bash
# Create a git worktree for a branch, handling all three "where does the branch
# live" cases, then copy the repo's gitignored .env files into the new tree.
#
# Usage:
#   mkworktree.sh <branch> [--repo <path>] [--base <ref>] [--dir <path>]
#
#   <branch>        Branch to check out in the new worktree (required).
#   --repo <path>   Repo to branch from. Default: the git repo you're standing in.
#   --base <ref>    Start point for a brand-new branch. Default: auto-detected
#                   (origin/dev → origin/main → origin/master → origin HEAD).
#   --dir  <path>   Where to put the worktree. Default: inside the directory this
#                   script was launched from, named <repo-basename>-<branch>
#                   (branch slashes become dashes).
#
# The last line of stdout is always `WORKTREE=<absolute path>` so the caller can
# capture where to cd. Everything else is human-readable progress on stderr.
set -euo pipefail

say() { printf '%s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Captured up front so the worktree lands where the script was launched,
# independent of --repo (which may point elsewhere).
launch_dir="$(pwd)"

branch=""
repo=""
base=""
dir=""

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="${2:-}"; shift 2 ;;
    --base) base="${2:-}"; shift 2 ;;
    --dir)  dir="${2:-}";  shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    -*) die "unknown flag: $1" ;;
    *)
      [ -z "$branch" ] || die "unexpected extra argument: $1"
      branch="$1"; shift ;;
  esac
done

[ -n "$branch" ] || die "no branch given. Usage: mkworktree.sh <branch> [--repo <path>] [--base <ref>]"

# Resolve the repo to its top-level directory so relative "-C ." invocations work
# no matter which subdirectory the caller is standing in.
repo="${repo:-.}"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository: $repo"
repo="$(git -C "$repo" rev-parse --show-toplevel)"
repo_name="$(basename "$repo")"

has_origin=false
git -C "$repo" remote get-url origin >/dev/null 2>&1 && has_origin=true

# Default worktree location: inside the directory this script was launched from,
# named <repo>-<branch> with any slashes in the branch flattened to dashes so the
# path stays one level deep.
if [ -z "$dir" ]; then
  safe_branch="${branch//\//-}"
  dir="${launch_dir}/${repo_name}-${safe_branch}"
fi
[ ! -e "$dir" ] || die "target already exists: $dir"

branch_exists_local() { git -C "$repo" show-ref --verify --quiet "refs/heads/$1"; }
branch_exists_remote() { git -C "$repo" show-ref --verify --quiet "refs/remotes/origin/$1"; }

# Pick a start point for a brand-new branch when the caller didn't name one.
detect_base() {
  local ref
  for ref in origin/dev origin/main origin/master; do
    if git -C "$repo" show-ref --verify --quiet "refs/remotes/$ref"; then
      printf '%s' "$ref"; return
    fi
  done
  # Fall back to whatever origin points HEAD at.
  if git -C "$repo" symbolic-ref -q refs/remotes/origin/HEAD >/dev/null 2>&1; then
    git -C "$repo" symbolic-ref --short refs/remotes/origin/HEAD; return
  fi
  return 1
}

case_used=""
if branch_exists_local "$branch"; then
  # Case 1 — branch already exists locally. Attach a worktree to it as-is.
  case_used="local branch '$branch'"
  say "→ $case_used exists; adding worktree at $dir"
  git -C "$repo" worktree add "$dir" "$branch"
else
  # Need remote knowledge for cases 2 and 3 — refresh it.
  if $has_origin; then
    say "→ fetching origin…"
    git -C "$repo" fetch origin
  fi

  if $has_origin && branch_exists_remote "$branch"; then
    # Case 2 — branch is on origin but not local yet. Create a local tracking branch.
    case_used="remote branch 'origin/$branch'"
    say "→ $case_used exists; creating tracking branch + worktree at $dir"
    git -C "$repo" worktree add --track -b "$branch" "$dir" "origin/$branch"
  else
    # Case 3 — brand-new branch. Cut it from the base.
    if [ -z "$base" ]; then
      base="$(detect_base)" || die "could not auto-detect a base branch; pass --base <ref> (e.g. origin/dev)"
    fi
    case_used="new branch '$branch' from $base"
    say "→ no such branch anywhere; creating $case_used, worktree at $dir"
    git -C "$repo" worktree add -b "$branch" "$dir" "$base"
  fi
fi

# Copy gitignored env files (.env, .env.local, .env.*) from the repo root into the
# worktree. A worktree already carries every *tracked* file, so tracked templates
# like .env.example need no copy — only the ignored, secret-bearing ones do.
copied=0
shopt -s nullglob dotglob 2>/dev/null || true
for f in "$repo"/.env "$repo"/.env.*; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  if git -C "$repo" check-ignore -q "$name"; then
    cp "$f" "$dir/$name"
    say "→ copied $name"
    copied=$((copied + 1))
  fi
done
[ "$copied" -eq 0 ] && say "→ no gitignored env files to copy"

# Copy gitignored personal ".local." files (AGENTS.local.md, CONTEXT.local.md,
# a personal script, a compose override — any path with a `.local.` infix) from
# the source tree into the worktree. Like env files, these hold one developer's
# own stuff, are gitignored, and so aren't carried by a fresh worktree.
# `ls-files -o -i --exclude-standard` reports exactly the ignored, untracked
# paths — at any depth, honouring .gitignore and .git/info/exclude alike — so
# the "only if ignored" guarantee still holds and nothing untracked leaks in.
#
# Skip anything under a dot-directory (.claude/, .git/, .venv/, .cursor/, a
# vendored node_modules/**/.claude/, …): that's tool-managed per-checkout
# state like `.claude/settings.local.json`, not a developer's own source file,
# and copying it would carry one checkout's tool state into a different one
# rather than a personal file meant to follow the developer across worktrees.
local_copied=0
while IFS= read -r -d '' rel; do
  src="$repo/$rel"
  [ -f "$src" ] || continue
  dirpart="$(dirname "$rel")"
  if [ "$dirpart" != "." ]; then
    case "/$dirpart/" in
      */.*) continue ;;
    esac
  fi
  mkdir -p "$dir/$dirpart"
  cp "$src" "$dir/$rel"
  say "→ copied $rel"
  local_copied=$((local_copied + 1))
done < <(git -C "$repo" ls-files -o -i --exclude-standard -z -- '*.local.*' 2>/dev/null)
[ "$local_copied" -eq 0 ] && say "→ no gitignored .local.* files to copy"

say ""
say "Done — $case_used"
say "Worktree ready at: $dir"
printf 'WORKTREE=%s\n' "$dir"
