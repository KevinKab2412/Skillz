#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT

python3 - "$repo_root/install.sh" <<'PY'
import sys
from pathlib import Path

# Accept the best-effort `if ... && ...; then` wrapper as well as bare commands.
install = [
    line.strip().removeprefix('if ').removeprefix('&& ').removesuffix('\\').removesuffix('; then').strip()
    for line in Path(sys.argv[1]).read_text().splitlines()
]
commands = [
    'uv tool install --editable "$MEMORY_SOURCE"',
    "agent-memory-init",
    "agent-memory-service install",
    "agent-memory-setup",
]
positions = [install.index(command) for command in commands]
assert positions == sorted(positions), positions
PY

cp -f "$repo_root/install.sh" "$fixture/install.sh"
cp -f "$repo_root/retired-skills.txt" "$fixture/retired-skills.txt"
mkdir -p "$fixture/scripts"
cp -f "$repo_root/scripts/prune-retired-skills.py" "$fixture/scripts/prune-retired-skills.py"
cp -rf "$repo_root/shared" "$fixture/shared"
cp -rf "$repo_root/workflow_memory_release" "$fixture/workflow_memory_release"
for skill in pair code-review; do
  cp -rf "$repo_root/$skill" "$fixture/$skill"
done
mkdir -p "$fixture/home/.claude"

HOME="$fixture/home" \
AGENTS_HOME="$fixture/agents" \
PI_HOME="$fixture/pi" \
AGENT_MEMORY_SOURCE="$fixture/missing-agent-memory" \
bash "$fixture/install.sh" >/dev/null

HOME="$fixture/home" \
AGENTS_HOME="$fixture/agents" \
PI_HOME="$fixture/pi" \
AGENT_MEMORY_SOURCE="$fixture/missing-agent-memory" \
bash "$fixture/install.sh" >/dev/null

for skill in pair; do
  installed="$fixture/agents/skills/$skill"
  test -f "$installed/references/memory/workflow-memory.md"
  cmp "$repo_root/shared/memory/workflow-memory.md" \
    "$installed/references/memory/workflow-memory.md"
  test ! -d "$repo_root/$skill/references/memory"
done

for skill in pair/references/grill pair/references/experts code-review; do
  test ! -d "$fixture/agents/skills/$skill/references/memory"
done

python3 - "$repo_root" "$fixture/agents/skills" <<'PY'
import json
import sys
from pathlib import Path

repo = Path(sys.argv[1])
installed = Path(sys.argv[2])
protocol = (installed / "pair/references/memory/workflow-memory.md").read_text()
pair = (installed / "pair/SKILL.md").read_text()
evals = json.loads((repo / "pair/evals/evals.json").read_text())

contracts = {
    "memory.recall/v1",
    "memory.remember/v1",
    "memory.correct/v1",
    "memory.forget/v1",
    "memory.flush/v1",
}
assert all(contract in protocol for contract in contracts)
assert "ordinary runs are active" in protocol
assert "references/memory/workflow-memory.md" in pair
assert "Workflow memory lifecycle (automatic)" in pair

names = {case["name"] for case in evals["evals"]}
assert names == {
    "memory-authority-first-open",
    "memory-strict-capture-and-correction",
    "memory-nested-lifecycle",
    "memory-fail-open-warning-budget",
    "memory-release-active",
}

for forbidden in ("SQLite", "FastEmbed", "outbox", "client configuration"):
    assert forbidden not in pair
PY

printf '%s\n' sentinel > "$fixture/agents/skills/pair/sentinel"
mkdir -p "$fixture/pristine"
cp -rf "$fixture/shared" "$fixture/pristine/shared"
cp -rf "$fixture/workflow_memory_release" "$fixture/pristine/workflow_memory_release"

tree_hash() {
  python3 - "$fixture/agents" <<'PY'
import hashlib
import sys
from pathlib import Path

root = Path(sys.argv[1])
digest = hashlib.sha256()
for path in sorted(root.rglob("*")):
    digest.update(str(path.relative_to(root)).encode())
    if path.is_file() and not path.is_symlink():
        digest.update(path.read_bytes())
    elif path.is_symlink():
        digest.update(path.readlink().as_posix().encode())
print(digest.hexdigest())
PY
}

assert_refused_without_mutation() {
  before=$(tree_hash)
  if HOME="$fixture/home" \
    AGENTS_HOME="$fixture/agents" \
    PI_HOME="$fixture/pi" \
    AGENT_MEMORY_SOURCE="$fixture/missing-agent-memory" \
    bash "$fixture/install.sh" >/dev/null 2>&1; then
    exit 1
  fi
  test "$before" = "$(tree_hash)"
}

for case in missing missing_release refused below_threshold project_leak inactive_leak partial stale_workflow stale_retrieval; do
  rm -rf "$fixture/shared" "$fixture/workflow_memory_release"
  cp -rf "$fixture/pristine/shared" "$fixture/shared"
  cp -rf "$fixture/pristine/workflow_memory_release" "$fixture/workflow_memory_release"
  python3 - "$fixture" "$case" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
case = sys.argv[2]
report_path = root / "workflow_memory_release/report.json"
report = json.loads(report_path.read_text())
if case == "missing":
    report_path.unlink()
elif case == "missing_release":
    (root / "shared/memory/release.json").unlink()
elif case == "refused":
    report["outcome"] = "refuse"
elif case == "below_threshold":
    report["retrieval"]["score"]["recall_at_five"] = 0.89
    report["retrieval"]["score"]["passed"] = False
elif case == "project_leak":
    report["retrieval"]["score"]["project_leaks"] = 1
elif case == "inactive_leak":
    report["retrieval"]["score"]["inactive_leaks"] = 1
elif case == "partial":
    release_path = root / "shared/memory/release.json"
    release = json.loads(release_path.read_text())
    release["workflows"].remove("pair")
    release_path.write_text(json.dumps(release))
elif case == "stale_workflow":
    path = root / "workflow_memory_release/fixtures/workflows-v1.json"
    path.write_text(path.read_text() + "\n")
elif case == "stale_retrieval":
    path = root / "workflow_memory_release/fixtures/retrieval-v1.json"
    path.write_text(path.read_text() + "\n")
if case not in {"missing", "partial", "stale_workflow", "stale_retrieval"}:
    report_path.write_text(json.dumps(report))
PY
  assert_refused_without_mutation
done
