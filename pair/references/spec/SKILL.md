---
name: spec
description: >
  Synthesise a discussion, grill log, architecture contract, rough idea, or resolved wayfinder map
  into a written spec, then commit it to GitHub as an epic with bounded behavioral child tasks. Use
  for "write a spec", "spec this out", "turn this into issues", "break this into tasks", or as the
  planning stage of /pair. Explores the repo and identifies test seams first, but preserves rather
  than invents architecture decisions. Do not interview the user here — that is /grill — or redesign
  an unsettled seam — that is /architecture.
---

# Spec — synthesise understanding into a spec + GitHub plan

Turn shared understanding (a grill decision log, a discussion, or a rough idea the user hands you)
into a written spec and an atomic plan of **GitHub issues in `KevinKab2412/planning`** (private). **Don't
interview here** — that's [`grill`](../../../grill/SKILL.md). Synthesise from what's already decided plus
what you find in the code.

## Where the plan lives — always the personal planning repo

The epic and every task issue go in **`KevinKab2412/planning`**, never in the code repo, and never in
whatever tracker the originating ticket came from (Linear, Jira). Pass `--repo KevinKab2412/planning` on
every `gh issue` call; `gh` otherwise defaults to the repo you happen to be standing in, which is
exactly the mistake this rule exists to prevent.

Why: planning is branch-independent and shouldn't add noise to a shared code repo, and a shared
tracker is the team's surface — what appears there is the user's to write, not an agent's. This is the
same home [`wayfinder`](../../../wayfinder/SKILL.md) uses for its maps, so a map and the spec built from it
sit in one place. When the work originated as a ticket elsewhere, reference that ticket's id in the
epic body so the trail is followable, and leave the ticket itself untouched.

Confirm scope with AskUserQuestion before writing anything:

```
question: "Ready to synthesise into a spec and open the GitHub issues?"
options:
  - "Yes, write spec and issues (Recommended)" → proceed
  - "Revise something first" → resolve the open point (loop back to /grill if it needs interviewing)
  - "Summarise in chat only, skip issues" → produce markdown checklist and stop
```

## Step 0 — If the source is a wayfinder map

If you're synthesising from a [`wayfinder`](../../../wayfinder/SKILL.md) map (a `KevinKab2412/planning` issue with
closed decision tickets), pull every closed sub-issue's title, body, and **resolution comment** first —
those resolutions are the decisions. Build the spec from them, and **link each spec section back to the
ticket URL it came from** so the implementer can open the primary source instead of trusting a summary.
The map may hold far more decisions than a single grill; expect a dense spec.

## Step 1 — Explore the repo

Before writing anything, read the codebase to understand current state. Use the project's domain vocabulary throughout the spec. Respect any ADRs in the area being touched.

## Step 2 — Identify test seams

Identify the seams at which the feature will be tested:
- Prefer existing seams over new ones.
- Use the highest seam possible — the fewer seams the better; the ideal is one.
- Propose new seams only when unavoidable, at the highest point you can.

If this reveals unclear ownership, a new public interface, a changed dependency direction, or policy
mixed with infrastructure, stop and run [`architecture`](../architecture/SKILL.md). `spec` may confirm
an established seam but must not invent an unsettled one. Confirm the established or
architecture-approved seams with the user via AskUserQuestion before proceeding.

## Step 3 — Write the spec

Synthesise into a spec using this template:

```
## Problem Statement
The problem the user is facing, from the user's perspective.

## Solution
The solution, from the user's perspective.

## User Stories
A numbered list covering all aspects of the feature. Format:
1. As a <actor>, I want <feature>, so that <benefit>.
(Be exhaustive — every edge case, every actor.)

## Implementation Decisions
- Modules that will be built or modified
- Interface changes
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions
(No file paths or code snippets unless a prototype snippet encodes a decision
more precisely than prose — if so, inline only the decision-rich parts.)

## Architecture Contract
Include the approved contract from /architecture verbatim when one exists:
- behavioral slice and module
- protected policy and knowledge owned
- interface guarantees
- allowed and forbidden dependencies, including boundary data
- expected neighborhood and out-of-scope behavior
- hard guards and diagnostic signals
- escalation conditions and checkpoint cadence
If the work stays behind an established seam, name that seam and its existing guards instead of
manufacturing a new contract.

## Testing Decisions
- What makes a good test for this feature (external behaviour, not internals)
- Which modules will be tested
- Prior art in the codebase (similar existing tests)

## Out of Scope
What this spec explicitly does not cover.

## Further Notes
Anything else relevant.
```

Show the spec to the user. Ask if anything needs adjusting before opening the issues.

## Step 4 — Write the GitHub plan

Follow [GITHUB-ISSUES.md](GITHUB-ISSUES.md) for the exact `gh` commands. In order:

1. **Ensure the labels exist** (`spec:epic`, `spec:task`, `blocked`, `needs-human`,
   `architecture:checkpoint`) — idempotent.
2. **Create one epic issue** (`spec:epic`), title = original task (≤180 chars), body = the full spec
   from Step 3. If a prototype settled a design question upstream, attach its branch pointer + verdict
   as a comment on the epic so it travels with the plan.
3. **Tag the epic's stack** (`stack:react`, `stack:dagster` — both exist in `KevinKab2412/planning`). Read the
   signal from two places and add a label when *either* points that way:
   - **The repo's stack** — React/Next.js if `package.json` carries `react`/`next` deps or the tree has
     `*.tsx` files; Dagster if code `import`s `dagster`, the tree has a `dg`/Dagster project layout, or
     `*.py` files define assets.
   - **The task content** — what the spec's Implementation Decisions actually touch, since a repo can
     hold both stacks and this work may exercise only one.

   Apply `stack:react` and/or `stack:dagster` to the epic accordingly; detecting neither means no stack
   label. These labels are what makes `implement` and `code-review` run their stack-specific
   `best-practices` step conditionally — an unlabelled epic skips it, so a wrong label sends the wrong
   guidance downstream. Add them with `gh issue edit -R $R $EPIC_N --add-label "stack:react"`.
4. **Create one task sub-issue per atomic, independently-shippable behavioral slice** derived from the
   Implementation Decisions and User Stories. A slice may cross several layers, but it stays inside one
   architectural neighborhood and leaves a coherent abstraction rather than a structurally unfinished
   horizontal fragment. Each task body carries scope, human-approved acceptance examples, the confirmed
   test seam, the relevant architecture-contract subset, hard guards, and escalation conditions. Link
   each as a sub-issue of the epic.
5. **Wire ordering and gates in a second pass:** add `blocked` (+ a `Blocked by #N` body line) for any
   task that depends on another; add `needs-human` to any task doing an irreversible operation
   (migration, schema change, external API write) so `implement` stops for approval there. Add
   `architecture:checkpoint` where the contract requires inspection before the next task or batch.
6. **Show the user the compact tree** — epic #, task #s + one-line titles, which are blocked, which are gated.

**No `gh`?** Produce the spec + task list as a Markdown checklist and tell the user GitHub tracking was
skipped. The issues *are* the plan — there's no local DB.

Hand back the epic number — [`plan-review`](../plan-review/SKILL.md) and [`implement`](../implement/SKILL.md) work from it.
