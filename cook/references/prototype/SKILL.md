---
name: prototype
description: Build a throwaway, interactive prototype that answers a design question BEFORE you commit to implementing — so you can engage with real running logic or UI, feel how it behaves, and decide whether it's the outcome you actually want. Use whenever "how should this look?" or "how should this behave?" or "does this state model feel right?" is the open question and prose can't settle it: "prototype this", "spike this", "mock this up", "let me see it working first", "I'm not sure how this should work until I try it", "throwaway version", "help me decide between a few layouts", or when a grilling/spec discussion hits a decision only a running artifact can resolve. This is the forward bookend of the code-review understanding loop — reach for it at design time, before the build, not after. Do NOT use it to build production code, ship a feature, or fix a real bug — a prototype is deliberately throwaway.
---

# Prototype

A prototype is **throwaway code that answers a design question**. You build it to *engage* with a
running artifact — press its buttons, watch its state, flip between its variants — so you can
**understand** the design well enough to **decide** whether it's what you actually want, before
committing a single line of production code to it.

It is the **forward bookend of the understanding loop**. [`code-review`](../../../code-review/SKILL.md)
runs *after* a change to help you understand code that already exists; `prototype` runs *before*,
to understand a design that doesn't yet. Both fight the same enemy — cognitive debt — at opposite
ends of the build. The leap from a spec straight to production is large and error-prone; the leap
from a *working prototype* to production is short, because the hard design questions are already
settled and you have real code to lift from.

## Pick a branch — the question decides the shape

Identify the question being answered — from the user's prompt, the surrounding code, or by asking
if the user is around:

- **"Does this logic / state model / data shape feel right?"** → [LOGIC.md](LOGIC.md). Build a
  small, interactive artifact around a *pure, liftable* logic module and drive it by hand through
  the cases that are hard to reason about on paper.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI
  variations on a single route, switchable from a floating bar, and flip between them.

The two branches produce very different artifacts, so getting this wrong wastes the whole
prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever
branch better fits the surrounding code (a backend module → logic; a page or component → UI) and
state the assumption at the top of the prototype.

## Rules that apply to both branches

1. **Throwaway from day one, and clearly marked.** Put the prototype close to where it will
   actually be used so its context is obvious, but name it so a casual reader sees at a glance it's
   a prototype, not production. For throwaway UI routes, obey the project's existing routing
   convention — don't invent a new top-level structure.
2. **One command to run.** Whatever the project's task runner already supports (`pnpm <name>`,
   `python <path>`, `bun <path>`, …). The user starts it without thinking about paths.
3. **No persistence by default.** State lives in memory. Persistence is usually the thing the
   prototype is *checking*, not something it should lean on. If the question is specifically about
   a database, hit a scratch store with an obvious "PROTOTYPE — wipe me" name. The one carve-out is
   the prototype's own chrome — whether the drawer is collapsed is a preference about the tool, not
   state under test, and losing it on every reload is a papercut the user pays repeatedly.
4. **Skip the polish.** No tests, no error handling beyond what makes it runnable, no abstractions,
   no "what if we need X later." The point is to learn one thing fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), show the full
   relevant state so the user can see exactly what changed. A prototype the user can't *read* the
   state of teaches nothing. In a browser prototype this belongs in the collapsible bottom drawer
   ([UI.md](UI.md) step 5) alongside the variant switcher and the knobs — one control surface that
   gets out of the way when the user wants to see the design with nothing on top of it.
6. **Capture it as a primary source when done** — see below.

## Capture — the verdict is the deliverable, the artifact is not

The thing that carries forward is **what the prototype taught**, not the prototype. When the question
is settled:

1. **Fold the validated decision into the real code.** For logic, the pure module lifts into the
   real module on its own. For UI, the winning variant gets rewritten properly (it was built under
   prototype constraints — no tests, minimal error handling — so it's not production-ready as-is).
2. **Keep the artifact out of git entirely.** **Never create a `prototype/<slug>` branch and never
   commit the prototype.** Copy the finished file to a gitignored directory in the repo — check
   `.gitignore` and use whatever local-notes location the project already ignores, e.g.
   `docs/prototypes/<slug>.html` — so it outlives the session and sits beside its research notes
   without ever entering history. A branch of dead variants is clutter someone later has to reason
   about and delete; the exploration has no value once its question is answered. Don't offer a branch
   as an option.
3. **Record the answer, durably** — the *verdict*, the *question it settled*, and **the knob settings
   the verdict depends on** (a card width or density the decision assumes is part of the decision).
   Plus a lightweight **understanding test**: state the one thing you now understand that you
   couldn't have gotten from prose ("delete-then-undo re-emits the event", "variant C's sidebar
   only works above 900px"). If you can't state it, the prototype hasn't finished its job — keep
   driving it. This mirrors the code-review quiz: don't leave the prototype until you can explain
   what it taught.
4. **Record it where the decision lives** — the spec, an ADR, or the commit message that implements
   it. Since the artifact is never committed, the write-up is the only durable trace, so it has to
   carry the numbers rather than point at something runnable. **Do not post to the work tracker**
   (GitHub issue, Linear ticket, Jira) unless the user explicitly asks — the tracker is a shared team
   surface and what appears there is theirs to write.

Assets created while prototyping are *linked* from the tracker, never pasted into the spec — with
one exception: if a prototype produced a snippet that encodes a decision more precisely than prose
can (a reducer, a state machine, a schema, a type shape), the spec may inline just the decision-rich
part and note it came from a prototype.
