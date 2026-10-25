#!/usr/bin/env bash
# install.sh must prune skills IT previously installed once they leave the repo,
# while never touching skills other tools placed in the shared ~/.agents/skills.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT

cp -f "$repo_root/install.sh" "$fixture/install.sh"
cp -f "$repo_root/retired-skills.txt" "$fixture/retired-skills.txt"
mkdir -p "$fixture/scripts"
cp -f "$repo_root/scripts/prune-retired-skills.py" "$fixture/scripts/prune-retired-skills.py"
cp -rf "$repo_root/shared" "$fixture/shared"
for skill in pair code-review explain visualise utils; do
  cp -rf "$repo_root/$skill" "$fixture/$skill"
done
mkdir -p "$fixture/home/.claude" "$fixture/home/.codex/skills"

run_install() {
  HOME="$fixture/home" \
  AGENTS_HOME="$fixture/agents" \
  PI_HOME="$fixture/pi" \
  bash "$fixture/install.sh" >/dev/null
}

# Renaming must preserve the private overlay without exporting its cards as a global skill.
mkdir -p "$fixture/agents/to-visual/library/concepts"
printf 'private-card\n' > "$fixture/agents/to-visual/library/concepts/test.md"

# An upgrade removes the old injected policy and never invokes model/service tooling.
mkdir -p "$fixture/agents/skills/pair/references/memory" "$fixture/bin"
printf 'retired policy\n' > "$fixture/agents/skills/pair/references/memory/workflow-memory.md"
for tool in claude uv agent-memory-init agent-memory-service agent-memory-setup; do
  printf '#!/bin/sh\necho "unexpected memory/model tool invocation" >&2\nexit 99\n' > "$fixture/bin/$tool"
  chmod +x "$fixture/bin/$tool"
done
export PATH="$fixture/bin:$PATH"

# First run: installs the repo skills and records the manifest.
run_install
test ! -e "$fixture/agents/skills/pair/references/memory"
test -f "$fixture/agents/visualise/library/concepts/test.md"
test ! -e "$fixture/agents/to-visual"
grep -qx private-card "$fixture/agents/visualise/library/concepts/test.md"
skills_dir="$fixture/agents/skills"
manifest="$skills_dir/.skillz-manifest"
test -f "$manifest"
grep -qx pair "$manifest"
grep -qx visualise "$manifest"
test -f "$skills_dir/visualise/SKILL.md"
test ! -e "$skills_dir/to-visual"
# Review policy, draft safety, and behavioural cases must ship together with SKILL.md.
for asset in SKILL.md references/constructive-review.md references/draft-reviews.md evals/evals.json; do
  cmp "$fixture/code-review/$asset" "$skills_dir/code-review/$asset"
done

# Shared evidence policy is injected identically for implementers and reviewers.
for skill in pair code-review; do
  cmp "$fixture/shared/evidence/behavior-evidence.md" \
    "$skills_dir/$skill/references/evidence/behavior-evidence.md"
done

# A skill installed by another tool: on disk but not in our manifest.
mkdir -p "$skills_dir/codex-tool"
printf -- '---\nname: codex-tool\ndescription: external tool.\n---\n' \
  > "$skills_dir/codex-tool/SKILL.md"

# A skill we installed before that has since left the repo: in the manifest and
# on disk (with a tool-dir symlink), but not among the repo dirs copied above.
mkdir -p "$skills_dir/oldskill"
printf -- '---\nname: oldskill\ndescription: folded away.\n---\n' \
  > "$skills_dir/oldskill/SKILL.md"
printf 'oldskill\n' >> "$manifest"
ln -sfn "$skills_dir/oldskill" "$fixture/home/.codex/skills/oldskill"

# Explicit retirements apply even to skills installed by other tools, including nested synced copies.
mkdir -p "$skills_dir/review" "$skills_dir/synced/vendor/canvas" "$fixture/home/.cursor/skills"
printf -- '---\nname: review\ndescription: retired.\n---\n' > "$skills_dir/review/SKILL.md"
printf -- '---\nname: canvas\ndescription: retired.\n---\n' > "$skills_dir/synced/vendor/canvas/SKILL.md"
cat > "$fixture/home/AGENTS.md" <<'EOF'
# Global instructions
Keep this custom rule.
## Available Skills
- stale listing
> managed via Skillz
EOF

# Upgrade the renamed explanation skill, including a synced copy outside our manifest.
legacy=explain-this-like-I-am-an-intern
mkdir -p "$skills_dir/$legacy" "$fixture/pi/skills/synced/$legacy"
printf -- '---\nname: explain-this-like-i-am-an-intern\n---\n' > "$skills_dir/$legacy/SKILL.md"
cp -f "$skills_dir/$legacy/SKILL.md" "$fixture/pi/skills/synced/$legacy/SKILL.md"
printf '%s\n' "$legacy" >> "$manifest"
ln -sfn "$skills_dir/$legacy" "$fixture/home/.codex/skills/$legacy"

