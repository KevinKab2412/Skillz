# Step-through walks

A **walk** is a stepped animation of code running: source on one side, the machine's
state on the other, one beat per keypress. Corey Schafer's AsyncIO animations are the
canonical feel — you *see* the event loop take turns rather than being told that it does.

The player and the JSON schema belong to the [`to-visual`](../../to-visual/SKILL.md) skill (its
**walk** template, schema in
[`to-visual/references/templates.md`](../../to-visual/references/templates.md)). This file owns
code-review's half: **when** a walk is warranted and **how** explain mode uses it. You supply
data; you do not write JavaScript or a player.

## The gate

Emit a walk only when a static figure has been ruled out **and** at least one holds:

- **Stateful over time** — an event loop, reducer, state machine, scheduler, interpreter.
- **A sequence of mechanical steps** — a migration, a multi-file refactor, a request
  travelling through middleware.
- **Hard to believe without seeing** — concurrency, blocking vs yielding, a perf claim.

Skip syntax, types, "write a function that returns X", and anything a paragraph already
makes obvious. A decorative walk is worse than none.

When the change is better told as a *concept* than as a code trace — data moving through
stages, a before/after mechanism — ask `to-visual` for a **scene** instead of a walk.

## How code-review uses it

After the intuition section, if the gate fires:

1. Write the walk JSON (title, lede, panes, steps, cards; 8–24 steps; each caption one teaching
   sentence about what *this* step changes) to `explanations/explain-<slug>-<date>.walk.json`.
2. Invoke `to-visual` via the Skill tool with that JSON, `mode: fragment`, and the explainer's
   path. It assembles the player, checks every beat in a browser, and returns the fragment plus
   a quiz hook.
3. Paste the fragment into the explainer's figure slot (it breaks out of the 720px column and
   ignores the explainer's own `pre` / `figure` styles).
4. Put **one** quiz question that is only answerable after stepping through it (the hook
   `to-visual` returned is a good start).

If the change is about control flow, state, concurrency, or a multi-step migration, the explainer
must include that walk. If the gate does not fire, say so — a missing walk should read as a
choice, not an omission.

Other consumers: `learn-course` (the Learning repo's `build-course`) still ships its own copy of the
old `stepper.html`; the JSON schema is unchanged, so it can switch to `to-visual` without new data.

## Taste

The walk illustrates an idea already stated in prose. It is never the reader's first
contact with the change. If the interaction does not teach something the caption can't
say in one sentence, delete the walk.
