#!/usr/bin/env bash
# Installs all skills to ~/.agents/skills/ (the source-of-truth),
# regenerates ~/.agents/AGENTS.md and ~/.claude/CLAUDE.md (symlink) so Claude
# Code and OpenCode always reflect the current skill set,
# installs orchestrator-only instruction modules to ~/.pi/agent/instructions/,
# installs Pi extensions to ~/.pi/agent/extensions/, and symlinks skills into
# ~/.claude/skills/ and ~/.codex/skills/ so those CLIs pick them up. Tool dirs
# that don't exist on this machine are skipped silently.
#
# Override the source-of-truth location with AGENTS_HOME if needed.
set -euo pipefail

AGENTS_HOME_DIR="${AGENTS_HOME:-$HOME/.agents}"
AGENTS_DIR="$AGENTS_HOME_DIR/skills"
PI_INSTRUCTIONS_DIR="${PI_HOME:-$HOME/.pi/agent}/instructions"
PI_EXTENSIONS_DIR="${PI_HOME:-$HOME/.pi/agent}/extensions"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Repo-root home of shared, cross-skill reference modules (pedagogy, etc.). A skill
# opts into a module by listing its name in the skill's own references/.shared file;
# install then copies shared/<module>/ into that skill's references/<module>/, so the
# canonical copy lives in one place here but every installed skill stays self-contained.
SHARED_DIR="$SCRIPT_DIR/shared"
MEMORY_SOURCE="${AGENT_MEMORY_SOURCE:-$(dirname "$SCRIPT_DIR")/agent-memory}"

# Refuse before mutating any installation unless the automatic-memory release has matching evidence.
python3 - "$SCRIPT_DIR" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
release_path = root / "shared/memory/release.json"
protocol_path = root / "shared/memory/workflow-memory.md"
active_marker = "Workflow memory lifecycle (automatic)"
memory_artifacts = release_path.exists() or protocol_path.exists() or any(
    active_marker in (root / workflow / "SKILL.md").read_text()
    for workflow in ("pair", "teach")
    if (root / workflow / "SKILL.md").exists()
)
if memory_artifacts:
    sys.path.insert(0, str(root))
    from workflow_memory_release.evaluate import GateRefused, validate_install_evidence

    try:
        validate_install_evidence(root)
    except (GateRefused, KeyError, TypeError, ValueError) as error:
        raise SystemExit(f"ERROR: {error}") from error
PY

mkdir -p "$AGENTS_DIR" "$PI_INSTRUCTIONS_DIR" "$PI_EXTENSIONS_DIR"

if [ -f "$MEMORY_SOURCE/pyproject.toml" ]; then
  if ! command -v uv >/dev/null 2>&1; then
    echo "ERROR: uv is required to install agent-memory" >&2
    exit 1
  fi
  # Best-effort: memory install/registration is orthogonal to the skill sync
  # below, which is install's primary job. A recoverable failure here — most
  # often a conflicting agent-memory MCP registration in another client — must
  # warn and continue, not abort the whole install under `set -e`.
  if uv tool install --editable "$MEMORY_SOURCE" \
    && agent-memory-init \
    && agent-memory-service install \
    && agent-memory-setup; then
    echo "Agent memory: installed and registered"
  else
    echo "WARN: agent memory setup did not complete; skills still install." >&2
    echo "      Re-run it alone once resolved: agent-memory-setup" >&2
  fi
else
  echo "Agent memory: skipped (set AGENT_MEMORY_SOURCE to its checkout)"
fi

