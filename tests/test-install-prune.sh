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
cp -rf "$repo_root/workflow_memory_release" "$fixture/workflow_memory_release"
for skill in pair grill code-review; do
  cp -rf "$repo_root/$skill" "$fixture/$skill"
done
mkdir -p "$fixture/home/.claude" "$fixture/home/.codex/skills"

run_install() {
  HOME="$fixture/home" \
  AGENTS_HOME="$fixture/agents" \
  PI_HOME="$fixture/pi" \
  AGENT_MEMORY_SOURCE="$fixture/missing-agent-memory" \
  bash "$fixture/install.sh" >/dev/null
}

# First run: installs the repo skills and records the manifest.
run_install
skills_dir="$fixture/agents/skills"
manifest="$skills_dir/.skillz-manifest"
test -f "$manifest"
grep -qx pair "$manifest"

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

# Second run: prune removed/retired skills, keep unrelated external and current ones.
run_install

test ! -d "$skills_dir/review"
test ! -d "$skills_dir/synced/vendor/canvas"
test -f "$skills_dir/pair/references/worktree/SKILL.md"
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
run_install
grep -q '/new-external' "$fixture/home/AGENTS.md"
grep -q 'Keep this custom rule.' "$fixture/home/AGENTS.md"

echo "PRUNE TEST PASSED"
