---
name: pair
description: Full spec-to-ship pipeline that orchestrates the individual engineering skills with human strategic gates and bounded agent autonomy — optional research and design sketch, grill, optional prototype and architecture contract, spec, plan review, test-backed implementation in fenced slices, architecture checkpoints, code review, taste, and polish. Use when the user says /pair, "pair with me", "pair on this", "let's build this together", "walk me through building", or wants to take a feature or fix end-to-end without surrendering architectural judgment to agents. Each stage remains usable alone; pair sequences them and loops when evidence changes the design.
---

# /pair — Spec-to-Ship Pipeline (orchestrator)

`pair` doesn't do the work itself — it **sequences the stages** and holds the human gates and
loop-backs between them. Most stages are reference modules under [`references/`](references/) that
`pair` reads and follows in turn; a few — `grill`, `research`, `code-review` — remain standalone
skills it calls. The detail lives in each stage's file, not here.

## Workflow memory lifecycle (automatic)

The shared protocol at [`references/memory/workflow-memory.md`](references/memory/workflow-memory.md)
is active for every ordinary `pair` run. Memory remains advisory and fail-open under that protocol.

Before entering the first selected stage, resolve the current user instruction, normalized project
identity, repository guidance, any existing planning issue state, and any applicable architecture
contract or decision record. Then open one outer workflow-memory session through the shared protocol.
Do not let recalled context choose a stage, approve a gate, revise a plan, or alter those authorities.

Pass the active session to every memory-aware stage invoked by `pair`. Those stages inherit it: they
may capture their own qualified durable events but do not open or close memory again. After a durable
event in the pair pipeline, apply the shared capture procedure immediately; user acceptance is
required before a decision qualifies.

Close the outer session through the shared protocol when `pair` completes, explicitly pauses or
stops, or hands work out of the workflow. A transition between stages inside the same pair run is not
a handoff. Memory outcomes never change pair's gates, state, or next transition.

```
worktree → [research] → [sketch] → grill → [prototype] → [architecture] → spec → plan-review
    → { implement → [architecture checkpoint] } → code-review → taste-review → polish
```

Bracketed stages are optional and fire only when they earn their place. Run each stage by invoking
its skill and following it to completion, then apply the transition below before the next.

## Pre-flight — Worktree (automatic)

`pair` runs against a **dedicated worktree for the feature branch**, so the build never disturbs the
checkout you launched from and parallel work stays isolated. Before the first selected stage — and
before opening the workflow-memory session above — settle the worktree:

1. **Determine the feature branch.** Use the branch the user named; if they named none, derive it
   from the work (e.g. the epic/ticket slug) and confirm it before creating anything.
2. **Check whether a worktree already exists for it:** `git worktree list --porcelain` — a
   `branch refs/heads/<branch>` line means one is already checked out; `cd` into that path and
   continue.
3. **If none exists, run [`worktree`](../worktree/SKILL.md)** for that branch (it cuts a new branch
   from the base when the branch doesn't exist yet, or attaches to the local/origin branch when it
   does) and `cd` into the worktree it reports before proceeding.

Everything after this — grill, spec, implement, review — runs inside that worktree. If you're already
standing in the right worktree for the branch, this is a no-op: note it and move on.

`pair` presumes the decision to build is **already made** — it's the commitment end of a longer arc.
If whether to build (or what) is still open, settle that *before* `pair`, not as a stage inside it —
`pair` doesn't reopen the question of whether to build:

```
(should we? / what?)  →  /pair { understand → fence → build in bounded slices → verify }
```

When the *planning itself* is too big for one session — foggy, dependent decisions, work you'd want to
parallelise — the front of this pipeline (grill) is replaced by [`wayfinder`](../wayfinder/SKILL.md),
which maps decision tickets over many sessions and hands `spec` a resolved map. Then `pair` picks up
from spec onward. `wayfinder` is the plan-phase orchestrator; `pair` is the build-phase one.

## Stage 0 — Research (optional)

If the idea hinges on facts you don't have — an unfamiliar API, a library choice, domain knowledge,
real-world UI patterns — grounding the grill in facts beats grilling on guesses. Offer it:

```
question: "This depends on <the unknown>. Research it first so we grill on facts, not guesses?"
options:
  - "Yes, research first (Recommended)"
  - "No, I know enough — start grilling"
```

