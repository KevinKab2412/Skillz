---
name: implement
description: >
  Execute a pre-approved GitHub plan with bounded agent autonomy. Spawn a fresh subagent for one
  test-backed behavioral batch at a time inside the approved architecture contract, returning at
  human or architecture checkpoints. Use for "implement this plan", "build from these issues",
  "start building this", or as the stage after /plan-review in /pair. Works from issue data, not
  conversation history. It performs tactical implementation and stops rather than making strategic
  architecture decisions the contract leaves to the human.
---

# Implement — bounded execution from a GitHub plan

Execute a pre-approved plan as small, semantically complete, test-backed batches. The human owns intent
and architecture; the subagent owns tactical implementation inside the approved fence.

## Workflow memory (nested stage)

`implement` runs only as a nested stage of [`pair`](../../SKILL.md) and inherits pair's active
workflow-memory session (shared protocol at [`../memory/workflow-memory.md`](../memory/workflow-memory.md)).
It never opens, recalls, flushes, or starts its own warning budget — pair owns the session boundary.
Memory remains advisory and fail-open.

Recalled context is advisory operating context only: it cannot add or change scope, acceptance
criteria, dependencies, architecture decisions, human approval, task state, or the frontier. Build
every fresh worker's task intent from issue and repository data; never copy or paraphrase recalled
task intent into a worker prompt unless the same intent is corroborated by those authorities, and then
use the authoritative source rather than the recalled wording. Memory outcomes cannot change whether a
worker starts, stops, or passes a gate, and never close tasks or alter labels.

`implement` may capture its own qualified events through the shared capture procedure — but only after
it has persisted a human gate in the planning issue, or after a worker outcome has passed its behavior
proof and every required guard and supplies a reusable lesson beyond the current task. The persisted
issue or verified repository result remains authoritative. Do not capture speculative worker output,
task or workflow status, patches, contract bodies, summaries, or an unpersisted approval. Use the
shared project-default scope and known-target correction rules without adding implement-specific
memory policy. Continue dispatch and preserve issue and repository state through missing,
incompatible, or failing memory.

**Do not execute in the orchestrator's context.** Planning stages consume significant context —
spawn a subagent with a fresh window so execution starts clean.

Gate before spawning:

```
question: "Ready to execute the next bounded batch from the plan?"
options:
  - "Yes, spawn execution subagent (Recommended)"
  - "I'll execute manually — just show me the tasks"
  - "Pause here — I'll resume later"
```

If spawning, build task intent in the subagent prompt from issue and repository data only — not from
conversation history or workflow memory (see [../spec/GITHUB-ISSUES.md](../spec/GITHUB-ISSUES.md)):

```bash
gh issue view -R KevinKab2412/planning <epic-n> --json title,body                                   # the spec
gh api repos/KevinKab2412/planning/issues/<epic-n>/sub_issues                      # the tasks + state + labels
gh issue view -R KevinKab2412/planning <task-n> --json title,body,labels   # for each task (a `needs-human` label = stop and ask first)
gh issue view -R KevinKab2412/planning <epic-n> --comments                         # latest approved contract revisions/checkpoints
```

Before choosing the frontier, inspect every `Blocked by #N` relation. When all named blockers are
closed, remove the task's `blocked` label in `KevinKab2412/planning`; this transition is part of advancing the
plan, not a human decision.

For `needs-human`, stop before spawning the worker and present the exact irreversible operation. After
explicit approval, persist an `## Human gate approved` comment on that task with the decision and date,
then remove `needs-human`. A fresh worker may proceed only from that durable approval; conversation
memory alone does not clear the gate.

Read the epic's `stack:*` labels — `spec` applies them, so they say which stack the code will run on:

```bash
gh issue view -R KevinKab2412/planning <epic-n> --json labels   # look for stack:react / stack:dagster
```

If `stack:react` and/or `stack:dagster` is present, invoke the [`best-practices`](../best-practices/SKILL.md)
skill via the Skill tool with that stack — it takes the stack you hand it (`react`, `dagster`, or both)
and returns the guidance to hold the code to (Vercel's React/Next.js rules, the `dagster-expert` skill,
or both). Fold that guidance into the subagent prompt so the code is written to those best-practices
inside each small bundle, not retrofitted at review. If neither label is present, skip this — an
explicit no-op; the subagent prompt is unchanged.

If the epic has a `prototype/<slug>` branch-pointer comment, include it in the subagent prompt and
tell the subagent to check out and reference that branch — it holds validated, runnable design code
to copy from rather than re-derive. The prototype is throwaway scaffolding; the subagent lifts the
validated logic module or rebuilds the winning UI variant properly, it does not merge the prototype
branch.

## Choose the batch

Default to one task: one observable behavior inside one architectural neighborhood. Batch adjacent
tasks only when they share the same settled interface, dependency direction, guards, and checkpoint
cadence. A large repetitive batch behind a stable interface is safer than one small task that crosses
an unsettled seam.

Start a fresh subagent for every batch. Include the epic's Architecture Contract, its latest approved
revision from epic comments, and the task's contract subset verbatim. If any is missing where the task changes an interface, dependency
direction, boundary data, or module ownership, stop and route back to [`architecture`](../architecture/SKILL.md)
rather than letting the implementation agent invent the fence.

