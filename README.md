# Skillz

The source for my Pi, Claude Code, Codex, and Cursor skills. Global entry points stay small;
workflow-specific capabilities live in reusable reference modules.

## Install / sync globally

```bash
bash install.sh
```

The installer:

- copies top-level skill directories into `~/.agents/skills/`, replacing previous copies;
- links them into existing Claude Code, Codex, and Cursor global skill directories;
- regenerates global guidance and the repository's global skill listing;
- refreshes generated listings in `~/AGENTS.md` and `~/.codex/AGENTS.md` without replacing their rules;
- removes explicitly retired global skills using [`retired-skills.txt`](retired-skills.txt), including
  nested synced imports and matching Codex system skills, with backups in `~/.agents/skill-backups/`;
- removes synced duplicates when a canonical global skill exists;
- installs instruction modules into `~/.pi/agent/instructions/`.

Pi reads the shared global directory natively. `AGENTS_HOME` and `PI_HOME`
override installation paths. The experimental agent-memory integration has been removed;
installation does not install a memory service or require model-generated evaluation evidence.
Reload or restart agents after syncing.

## Restore Pi on a new system

The version-pinned Pi setup, local model configuration, prompts, and restore instructions
live in [`pi/`](pi/README.md). After installing the pinned Pi runtime, run
`bash pi/setup.sh` to restore it. Credentials and session history are excluded.

## Global skills

Eight skills ship globally from this repository:

- **code-review** — requirements/standards review, focused bug/security review, and teaching mode.
- **explain** — plain-English teaching and compact visual-only explanations.
- **meetily** — find and summarise locally recorded meetings.
- **pair** — gated end-to-end work, or focused requirements, research, experts, and PR/stack modes.
- **retro** — evidence-led improvements to the agent's working environment.
- **standup** — recent activity and yesterday/today/blockers updates.
- **visualise** — animated, beat-by-beat standalone HTML explanations.
- **wayfinder** — multi-session decision maps for large, uncertain work.

The separately installed, Laravel-authored **deploying-to-cloud** skill is retained, making nine
in the current global setup. Unknown third-party skills are preserved unless explicitly retired.
Vendor/client updates may restore bundled skills; rerun the installer to reapply retirement policy.

## Pair modes — the same instructions across harnesses

```text
/pair Fix the checkout bug
/pair --auto Fix the checkout bug
Use pair with --auto: Fix the checkout bug
```

The default remains human-guided. `--auto` is an instruction-level mode, not a client extension or a
permission switch. It skips grilling and routine approval menus, inspects the task, records a small
execution brief, chooses reasonable reversible defaults, and implements/tests/reviews/polishes within
the existing scope. A leading standalone `--auto` selects it; quoted flags, issue text, and anything
after `--` do not. Unknown leading options or a missing task get one focused clarification.

The mode uses available tools and skills without assuming a particular host. Missing workers permit
a disclosed sequential fallback; missing optional taste/research integrations do not force a pause.
Existing human gates, contracts, host approvals, and required credentials still block unsafe work.
No commit, push, PR, merge, deployment, destructive action, or tracker mutation is authorized by the
flag alone. The task can explicitly authorize an operation, while mandatory confirmations remain.

See [`pair/references/auto.md`](pair/references/auto.md) for the route and stop conditions. The module
adapts the existing implementation/review guidance rather than sending auto runs into guided menus
or requiring a newly invented GitHub plan.

## Internal modules — read directly, don't start the parent pipeline

- `pair/references/worktree/` — isolation setup at the start of pair, also reused by code-review.
- `pair/references/grill/` — requirements interviewing, also read directly by wayfinder and research.
- `pair/references/research/` — primary-source investigation with citations; reads experts first
  when relevant. Research-only requests stop at findings. Code-review reads it for factual gaps.
- `pair/references/experts/` — guidance for the unchanged experts MCP gateway; reused by code-review,
  explanation, research, or any other caller. Standards require citations and honest confidence.
- `pair/references/to-pr/` — draft PR preparation, visual proof, safe splitting, and logical stacking.
  Opening a PR requires an explicit shipping request; polishing a pair change does not open one.
- `explain/references/show-me.md` — compact visual-only mode, with no forced
  quiz or teaching ceremony. Other skills can read it directly.
- `code-review/references/experts-lane.md` — automatic domain-standards pass alongside Standards
  and Spec; missing tools and low confidence are disclosed. Explicit focused scope is preserved.
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
```

Auto-mode interpretation cases live in `pair/evals/auto-mode.json`. The checked report records an
observed instruction-interpretation evaluation, not task execution or cross-harness runtime coverage.
To refresh it with any model command that accepts a prompt on stdin and returns the documented JSON:

```bash
python3 scripts/evaluate_pair_auto.py --report pair/evals/auto-mode-report.json -- <model-command> <flags>
```

The evaluator sends only synthetic cases and the shared instructions. Use a no-tools evaluation
configuration; never put credentials in the command arguments or checked report.

## Instruction modules

`instructions/` contains non-standalone guidance installed to `~/.pi/agent/instructions/`:
`fortify-development`, `inertia-svelte-development`, `laravel-best-practices`, `laravel-docs-lookup`,
`pest-testing`, `tailwindcss-development`, and `wayfinder-development`.
