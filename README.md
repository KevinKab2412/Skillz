# Skillz

The source for my Pi, Claude Code, Codex, Cursor, and OpenCode skills. Global entry points stay small;
workflow-specific capabilities live in reusable reference modules.

## Install / sync globally

```bash
bash install.sh
```

The installer:

- copies top-level skill directories into `~/.agents/skills/`, replacing previous copies;
- links them into existing Claude Code, Codex, Cursor, and OpenCode global skill directories;
- regenerates global guidance and the repository's global skill listing;
- refreshes generated listings in `~/AGENTS.md` and `~/.codex/AGENTS.md` without replacing their rules;
- removes explicitly retired global skills using [`retired-skills.txt`](retired-skills.txt), including
  nested synced imports and matching Codex system skills, with backups in `~/.agents/skill-backups/`;
- removes synced duplicates when a canonical global skill exists;
- installs instruction modules into `~/.pi/agent/instructions/`;
- optionally installs/registers the sibling `agent-memory` service when its checkout is present.

Pi and OpenCode read the shared global directory natively. `AGENTS_HOME`, `PI_HOME`, and
`AGENT_MEMORY_SOURCE` override installation paths. Set the latter to a nonexistent path to sync skills
without changing the memory-service installation. Reload or restart agents after syncing.

## Global skills

Nine skills ship globally from this repository:

- **code-review** — requirements/standards review, focused bug/security review, and teaching mode.
- **explain-this-like-i-am-an-intern** — plain-English teaching and compact visual-only explanations.
- **meetily** — find and summarise locally recorded meetings.
- **pair** — gated end-to-end work, or focused requirements, experts, and PR/stack modes.
- **research** — primary-source investigation with citations.
- **retro** — evidence-led improvements to the agent's working environment.
- **standup** — recent activity and yesterday/today/blockers updates.
- **visualise** — animated, beat-by-beat standalone HTML explanations.
- **wayfinder** — multi-session decision maps for large, uncertain work.

The separately installed, Laravel-authored **deploying-to-cloud** skill is retained, making ten
in the current global setup. Unknown third-party skills are preserved unless explicitly retired.
Vendor/client updates may restore bundled skills; rerun the installer to reapply retirement policy.

## Internal modules — read directly, don't start the parent pipeline

- `pair/references/worktree/` — isolation setup at the start of pair, also reused by code-review.
- `pair/references/grill/` — requirements interviewing, also read directly by wayfinder and research.
- `pair/references/experts/` — guidance for the unchanged experts MCP gateway; reused by code-review,
  explanation, research, or any other caller. Standards require citations and honest confidence.
- `pair/references/to-pr/` — draft PR preparation, visual proof, safe splitting, and logical stacking.
  Opening a PR requires an explicit shipping request; polishing a pair change does not open one.
- `explain-this-like-I-am-an-intern/references/show-me.md` — compact visual-only mode, with no forced
  quiz or teaching ceremony. Other skills can read it directly.
- `code-review/references/review-backends/` — optional Bugbot and Security Review adapters.

Pair still owns spec, plan review, implementation, architecture, prototype, sketch, taste, polish,
and stack-specific best-practices modules. Approval gates remain intact. Shared formatting policy
lives in `shared/` and is injected through top-level `references/.shared` manifests. Internal modules
use their parent's injected references; they are not separately advertised or installed.

## Visualise rename compatibility

The global skill is now `visualise` (`/visualise`). The installer migrates the private concept-card
library from `~/.agents/to-visual/` to `~/.agents/visualise/` only when the destination does not exist;
if both exist, it preserves both for a manual merge. Private cards never enter this repository.
Saved scenes using the old `to-visual scene` header still work. The recorder's `TOVISUAL_*`
environment variables, JavaScript APIs, and CSS classes stay unchanged for compatibility.

## Project-local skill creator

The full **skill-creator** skill, scripts, references, and evaluation tools live at
[`.agents/skills/skill-creator/`](.agents/skills/skill-creator/). It is available when working in this
repository, not globally. Project-local Claude Code and Cursor compatibility links point to the same
copy. `install.sh` deliberately does not export `.agents/skills/` to the global skill directory.

## Standalone private repositories

These skills have moved out of Skillz and are intentionally absent from global discovery:

- [Data visualization selection](https://github.com/KevinKab2412/data-viz-selection)
- [Flexible oneworld award search](https://github.com/KevinKab2412/find-flexible-oneworld-awards)

Read their `SKILL.md` files on demand. Retirement policy prevents accidental global reinstallation;
it does not delete their standalone repositories or Skillz's project-local creator.

## Checks

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
bash tests/test-install-prune.sh
bash tests/test-workflow-memory-install.sh
```

The automatic-memory release guard remains active. Changed pair instructions or evaluator code
require fresh observed workflow evidence before installation. Unchanged retrieval evidence remains
valid only while its protocol and fixture inputs remain unchanged. See
[`workflow_memory_release/README.md`](workflow_memory_release/README.md).

## Instruction modules

`instructions/` contains non-standalone guidance installed to `~/.pi/agent/instructions/`:
`fortify-development`, `inertia-svelte-development`, `laravel-best-practices`, `laravel-docs-lookup`,
`pest-testing`, `tailwindcss-development`, and `wayfinder-development`.