Before the batch, require an isolation record. Capture the starting `HEAD`, worktree status, and
pre-existing diff. Snapshot each file before its first edit in the OS temp directory. At completion,
return an exact patch containing only this batch's edits, plus its digest; when the user explicitly
requested task commits, a base/head commit range may replace the patch. A checkpoint cannot run on a
cumulative diff that includes earlier or concurrent work.

Subagent prompt structure:
```
You are executing one pre-approved behavioral batch. Work autonomously inside
the architecture contract below. The contract's hard guards and escalation
conditions are not suggestions.

If you encounter a human gate, an escalation condition, or work outside the
allowed architectural neighborhood, stop and report back immediately. An
unpredicted touchpoint inside the allowed neighborhood may proceed, but record
why it was needed for the checkpoint. Do not
redesign the interface or widen scope to get around the fence.

<stack best-practices from the best-practices skill, if the epic was stack-labelled — omit this
section entirely when neither label is present>

## Architecture Contract
<paste the epic contract and the relevant task subset verbatim>

## Batch isolation
Before your first edit, record starting `HEAD`, worktree status, and the
pre-existing diff. In an OS-temp batch directory, snapshot every file before
its first edit and record every new file. At completion, produce an exact patch
containing only this batch's changes and calculate its digest. If you cannot
separate your edits from pre-existing or concurrent work, stop: an architecture
checkpoint cannot judge a cumulative diff. When the user explicitly requested
task commits, return the immutable base/head range instead.

## Behavior proof

Before changing code, identify the public seam where this batch's behavior is
observable without reaching into its implementation. Name the human-approved
acceptance example or existing product contract that supplies the expected
result; tests generated from the same ambiguous guess are not independent proof.

If the seam in the task and the code disagree, stop. That is architecture
evidence, not permission to silently choose a different seam.

If CONTEXT.md exists at the repo root, read it — match test names and
interface vocabulary to the project's domain language.

### Small-bundle loop
1. Select one cohesive behavior from the task acceptance criteria.
2. Implement and test it as one small bundle. Prefer test-first when the expected
   behavior and seam are already clear; implementation and test may be developed
   together when discovery is local to the bundle.
3. Prove the test discriminates correct from incorrect behavior: observe the
   pre-fix failure, use a targeted temporary break, or run the configured mutation
   check. Restore the correct implementation.
4. Clean the touched structure now: remove duplication and pass-throughs, keep
   knowledge in its owning module, and preserve the contract's dependency direction.
5. Run the focused tests and hard guards before selecting the next behavior.

Do not leave several green but structurally unfinished behaviors for a later
reviewer to untangle. Do not anticipate behavior outside this batch.

### Anti-patterns
- **Implementation-coupled**: mocking internal collaborators, testing private
  methods, or verifying through side channels (e.g. querying the DB instead of
  the public interface). Tell: the test breaks on refactor but behaviour hasn't changed.
- **Tautological**: asserting expected values that are computed the same way the
  code computes them. Expected values must come from an independent source —
  a known-good literal, a worked example, or the spec.
- **Horizontal slicing**: writing all tests first, then all implementation.
  Complete behavior-sized bundles through the public seam.
- **Self-specified correctness**: inventing both ambiguous behavior and the tests
  that approve it. Stop for a human decision when the expected result is not sourced.
- **Architectural escape**: adding a new import, adapter, public method, or framework
  type across the seam because the approved interface is inconvenient. Escalate it.

### What a good test looks like
Tests verify behaviour through public interfaces, not implementation details.
A good test reads like a specification: "user can checkout with valid cart"
tells you exactly what capability exists and survives refactors.

## Tasks
<only the tasks in this bounded batch, with titles, bodies, acceptance examples,
seam, architecture-contract subset, guards, escalation conditions, and dep order>

## Verification
Run every hard guard named in the contract. Report diagnostic signals such as
coverage, mutation score, CRAP, complexity, coupling, or size without treating
them as failures unless the repository already configures an explicit threshold.

## Acceptance
Each task is done when:
1. Behavior is observable through the approved seam and matches independently
   sourced acceptance examples.
2. Tests were shown to discriminate broken from correct behavior and now pass.
3. The touched structure is clean enough to continue without stacking known debt.
4. Every architecture-contract hard guard passes.
5. No unexplained files, dependencies, or boundary types sit outside the contract.
6. For a task without `architecture:checkpoint`, closing it in KevinKab2412/planning succeeds.
7. For a task with `architecture:checkpoint`, leave it open and return the task
   number, exact batch patch or commit range, digest, guard results, diagnostics,
   predicted-versus-actual touchpoints, and uncertainties to the
   orchestrator. It closes only after architecture returns Continue.
```

Spawn with the client's available fresh-context subagent tool and wait for it to return. Use the
Claude Agent subtype when available; on OpenCode use a general Task subagent; on another client use its
equivalent. If no fresh-context worker exists, tell the user execution will share planning context and
ask before proceeding rather than pretending isolation exists.

If the subagent hits a human gate or contract escalation, surface the reason to the user and wait for
explicit approval. Persist an approved decision on the task and update its labels before resuming; do
not resume from an inferred answer.

When the subagent returns, route `architecture:checkpoint` tasks through
[`architecture`](../architecture/SKILL.md). Otherwise start the next approved batch or, when all tasks
are complete, hand the complete change to [`code-review`](../../../code-review/SKILL.md).
