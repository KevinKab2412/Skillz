#!/usr/bin/env bash
# List every standards file that applies to a code repo, from the planning clone and from the
# code repo itself. Prints "none found" per source rather than staying silent.
#
# Usage: resolve-standards.sh [--repo <code-repo-path>] [--ref <git-ref>]
#   --repo  code repo to resolve for (default: current directory)
#   --ref   read the code repo's own docs at this ref (e.g. a review's base) instead of the
#           working tree; matches are printed as git:<ref>:<path> for `git show`
#
# Exit 0 when the planning clone was read, 2 when it is missing (code-repo docs still listed).
set -u

PLANNING_DIR="${PLANNING_DIR:-$HOME/Documents/planning}"
PLANNING_REPO="KevinKab2412/planning"
repo="."
ref=""

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --ref) ref="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

top="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)" || { echo "not a git repo: $repo" >&2; exit 64; }

# Repo key: <owner>-<repo> from origin, lowercased; local-<dirname> when there is no origin.
origin="$(git -C "$top" remote get-url origin 2>/dev/null || true)"
if [ -n "$origin" ]; then
  slug="$(printf '%s' "$origin" | sed -E 's#\.git$##; s#^.*[:/]([^/]+)/([^/]+)$#\1-\2#')"
else
  # A worktree's toplevel is its own folder, so name it after the main checkout instead.
  common="$(git -C "$top" rev-parse --path-format=absolute --git-common-dir)"
  slug="local-$(basename "$(dirname "$common")")"
fi
key="$(printf '%s' "$slug" | tr '[:upper:]' '[:lower:]')"

echo "PLANNING_DIR=$PLANNING_DIR"
echo "REPO_KEY=$key"

list_dir() {
  local label="$1" dir="$2" found
  echo "== $label =="
  found="$(find "$dir" -type f -name '*.md' ! -name 'README.md' 2>/dev/null | sort)"
  if [ -n "$found" ]; then printf '%s\n' "$found"; else echo "none found"; fi
}

status=0
if [ -d "$PLANNING_DIR/.git" ]; then
  if git -C "$PLANNING_DIR" remote get-url origin >/dev/null 2>&1 &&
     ! git -C "$PLANNING_DIR" pull --ff-only -q 2>/dev/null; then
    echo "WARN: could not pull $PLANNING_DIR; reading the local copy"
  fi
  list_dir "planning: _global/standards" "$PLANNING_DIR/_global/standards"
  list_dir "planning: $key/standards" "$PLANNING_DIR/$key/standards"
else
  echo "== planning =="
  echo "MISSING: no clone at $PLANNING_DIR. Run: gh repo clone $PLANNING_REPO $PLANNING_DIR"
  status=2
fi

# The code repo's own (team) standards. design-patterns/patterns.md is the legacy in-repo location.
echo "== code repo: $top${ref:+ @ $ref} =="
candidates=(CODING_STANDARDS.md CONTRIBUTING.md design-patterns/patterns.md)
any=""
if [ -n "$ref" ]; then
  for c in "${candidates[@]}"; do
    git -C "$top" cat-file -e "$ref:$c" 2>/dev/null && { echo "git:$ref:$c"; any=1; }
  done
  while IFS= read -r p; do
    [ -n "$p" ] && { echo "git:$ref:$p"; any=1; }
  done < <(git -C "$top" ls-tree -r --name-only "$ref" -- docs 2>/dev/null | grep -E '^docs/standards' || true)
else
  for c in "${candidates[@]}"; do
    [ -f "$top/$c" ] && { echo "$top/$c"; any=1; }
  done
  for p in "$top"/docs/standards*; do
    [ -e "$p" ] && { echo "$p"; any=1; }
  done
fi
[ -z "$any" ] && echo "none found"

exit $status