# Upgrade standalone utilities, including synced imports outside our manifest.
for old in meetily standup retro; do
  mkdir -p "$skills_dir/$old" "$fixture/pi/skills/synced/$old"
  printf -- '---\nname: %s\ndescription: old utility.\n---\n' "$old" > "$skills_dir/$old/SKILL.md"
  cp -f "$skills_dir/$old/SKILL.md" "$fixture/pi/skills/synced/$old/SKILL.md"
  printf '%s\n' "$old" >> "$manifest"
  ln -sfn "$skills_dir/$old" "$fixture/home/.codex/skills/$old"
done
mkdir -p "$fixture/home/Desktop"
printf 'history sentinel\n' > "$fixture/home/Desktop/standups.db"

# Second run: prune removed/retired skills, keep unrelated external and current ones.
run_install
for old in meetily standup retro; do
  test ! -e "$skills_dir/$old"
  test ! -L "$fixture/home/.codex/skills/$old"
  test ! -e "$fixture/pi/skills/synced/$old"
  test -f "$skills_dir/utils/references/$old/SKILL.md"
done
grep -qx 'history sentinel' "$fixture/home/Desktop/standups.db"
test -f "$skills_dir/utils/references/meetily/scripts/meetily.py"
test -f "$skills_dir/utils/references/standup/schema.sql"
test -f "$skills_dir/utils/references/brevity/output-discipline.md"
test -f "$skills_dir/utils/references/coding-standards/coding-standards.md"
grep -q '/utils' "$fixture/home/AGENTS.md"
! grep -Eq '/(meetily|standup|retro)`' "$fixture/home/AGENTS.md"
test ! -e "$skills_dir/$legacy"
test ! -L "$fixture/home/.codex/skills/$legacy"
test ! -e "$fixture/pi/skills/synced/$legacy"
! grep -qxF "$legacy" "$manifest"

test ! -d "$skills_dir/review"
test ! -d "$skills_dir/synced/vendor/canvas"
test -f "$skills_dir/pair/references/worktree/SKILL.md"
test ! -e "$skills_dir/pair/references/memory"
test -f "$skills_dir/pair/references/research/SKILL.md"
test -f "$skills_dir/pair/references/grill/SKILL.md"
test -f "$skills_dir/pair/references/experts/SKILL.md"
test -f "$skills_dir/pair/references/to-pr/SKILL.md"
test -f "$skills_dir/pair/references/brevity/output-discipline.md"
test -f "$skills_dir/explain/references/show-me.md"
test -f "$skills_dir/explain/references/show-me/visual-formats.md"
grep -qx 'name: explain' "$skills_dir/explain/SKILL.md"
for retired in grill experts show-me to-pr; do test ! -e "$skills_dir/$retired"; done
test -L "$fixture/home/.cursor/skills/pair"
grep -q 'Keep this custom rule.' "$fixture/home/AGENTS.md"
! grep -q 'stale listing' "$fixture/home/AGENTS.md"
find "$fixture/home/.agents/skill-backups" -name SKILL.md | grep -q .

test ! -e "$skills_dir/oldskill"                    # our removed skill: pruned
test ! -e "$fixture/home/.codex/skills/oldskill"    # its symlink: pruned
test -d "$skills_dir/codex-tool"                     # external skill: untouched
test -d "$skills_dir/pair"                           # current repo skill: kept
grep -qx pair "$manifest"
! grep -qx oldskill "$manifest"                      # manifest drops the pruned skill
! grep -qx codex-tool "$manifest"                    # external skill never enters manifest

# Repeated runs must refresh listings generated with the capitalized 'Managed via' footer too.
mkdir -p "$skills_dir/new-external"
printf -- '---\nname: new-external\ndescription: another external tool.\n---\n' \
  > "$skills_dir/new-external/SKILL.md"
# A pre-existing destination must never be overwritten or silently merged.
mkdir -p "$fixture/agents/to-visual/library/concepts"
printf 'retained-old-card\n' > "$fixture/agents/to-visual/library/concepts/test.md"
run_install
grep -qx private-card "$fixture/agents/visualise/library/concepts/test.md"
grep -qx retained-old-card "$fixture/agents/to-visual/library/concepts/test.md"
grep -q '/new-external' "$fixture/home/AGENTS.md"
grep -q 'Keep this custom rule.' "$fixture/home/AGENTS.md"

echo "PRUNE TEST PASSED"
