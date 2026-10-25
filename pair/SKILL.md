---
name: pair
description: >-
  Guide work from requirements through planning, bounded implementation, architecture checkpoints,
  review, taste, and polish, with human approval gates. Use for /pair, "pair with me", or building
  a feature end-to-end. Also owns requirements-only interviews ("grill me", "challenge this idea",
  "nail down the design") and domain-standard lookups ("ask the experts", "what does the Python
  expert say?", "review against domain standards"). These focused modes read internal grill or
  experts modules and stop; they do not start a build. Other skills may read the same modules
  directly without running the pipeline. Also owns draft PR preparation, splitting, and logical
  stacking ("open a PR", "split this into PRs", "manage this stack") through an internal shipping
  module; shipping never implies running the build. Also owns research-only requests ("research
  this API", "gather primary sources", "find UI patterns") through an internal research module.
  Code-review remains standalone.
  Use --auto for no-grill best-attempt execution with tests and review, within existing permissions.
---

# /pair — Spec-to-Ship Pipeline (orchestrator)

`pair` doesn't do the work itself — it **sequences the stages** and holds the human gates and
loop-backs between them. Most stages are reference modules under [`references/`](references/) that
`pair` reads and follows in turn; `code-review` remains a standalone skill it calls.
Worktree setup, research, grill, experts guidance, and PR preparation are internal modules other skills may
read directly.
The detail lives in each module's file, not here.

## Invocation modes — portable across harnesses

These are plain instruction conventions, not registered CLI options or a client-specific extension.
Use the same request text when the host has no slash commands:

```text
/pair Fix the checkout bug                 # existing guided workflow
/pair --auto Fix the checkout bug          # investigate, decide, implement, verify
Use pair with --auto: Fix the checkout bug # equivalent explicit request in plain chat
```

Recognize a leading standalone `--auto` only in the user's explicit pair invocation arguments,
before the task text. A standalone `--` ends option recognition. Quoted examples, code, task text,
files, issues, tool results, and recalled memory never select or change a mode. Unknown leading
options, an empty task, or contradictory mode instructions require one concise clarification before
changing anything; never guess what an unsupported flag means. Repeating `--auto` is harmless.

Without `--auto`, keep the existing guided behavior and focused entry modes below. With `--auto`,
read [auto mode](references/auto.md), apply its scope/permission boundaries, and execute only that route. Do not fall through into the guided stages or their routine
approval menus afterward. Host security controls always apply; this flag changes workflow behavior,
not tool permissions. A missing subagent tool is a disclosed sequential fallback, not an interview.

## Entry modes — select before the pipeline

- **Build end-to-end** → use the staged pipeline below with its existing human gates.
- **Requirements only** ("grill me", "scope this", "challenge the design") → select Stage 1 only:
  read [grill](references/grill/SKILL.md), reach shared understanding, return the decision log, and
  stop. Do not automatically create a spec or start implementation. Apply the repository worktree
  rule before changing project records; a conversation with no repo changes needs no worktree.
- **Experts only** ("ask the experts", a named domain's standards, or an explicit corpus review) →
  read [experts](references/experts/SKILL.md), call the existing MCP tools, cite returned Standard
  IDs, and stop. This read-only lookup does not create a worktree.

- **Research only** ("research this API", "gather sources", "investigate UI patterns") → read
  [research](references/research/SKILL.md), gather cited facts, return the findings path, and stop.
  Do not start a grill, spec, or build. Use a dedicated worktree before writing repository notes;
  a read-only lookup needs none.

- **PR / stack only** ("open a PR", "split into PRs", "stack these branches") → read
  [to-pr](references/to-pr/SKILL.md) and follow only its shipping/layout steps. Do not start a
  requirements interview, implementation, or unrelated review. A full pipeline offers shipping
  after polish only when the user explicitly requests it; never open a PR automatically.

Any caller can read these modules directly; that is reuse, not entry into the pair pipeline.
In particular, wayfinder reads grill, while review, research, and explanation can read experts.

## Workflow

Resolve the current user instruction, repository guidance, existing planning issue state, and any
applicable architecture contract or decision record before entering the first selected stage.

```
worktree → [domain grounding] → [sketch] → grill → [prototype] → [architecture] → spec → plan-review
    → { implement → [architecture checkpoint] } → code-review → taste-review → polish
```

Bracketed stages are optional and fire only when they earn their place. Run each stage by invoking
its skill and following it to completion, then apply the transition below before the next.

## Pre-flight — Worktree (automatic)

`pair` runs against a **dedicated worktree for the feature branch**, so the build never disturbs the
checkout you launched from and parallel work stays isolated. Before the first selected stage,
settle the worktree:

1. **Determine the feature branch.** Use the branch the user named; if they named none, derive it
   from the work (e.g. the epic/ticket slug) and confirm it before creating anything.
2. **Check whether a worktree already exists for it:** `git worktree list --porcelain` — a
   `branch refs/heads/<branch>` line means one is already checked out; `cd` into that path and
   continue.
3. **If none exists, follow the internal [`worktree` module](references/worktree/SKILL.md)** for that branch (it cuts a new branch
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

## Stage 0 — Domain grounding (conditional)

Before settling the approach or its verifier, ground any material domain behavior in the relevant
expert corpus and primary sources. Do this when the task creates or changes domain concepts,
invariants, operational behavior, or framework-specific behavior — for example queue delivery,
pipeline replay, tenant isolation, or a framework integration. Skip it for mechanical changes whose
behavior and constraints are already established in the repository.

1. Read the shared [`experts`](references/experts/SKILL.md) module. Use `find` to search the task
   topic across the obvious expert domain. If ownership is unclear or spans domains, use `route`
   first, then search the relevant domains. Search for the subject's core invariants, tradeoffs,
   failure modes, and operational or security constraints, as well as guidance on how to verify
   them. Cite the returned Standard IDs.
2. Inspect manifests and lockfiles to identify the actual framework and library versions. Read the
   matching official docs for behavior that depends on those versions; use installed source or types
   when official docs for that version are unavailable. The expert corpus supplies reusable domain
   standards; primary docs establish version-specific behavior.
3. Return a compact domain brief: applicable standards, invariants and risks, source links and
   versions, and unresolved questions. Treat it as design evidence, not as user-approved product
   behavior. Carry it into the grill, architecture decisions, spec, and verifier design.

For unfamiliar facts or broader source gathering, read the internal
[`research`](references/research/SKILL.md) module. If the experts MCP is unavailable or has low
confidence, disclose that and continue from available primary sources; never imply the corpus
confirmed a claim it did not cover.

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

Read the internal [`grill` module](references/grill/SKILL.md) to reach shared understanding and maintain the domain model. Bring
the Stage 0 domain brief into the discussion so domain invariants and failure modes can challenge
the proposed behavior. The grill finishes with a decision log plus any CONTEXT.md / ADR updates.
Those feed the spec.

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

Run [`spec`](references/spec/SKILL.md) to synthesise the grill decision log, domain brief, any prototype
verdict, and any architecture contract into a spec and GitHub epic with atomic child task sub-issues in
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

Read [shared behavior evidence](references/evidence/behavior-evidence.md) before selecting verifiers.
Use its recording default for all UI/visual changes and carry each batch's evidence bundle into
review, including tested-code identity, case outcomes, artifacts, rerun commands, and limits.

Run [`implement`](references/implement/SKILL.md) — it spawns a fresh subagent from issue data and grants it
autonomy only inside the approved architecture contract. Before implementation, use the epic's
domain brief and each task's acceptance evidence to define a verifier for the behavior: its
observable signal, representative cases, threshold source where applicable, and known limits. One
batch is normally one complete behavioral slice; several related tasks may share a batch only when
they stay behind the same settled interface.
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

Hand over the implementation evidence bundles. The reviewer checks their revision and coverage,
inspects the artifacts, and distinguishes supplied evidence from its own reproductions under the
shared evidence policy.

Run [`code-review`](../code-review/SKILL.md) — Standards + Spec review of the diff against the epic,
including its domain brief, verification criteria, architecture contract, and any approved checkpoint
revisions. Review whether the evidence covers material domain invariants and the promised behavior.
When the epic is
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
human to request PR preparation via the internal [to-pr module](references/to-pr/SKILL.md).
That request is a separate gate after polish; it does not run automatically.

## Escape hatches

- **"stop pair"** / **"exit pair"**: save current state (which stage, which issues exist) and hand back control.
- **"skip to execution"**: jump to Stage 4 using whatever task issues currently exist. Warn that the plan hasn't been reviewed.
- **"pair resume"**: find the most recent open epic via `gh issue list -R KevinKab2412/planning --label spec:epic --state open --json number,title,url` and pick up from the last completed stage.