# Pull the `description:` out of a SKILL.md frontmatter block. Handles plain
# scalars, quoted scalars, and folded/literal blocks (`description: >`), which
# a naive one-line grab renders as a bare ">".
skill_description() {
  awk '
    NR == 1 && $0 !~ /^---[[:space:]]*$/ { in_fm = 1 }
    NR == 1 && $0 ~ /^---[[:space:]]*$/  { in_fm = 1; next }
    in_fm && !collecting && $0 ~ /^---[[:space:]]*$/ { exit }
    !in_fm { next }
    !collecting && $0 ~ /^description:/ {
      v = $0
      sub(/^description:[[:space:]]*/, "", v)
      # Folded (>) or literal (|) block scalar: body is on the following lines.
      if (v ~ /^[>|][0-9]*[+-]?[[:space:]]*$/) { collecting = 1; next }
      gsub(/^["\047]|["\047]$/, "", v)
      buf = v
      exit
    }
    collecting {
      # Any unindented line ends the block scalar.
      if ($0 ~ /^[^[:space:]]/) exit
      l = $0
      sub(/^[[:space:]]+/, "", l)
      sub(/[[:space:]]+$/, "", l)
      if (l == "") next
      buf = (buf == "" ? l : buf " " l)
    }
    END { print buf }
  ' "$1"
}

# Trim a description down to a listing-sized blurb: prefer the first sentence,
# and if that is still long, cut on a word boundary rather than mid-word.
summarize_description() {
  local text="$1" limit="${2:-150}" first cut
  first="${text%%. *}"
  [ "$first" != "$text" ] && first="$first."
  [ "${#first}" -le "$limit" ] && { printf '%s' "$first"; return; }
  cut="${first:0:$limit}"
  cut="${cut% *}"
  printf '%s…' "${cut%%[,;:] }"
}

# Emit the `- **`/name`** — description` bullets for every installed skill.
# Both the global AGENTS.md and the repo's own listing render from this, so the
# two cannot drift apart.
emit_skill_bullets() {
  local skill_dir sname desc
  for skill_dir in "$AGENTS_DIR"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    sname=$(basename "$skill_dir")
    desc=$(skill_description "$skill_dir/SKILL.md")
    printf -- '- **`/%s`** — %s\n' "$sname" "$(summarize_description "$desc")"
  done
}

# Tool dirs to symlink into, if present. Add more as new CLIs adopt skills.
TOOL_DIRS=(
  "$HOME/.claude/skills"
  "$HOME/.codex/skills"
)

# Manifest of the skills THIS installer manages, so a later run can prune ones
# that have since left the repo (e.g. folded into another skill) without ever
# touching skills other tools install into the same shared ~/.agents/skills.
MANIFEST="$AGENTS_DIR/.skillz-manifest"

