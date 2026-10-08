# Future extension: ephemeral interfaces & micro-worlds

> Two of these are now active skill behaviour through [`to-visual`](../../to-visual/SKILL.md)'s
> beat player: the **step-through walk** (code + live runtime cards, see
> [`step-through.md`](step-through.md)) and **animated concept scenes** (a metaphor that moves,
> one beat per keypress). This file remains the roadmap for what that player does not cover:
> free timeline scrubbers with comments, input-driven before/after simulations, and
> DIY-migration games. Read it when a beat-by-beat animation is too small for the change.

## The idea, and why it's separate

Geoffrey Litt's talk describes three techniques for staying in the loop with agent-written
code: **explanations**, **micro-worlds**, and **shared spaces**. `code-review`'s explain mode
implements the first. This doc is about the second.

An **explanation** is something you *read*. A **micro-world** is something you *live in*: an
ephemeral debugger, a step-through timeline, a simulation, or a "do-it-yourself" game that
builds intuition a document can't. Litt's examples:

- A **timeline debugger** for a Prolog interpreter — scrub step-by-step through the
  interpreter's internal state, leave comments on the timeline, feel the machine.
- A **framework-migration game** — old site on the left, new on the right, click "next" to
  run each migration step and watch files move into place, getting the benefit of doing the
  port by hand without the pain.

The point is never the software — it's that *you come away changed*, with intuition you can
recombine into the next idea. That's "understanding to participate," not just to verify.

**Why it's not in the core skill.** Micro-worlds are high-effort and high-slop-risk. A bad
one is worse than no figure at all — interactivity used as a crutch produces slop. Keeping
the explainer tight (background → intuition → literate diff → quiz) is what makes it trigger
reliably and stay trustworthy. Micro-worlds should be an *explicit escalation*, invoked when
a static doc genuinely can't convey the change — never the default.

## Where the line sits today vs. later

| | Core skill (today) | This extension (later) |
|---|---|---|
| Output | One self-contained HTML explainer | The explainer **plus** a linked micro-world, or a standalone one |
| Interactivity | Light, illustrative figures inside the doc (an SVG you can drag) | A full ephemeral app: timeline scrubber, state inspector, DIY game |
| State | None or trivial | Models real program state / a real sequence of steps |
| When | Every run | Only when the change is dynamic, stateful, or spatial enough to earn it |

The core skill already permits a *small* interactive figure. The boundary: if the figure
needs its own data model, a time axis, or more than ~30 lines of JS, it has become a
micro-world — route it here instead of inlining it.

## When a micro-world is warranted (the gate)

Escalate only when at least one is true, and a static figure has been ruled out:

- **Stateful over time** — the change is about *how state evolves* (an interpreter step
  loop, a reducer, a state machine, a scheduler). A timeline the reader can scrub beats any
  prose.
- **Spatial / geometric** — coordinate transforms, layout, rendering, physics. Let the
  reader drag inputs and watch outputs.
- **A sequence of mechanical steps** — a migration, a codemod, a multi-file refactor. A
  "run it step by step" game gives the feel of having done it by hand.
- **Hard to believe without seeing** — a perf change or concurrency fix where the reader
  won't trust the claim until they watch it happen.

If none hold, a paragraph and maybe one static SVG is the right, honest amount of effort.

## Three patterns to implement

### 1. Timeline / state scrubber
Instrument the changed code path to emit a trace of `{step, label, state}` records, embed the
trace as a JSON literal in the HTML, and render a slider + a state view that updates as you
scrub. Add a comment feature (Litt does) so the reader can annotate steps for later. Best for
interpreters, reducers, state machines, event loops.

Build sketch: capture the trace with a tiny harness the skill writes (not by hand), cap the
step count, and pretty-print state at each step. The reader learns the machine by moving
through it.

### 2. Before/after simulation
Two panels, shared controls. The reader manipulates an input (drag a point, change a value,
toggle a flag) and sees old-behaviour vs new-behaviour side by side. Best for spatial changes
and anything where the *difference* is the lesson.

### 3. Do-it-yourself game
Reconstruct the change as a guided sequence the reader drives with a "next" button: each step
shows the command/edit being applied and animates the result (files moving, tree changing).
Best for migrations and large mechanical refactors, where reading the script conveys nothing
but watching it unfold conveys everything.

## Design rules carried over from the core skill

- **Intuition before mechanism** — the micro-world illustrates an idea already stated in
  prose; it is never the reader's first contact with the change.
- **Self-contained** — one HTML file, inline CSS/JS, trace data embedded as a literal. No
  external fetches, no build step, no server. It must open from `file://` and survive being
  emailed or committed.
- **Taste over spectacle** — if the interaction doesn't teach something the prose can't,
  cut it. A crutch is worse than nothing.
- **Ephemeral by contract** — this is a lens for understanding, not software to ship or
  maintain. Say so in the doc so nobody mistakes it for production code.

## How to add it to the skill when the time comes

1. Add a new gate section to `SKILL.md`: "Escalate to a micro-world when …" pointing here.
2. Add `assets/microworld-*.html` skeletons (one per pattern) mirroring `template.html`'s
   self-contained style, each with a documented data slot (the trace array, the input model).
3. Instruct the skill to write the tracing harness that produces the embedded data, run it,
   and inline the result — never hand-fabricate the trace.
4. Extend the quiz to include one question the reader can only answer by having used the
   micro-world — that keeps the interaction honest rather than decorative.
5. Consider a **shared-space** follow-on (Litt's third technique): if the team uses Notion,
   emit the explainer to a collaborative page so review happens in a shared space with
   comments, instead of alone on one machine. This is a separate axis from micro-worlds and
   could be its own extension doc.
