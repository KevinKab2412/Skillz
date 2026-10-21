# skillz

A curated collection of agent skills — the source of truth for my Pi, Claude Code,
Codex, Cursor, and OpenCode setup. Each skill is a directory with a `SKILL.md`.

## Install / sync

```bash
bash install.sh
```

`install.sh` treats `~/.agents/skills/` as the single source of truth and:

- copies every skill dir here into `~/.agents/skills/` (replacing prior copies so
  removed files don't linger),
- regenerates `~/.agents/AGENTS.md` and symlinks `~/.claude/CLAUDE.md` to it,
- symlinks each skill into existing `~/.claude/skills/`, `~/.codex/skills/`,
  `~/.cursor/skills/`, and `~/.config/opencode/skills/` directories,
- removes explicitly retired skills from known global discovery roots, including nested synced
  imports, according to [`retired-skills.txt`](retired-skills.txt); removed copies are backed up
  outside discovery in `~/.agents/skill-backups/`,
- removes nested synced duplicates when a canonical skill is installed at the shared root,
- refreshes an existing generated skill listing in `~/AGENTS.md`, preserving its standing rules,
- installs the orchestrator-only instruction modules to `~/.pi/agent/instructions/`.
- when the sibling `agent-memory` checkout is present, installs its common stdio command, initializes
  keychain-backed encrypted storage, and idempotently registers it with all three clients.

Pi and OpenCode read `~/.agents/skills/` natively. Override the source-of-truth location
with `AGENTS_HOME` if needed. Restart Claude Code / OpenCode afterward to pick up
changes.
Set `AGENT_MEMORY_SOURCE` when the memory-service checkout is not beside this repository.

## Skills

| Skill | Description |
|-------|-------------|
| **code-review** | Review a change and give one clear merge verdict with plain-English findings and paste-ready PR comments; owns focused bug/security reviews and optional host-specific Bugbot/Security Review adapters. Also builds a teaching explainer on request. Stage 5 of pair; also standalone: "review my changes against the spec", "explain this PR". |
| **explain-this-like-I-am-an-intern** | User-invoked way to get clarity on anything — a subject you want to finally understand, or a message the agent just made that didn't land. Re-explains from scratch as if to a bright intern on their first day (missing premise + why first, every term glossed, plain English, a concrete example), then probes with a question or two to check it landed. Absorbs `wait-what` and folds in the teaching ethos of `soc`/`teach`. Triggers on `/explain-this-like-I-am-an-intern`, "eli-intern", "you lost me", "wait, what?", "explain this like I'm an intern". |
| **grill** | Interview you relentlessly to shared understanding while maintaining the domain model (CONTEXT.md + ADRs). Asks round-by-round — the whole settled-prerequisite frontier per round — not one question at a time. Stage 1 of pair; also standalone: "grill me on this", "help me nail down the design". |
| **pair** | Orchestrator that chains understanding, an optional architecture fence, planning, bounded implementation batches, architecture checkpoints, and review. Its pipeline stages (spec, plan-review, implement, architecture, prototype, sketch-change, taste-review, polish, best-practices) live as reference modules under `pair/references/`, not as standalone skills; `grill`, `research`, and `code-review` remain standalone and are called by pair. Triggers on `/pair`, "pair with me", or describing a feature to build end-to-end. |
| **research** | Investigate a question against high-trust primary sources, web search, and Mobbin UI examples, then capture findings as a Markdown file in the repo. Optional Stage 0 of pair; also standalone. |
| **show-me** | Explain the current topic *visually* instead of in a wall of prose — the smallest compact view that carries the shape: pseudocode, a call tree, a component tree, a shallow file tree, a Mermaid sequence/state diagram, a shape-matched diff, or one focused HTML file. Adapted from Dex Horthy's [show-me](https://github.com/humanlayer/skills/tree/main/plugins/show-me). The same discipline is shared (via `shared/show-me/`) into `explain-this-like-I-am-an-intern`, `code-review`, `to-pr`, and `research`. Triggers on `/show-me`, "show me how X works", "visualise/diagram this". |
| **skill-creator** | Create, modify, and improve skills; run evals and benchmark skill performance; optimize a skill's description for better triggering. |
| **to-visual** | Turn one concept into an animated, beat-by-beat HTML explainer: a 1920×1080 stage that pauses after each beat, silent, one caption per beat. For an agent-written change it builds a **concept view** (Jackson's concept design): the concepts the change touches, a watch **recorded from the change's own tests** by the stack's recorder in `scripts/recorders/` (Django, Laravel, FastAPI, Express + Jest; one shared trace format), a playable concept machine, and a quiz. Also concept scenes (familiar concepts first, metaphors as an optional skin) and the step-through walk (the old `stepper.html` schema). Ships a concept library (`library/`, Jackson + Litt) that agents extend through a private overlay at `~/.agents/to-visual/library/`. A small GSAP kit plus `scripts/assemble.py` inline everything into one `file://`-safe page or an inline fragment; every beat is screenshot-checked before it opens. Called by `explain-this-like-I-am-an-intern`, `code-review` (inline in the explainer), `show-me`, and pair's `spec` / `sketch-change` when the shared "Animated walkthrough" gate fires; also `/to-visual <concept>`. |
| **to-pr** | Prepare draft PRs from finished work; inspect local/remote unmerged branches, propose reviewer-aligned splits or genuinely dependent stacks, then distil each PR body from the diff or an existing explainer. Owns gh-stack operations; gets approval before moving work or rewriting history. Does not review code or generate an explainer. Triggers on `/to-pr`, "make a PR for this branch", or pointing at an explainer file and wanting it made into a PR. |
| **wayfinder** | Plan work too big for one session as a map of decision tickets (research / prototype / grilling / task) — GitHub issues in the private `KevinKab2412/planning` repo, branch-independent, no noise in shared repos. Charts the fog, resolves tickets one per session, hands a dense map to `spec`. User-invoked: "chart a map for X", "help me wayfind this", "this is too big to plan in one go". |

## Consolidated entry points

- `pair/references/worktree/` owns isolation setup at the **start** of pair. Code review and global
  repository-work instructions reuse that module; there is no standalone worktree skill.
- `code-review/references/review-backends/` contains the optional Bugbot/security backend adapters.
  A backend's absence is reported; regular review is never presented as a backend run.
- `to-pr/references/pr-layout.md` owns safe splitting, approval, snapshots (including untracked work),
  and logical dependency selection. `to-pr/references/gh-stack/` owns stack commands.
- `grill` and `research` remain standalone: wayfinder also calls them, and each supports useful
  work without committing to the pair pipeline.
- `show-me` and `to-visual` remain shared entry points: explanation, review, specs, and sketches
  use their visual capabilities. Their shared formatting rules already live in `shared/show-me/`.
- `standup` and `morning` are also versioned here, preserving the installed utilities.
  `deploying-to-cloud` remains an external Laravel-authored skill.

## Standalone private repositories

Chart selection and flight search have moved out of Skillz and are intentionally absent from the
shared/global skill list:

- [Data visualization selection](https://github.com/KevinKab2412/data-viz-selection)
- [Flexible oneworld award search](https://github.com/KevinKab2412/find-flexible-oneworld-awards)

Their source and supporting files live in those repositories; read their `SKILL.md` files on demand.
Both names remain in `retired-skills.txt` solely to prevent global reinstallation.

The retirement list is deliberate user policy, not a general purge of third-party skills. Unknown
external skills are preserved. A vendor/client may reinstall its bundled skills on update; rerun
`install.sh` to apply the policy again. Already-running agents need `/reload` or a restart.

## Checks

```bash
python3 -m unittest discover -s tests -p test_skill_consolidation.py
bash tests/test-install-prune.sh
bash tests/test-workflow-memory-install.sh
```

The automatic-memory release guard still applies: when pair's instructions change, rerun the observed
workflow checks and refresh their evidence before installing; unchanged retrieval evidence remains
valid only while its protocol and fixture inputs remain unchanged.

## Instruction modules (`instructions/`)

Orchestrator-only guidance installed to `~/.pi/agent/instructions/` (not registered
as standalone skills): `fortify-development`, `inertia-svelte-development`,
`laravel-best-practices`, `laravel-docs-lookup`, `pest-testing`,
`tailwindcss-development`, `wayfinder-development`.