If yes, run [`research`](../research/SKILL.md) (it works AFK in a background agent and writes cited
findings to a file); carry those findings into the grill. If the idea is well-understood already,
skip straight to Stage 0.5 (or Stage 1).

## Stage 0.5 — Design Sketch (optional)

Before grilling from zero, the agent can lay its cards on the table: a coarse, forward-looking sketch
of *how it would build this* — data flow, load-bearing pseudo-code, the design decisions it's making
and why, and where it's still guessing. You react to a concrete strawman instead of abstract
questions, and get the seat back — this is where you impart counter-thinking the agent didn't reach
for. Offer it:

```
question: "Want me to sketch how I'd build this first — approach and design decisions laid out to argue with — before we grill?"
options:
  - "Yes, sketch it first (Recommended)" → run the sketch-change skill
  - "No, straight to grilling" → skip to Stage 1
```

If yes, run [`sketch-change`](references/sketch-change/SKILL.md) — it writes a plain-English, bright-intern
HTML sketch (analogies over abstraction, like `code-review`) and opens it. You mark it up; the
transition into the grill depends on what's left open:

- **Sketch settled it** → approach agreed, guesses answered. Offer to **shorten or skip the grill**.
- **A core decision got blown up** → the grill earns its keep. Carry the contested decision and the
  open **Where I'm guessing** items in as its **opening agenda**, so it starts from the real gaps.

Keep it coarse — a strawman to steer, not a spec. Exact fields and signatures stay `spec`/`plan-review`'s job.

## Stage 1 — Grill

Run [`grill`](../grill/SKILL.md) to reach shared understanding and maintain the domain model. It
finishes with a decision log plus any CONTEXT.md / ADR updates. Those feed the spec.

## Stage 1.5 — Prototype (optional)

Most decisions resolve in the grill. Some — **"how should it look?"**, **"how should it behave?"**,
**"does this state model feel right?"** — are guesses until you see them running. When the grill hits
one that's *load-bearing* and you'd be guessing without a running artifact, offer it:

```
question: "One decision here — <the design question> — is hard to settle in the abstract. Prototype it before we spec?"
options:
  - "Yes, prototype it (Recommended)" → run the prototype skill
  - "No, I can decide from discussion" → carry the decision into the spec as prose
  - "Not sure — talk it through first" → keep grilling, re-offer if it stays fuzzy
```

If it's cheap to describe in words, skip it — the discussion already resolved it (Litt's fidelity
ladder: pay for a prototype only where a running artifact tells you something prose can't). If yes,
run [`prototype`](references/prototype/SKILL.md); it captures the verdict durably (and lifts any validated
logic module into place) without ever branching or committing the throwaway artifact. The verdict —
plus the knob settings it depends on — joins the decision log and rides into the spec, so `implement`
builds against a settled design.

## Stage 1.75 — Architecture fence (conditional)

Do not run an architecture ceremony for every feature. First ask whether the behavior stays behind an
established interface and obeys an established dependency direction.

Run [`architecture`](references/architecture/SKILL.md) in review mode when any of these are true:

- ownership of the behavior is unclear or recent changes scatter across unrelated areas;
- the work creates or changes a public interface, module seam, dependency direction, or boundary data;
- the feature crosses policy and infrastructure or requires a new adapter;
- the implementation agent would otherwise need authority to decide where the behavior belongs.

If the seam is settled, carry the existing module rules and guards forward and skip this stage. If it
is not, architecture diagnoses the change pressure, the human selects between alternative designs,
and the resulting **architecture contract** joins the decision log. A contract is a fence, not a large
up-front plan: it governs one coherent architectural neighborhood, authorizes current behavior, states
what decisions remain human, and says when to inspect the result.

## Stage 2 — Spec

Run [`spec`](references/spec/SKILL.md) to synthesise the grill decision log, any prototype verdict, and any
architecture contract into a spec and GitHub epic with atomic child task sub-issues in
`KevinKab2412/planning`. It hands back the
epic number. `spec` is also where the epic gets its `stack:*` labels (e.g. `stack:react`,
`stack:dagster`) — those labels are what later route `best-practices` guidance into `implement` and
`code-review`.

## Stage 3 — Plan Review