installed=0
linked=0
pruned=0
current_skills=""
for skill_dir in "$SCRIPT_DIR"/*/; do
  name=$(basename "$skill_dir")
  [[ -f "$skill_dir/SKILL.md" ]] || continue
  current_skills="${current_skills}${name}"$'\n'

  # Replace any prior copy so removed files don't linger.
  if [ -e "$AGENTS_DIR/$name" ]; then
    find "$AGENTS_DIR/$name" -depth -delete
  fi
  cp -r "$skill_dir" "$AGENTS_DIR/$name"
  echo "Installed: $name"
  installed=$((installed + 1))

  # Inject any shared reference modules this skill opted into. The manifest was
  # just copied in as part of the skill dir; each named module is copied from
  # shared/<module>/ into the installed skill's references/<module>/.
  shared_manifest="$AGENTS_DIR/$name/references/.shared"
  if [ -f "$shared_manifest" ]; then
    while IFS= read -r module || [ -n "$module" ]; do
      module="${module%%#*}"                       # strip trailing comments
      module="$(printf '%s' "$module" | xargs)"    # trim surrounding whitespace
      [ -z "$module" ] && continue
      if [ -d "$SHARED_DIR/$module" ]; then
        dest="$AGENTS_DIR/$name/references/$module"
        rm -rf "$dest"
        cp -r "$SHARED_DIR/$module" "$dest"
        echo "          shared: $module -> $name/references/$module"
      else
        echo "          WARN: shared module '$module' requested by $name not found in $SHARED_DIR"
      fi
    done < "$shared_manifest"
  fi

  # Create a symlink in each tool dir that exists on this machine.
  for tool_dir in "${TOOL_DIRS[@]}"; do
    [ -d "$tool_dir" ] || continue
    # Skip tool dirs that are really the source-of-truth dir itself (e.g.
    # ~/.claude/skills symlinked to ~/.agents/skills). Symlinking into it
    # would delete the real copy just made and leave a self-referential link.
    if [ "$(cd "$tool_dir" && pwd -P)" = "$(cd "$AGENTS_DIR" && pwd -P)" ]; then
      continue
    fi
    link="$tool_dir/$name"
    # `ln -sfn` overwrites an existing symlink in place. If a real
    # directory is sitting there from an older install, take it down
    # first so the link can be created cleanly.
    if [ -d "$link" ] && [ ! -L "$link" ]; then
      find "$link" -depth -delete
    fi
    ln -sfn "$AGENTS_DIR/$name" "$link"
    echo "          linked: $link -> $AGENTS_DIR/$name"
    linked=$((linked + 1))
  done
done

# Prune skills we installed on a previous run that no longer ship in the repo.
# Only names recorded in our own manifest are eligible, so skills other tools
# (Codex, etc.) place in the shared ~/.agents/skills are never removed.
if [ -f "$MANIFEST" ]; then
  while IFS= read -r prev || [ -n "$prev" ]; do
    [ -z "$prev" ] && continue
    # Still shipped by the repo this run? Then keep it.
    printf '%s' "$current_skills" | grep -qxF "$prev" && continue
    if [ -e "$AGENTS_DIR/$prev" ]; then
      find "$AGENTS_DIR/$prev" -depth -delete
      echo "Pruned: $prev (no longer in repo)"
      pruned=$((pruned + 1))
    fi
    # Take down the symlinks we created for it in each tool dir.
    for tool_dir in "${TOOL_DIRS[@]}"; do
      [ -d "$tool_dir" ] || continue
      if [ "$(cd "$tool_dir" && pwd -P)" = "$(cd "$AGENTS_DIR" && pwd -P)" ]; then
        continue
      fi
      [ -L "$tool_dir/$prev" ] && rm -f "$tool_dir/$prev"
    done
  done < "$MANIFEST"
fi

# Record the skills we manage this run for the next run's prune pass.
printf '%s' "$current_skills" | LC_ALL=C sort > "$MANIFEST"

instruction_count=0
if [ -d "$SCRIPT_DIR/instructions" ]; then
  for instruction_file in "$SCRIPT_DIR"/instructions/*.md; do
    [ -f "$instruction_file" ] || continue
    cp "$instruction_file" "$PI_INSTRUCTIONS_DIR/$(basename "$instruction_file")"
    echo "Instruction: $(basename "$instruction_file") -> $PI_INSTRUCTIONS_DIR"
    instruction_count=$((instruction_count + 1))
  done
fi

extension_count=0
if [ -d "$SCRIPT_DIR/pi-extensions" ]; then
  for extension_file in "$SCRIPT_DIR"/pi-extensions/*.ts; do
    [ -f "$extension_file" ] || continue
    cp "$extension_file" "$PI_EXTENSIONS_DIR/$(basename "$extension_file")"
    echo "Pi extension: $(basename "$extension_file") -> $PI_EXTENSIONS_DIR"
    extension_count=$((extension_count + 1))
  done
fi

# Regenerate ~/.agents/AGENTS.md with current skill listing
AGENTS_MD="$AGENTS_HOME_DIR/AGENTS.md"
{
  cat << 'HEADER'
# Global Agent Instructions

## Standing Rules

- **Planning always lives in [`KevinKab2412/planning`](https://github.com/KevinKab2412/planning)** (private).
  Every spec epic, task sub-issue and wayfinder map goes there — never in a code repo, and never in
  the tracker the work came from. Pass `-R KevinKab2412/planning` on every `gh issue` / `gh label` /
  `gh api repos/...` call; `gh` otherwise targets the repo you're standing in.
- **Never write to a shared team tracker** (Linear, Jira) — read tickets, but don't comment, edit or
  change status. What appears there is the user's to write.
- **Prototypes are throwaway**: never branch and never commit one. The artifact goes to a gitignored
  directory in the repo; only the verdict, its numbers, and the settings it depends on carry forward.

## Writing Style

- **Never use the "corrective reframe" tic.** Do not write the "not X — it's Y" (or "isn't X, it's Y")
  construction that demotes a modest framing and then overwrites it with a grander one for rhetorical
  punch. Banned shapes include: "That's not a tuning detail — it's the two things the system sells",
  "This isn't a rename, it's the whole public API", "Call it X if you want, but it's really Y", and
  "X? No. Y." The em-dash pivot, the comma pivot, and the question-then-answer pivot are all the same
  move and all banned.
  - **Instead, just state the claim directly.** Say what the thing *is* and why it matters, without
    first knocking down a smaller reading. "These are the two things the system sells" beats "That's
    not a tuning detail — it's the two things the system sells." Drop the setup; keep the substance.
  - **Allowed:** a plain factual correction where a contrast is literally the point ("This isn't the
    prod config, it's the staging one"). What's banned is the contrast used as *emphasis* — inventing
    a weak frame just to dramatically overrule it.

## Available Skills

Skills load automatically from `~/.agents/skills/`. Use `/skill-name` or describe what you need.

HEADER
  emit_skill_bullets
  echo ""
  echo "> Source of truth: \`~/.agents/skills/\` — managed via [KevinKab2412/Skillz](https://github.com/KevinKab2412/Skillz). Run \`install.sh\` to sync."
} > "$AGENTS_MD"
echo "Generated: $AGENTS_MD"

# Regenerate the repo's own skill listing from the same bullets, so the
# checked-in docs can't drift from what is actually installed.
REPO_AGENTS_MD="$SCRIPT_DIR/AGENTS.md"
BEGIN_MARKER="<!-- skillz:available-skills -->"
END_MARKER="<!-- /skillz:available-skills -->"
if [ -f "$REPO_AGENTS_MD" ] \
  && grep -qF "$BEGIN_MARKER" "$REPO_AGENTS_MD" \
  && grep -qF "$END_MARKER" "$REPO_AGENTS_MD"; then
  repo_tmp=$(mktemp)
  {
    awk -v m="$BEGIN_MARKER" 'index($0, m) { exit } { print }' "$REPO_AGENTS_MD"
    echo "$BEGIN_MARKER"
    echo "## Available Skills"
    echo ""
    echo "Skills load automatically from \`~/.agents/skills/\` (shared across Claude Code, Codex, and OpenCode). Invoke with \`/skill-name\` or just describe what you need:"
    echo ""
    emit_skill_bullets
    echo ""
    echo "> Skill source of truth: \`~/.agents/skills/\` — managed via the Skillz repo. Run its \`install.sh\` to sync."
    echo "$END_MARKER"
    awk -v m="$END_MARKER" 'found { print } index($0, m) { found = 1 }' "$REPO_AGENTS_MD"
  } > "$repo_tmp"
  mv -f "$repo_tmp" "$REPO_AGENTS_MD"
  echo "Regenerated: $REPO_AGENTS_MD (skill listing)"
else
  echo "Skipped: $REPO_AGENTS_MD (missing skillz:available-skills markers)"
fi

# Symlink ~/.claude/CLAUDE.md -> ~/.agents/AGENTS.md for Claude Code global context
CLAUDE_MD="$HOME/.claude/CLAUDE.md"
ln -sf "$AGENTS_MD" "$CLAUDE_MD"
echo "Symlinked: $CLAUDE_MD -> $AGENTS_MD"

echo ""
echo "Done. $installed skill(s) installed to $AGENTS_DIR."
if [ "$pruned" -gt 0 ]; then
  echo "      $pruned stale skill(s) pruned."
fi
echo "      $instruction_count instruction module(s) installed to $PI_INSTRUCTIONS_DIR."
echo "      $extension_count Pi extension(s) installed to $PI_EXTENSIONS_DIR."
if [ "$linked" -gt 0 ]; then
  echo "      $linked symlink(s) created across tool dirs."
else
  echo "      No tool dirs found (~/.claude/skills, ~/.codex/skills)."
fi
echo "Restart Claude Code or OpenCode to pick up skill changes."