Run [`plan-review`](references/plan-review/SKILL.md) on the epic. Transition on its gate:
- **Looks good** → Stage 4.
- **Loop back** → re-run `grill` with the findings as opening context, update the plan via `spec`,
  then re-run `plan-review`. Repeat until it passes or the user explicitly accepts.
- **Accept with caveats** → annotate the issues and proceed.

## Stage 4 — Implement

Run [`implement`](references/implement/SKILL.md) — it spawns a fresh subagent from issue data and grants it
autonomy only inside the approved architecture contract. One batch is normally one complete behavioral
slice; several related tasks may share a batch only when they stay behind the same settled interface.
Wait for it to return. If it hits `needs-human` or a contract escalation condition, surface the reason
and wait for approval. When the epic is stack-labelled (`stack:react` / `stack:dagster`),
`implement` reads those labels and applies the matching `best-practices` guidance as it builds — this
isn't a separate stage; the wiring lives inside `implement`.

When the contract requires a checkpoint, run [`architecture`](references/architecture/SKILL.md) in checkpoint
mode against the exact isolated batch patch or commit range returned by `implement`, not the cumulative
working diff, before starting the next batch:

- **Continue** → persist the accepted checkpoint, close its task, and authorize the next related slice.
- **Reorganize first** → persist it, create or revise the bounded cleanup task, execute it, and
  checkpoint the combined isolated patches before closing either task.
- **Human decision** → persist the open decision and stop; revise and record the contract with the user
  before implementation resumes.

This is supervised strategically, not tactically: the implementation agent runs without a human
watching each edit, while executable guards and architecture checkpoints keep autonomy bounded.

## Stage 5 — Code Review

Run [`code-review`](../code-review/SKILL.md) — Standards + Spec review of the diff against the epic,
including the architecture contract and any approved checkpoint revisions. When the epic is
stack-labelled (`stack:react` / `stack:dagster`), `code-review`
reads those labels and folds the matching `best-practices` guidance into the Standards axis — again not
a separate stage, the wiring lives inside `code-review`. On acceptance it closes the epic and shows
the final summary.

**Intent trace (if a Stage 0.5 sketch exists).** Hand the sketch from `docs/sketches/` to `code-review`
as *intent-origin context* — where we started and why. The reviewer contrasts the intended end-state
against what shipped and tells that story: which contested design decisions landed, and where the
direction changed. Divergence from the sketch is **not** a defect — the sketch is coarse and pre-grill,
and the design legitimately evolves through the grill and the pipeline; a deliberate course-correction
is exactly the point. What the reviewer flags is *unexplained* drift — a change with no trace to a
grill decision or a spec choice. The **spec/epic stays the acceptance bar**, not the sketch.

## Stage 6 — Taste Review

Run [`taste-review`](references/taste-review/SKILL.md) — a dedicated taste pass over the ambiguous
decisions `code-review` doesn't adjudicate: UI, prose, and naming choices where more than one
option is defensible and the question is which one *reads* right. It's grounded in the target repo's
`design-patterns/patterns.md`, which is the codebase's own record of settled taste — if that file is
missing, warn the user and pause rather than inventing taste from nowhere, since without it the pass
has nothing to anchor against. Surface its calls and let the human accept or push back before moving
on.

## Stage 7 — Polish

Run [`polish`](references/polish/SKILL.md) on the accepted diff as the final pass before it leaves the
session for a team PR. `code-review` and `taste-review` are internal gates; polish is what makes the
change read as team-written rather than agent-driven — and it does two jobs at once. It **de-noises**:
stripping bead ids and bead-speak, ticket references, local-artifact mentions (`PLAN.md`, `NOTES.md`),
agent-to-user chatter, and comments the code already says, keeping only the load-bearing WHY. And it
**simplifies**: tightening naming, structure, and derivability so the change reads the way a teammate
would have written it in the first place. This is the last stage: after it the change is ready for a
human to open the PR (e.g. via `to-pr`).

## Escape hatches

- **"stop pair"** / **"exit pair"**: save current state (which stage, which issues exist) and hand back control.
- **"skip to execution"**: jump to Stage 4 using whatever task issues currently exist. Warn that the plan hasn't been reviewed.
- **"pair resume"**: find the most recent open epic via `gh issue list -R KevinKab2412/planning --label spec:epic --state open --json number,title,url` and pick up from the last completed stage.
