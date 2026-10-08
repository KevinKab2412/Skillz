---
name: show-me
description: >
  Explain the current topic *visually* instead of in a wall of prose — a compact diagram, a
  code-shape sketch, or one focused HTML artifact. Pick the smallest view that makes the point:
  pseudocode for logic, a call tree for control flow, a component tree for UI structure, a shallow
  file tree for where code lives, a Mermaid sequence/state diagram for interaction over time, a
  shape-matched diff for what changes, or a single focused HTML file for anything too dense for the
  rest. Place each visual next to the short line it supports and don't overwhelm. Reach for it on
  "/show-me", "show me this", "show me how X works", "visualise this", "diagram this", "sketch the
  shape of this", "draw the call flow / component tree / file layout", or point it at a route,
  service, feature, PR, or the current discussion. Great for settling the shape of a change before
  any code is written.
argument-hint: "What should I show? (or nothing — I'll visualise the current topic)"
---

# show-me

Explain the current topic of conversation **visually**. Skip the preamble, keep prose brief, and let
the picture carry the load. The point is comprehension: the reader parses a tree, a flow, or a diff
almost for free, where a dense paragraph makes their eyes glaze over.

The full format menu and the taste rules live in
[`references/show-me/visual-formats.md`](references/show-me/visual-formats.md) (the shared `show-me`
module). Read it, then work like this:

1. **Find the shape worth showing.** What's the reader actually asking to see — how components nest,
   how control flows, where code lives, what changed, how a sequence unfolds? Ground it in the real
   sources (the codebase, the diff, the docs), not your memory of how such things usually look.
2. **Pick the smallest view that makes it clear.** Pseudocode, call tree, component tree, file tree,
   Mermaid sequence/state, a shape-matched diff, a whole block, or — only when a text format can't
   carry it — one focused HTML file you `open` for the reader. When the shape **changes over time**
   and the "Animated walkthrough" gate fires, the top rung is the [`to-visual`](../to-visual/SKILL.md)
   skill (invoke it via the Skill tool): a beat-by-beat animated page. Match a diff to the shape it
   changes (component tree for UI, file tree for layout, call tree for control flow, pseudocode for
   state).
3. **Put each visual next to the one short line it supports.** Keep only the calls, files, props,
   states, and boundaries the current question needs. Use one format, sometimes a few, almost never
   all of them — don't overwhelm.

## When this fires on its own

Reach for it whenever the user asks to *see* rather than read — "show me", "visualise this",
"diagram this", "what does the call flow look like", "sketch the file layout". It's also the natural
move while settling the shape of a change before writing code: draw the target types, signatures, and
layout so the design is legible before it's built.

## What this is not

Lightweight and stateless — one or more visuals inline (or one HTML file), then move on. It doesn't
open a workspace, run a quiz, or persist anything. For a full teaching walkthrough of a code change
(background → intuition → literate diff → quiz), that's `code-review`'s explain mode; for
re-explaining something that lost the reader from scratch, that's `explain-this-like-I-am-an-intern`;
for an animated, beat-by-beat walkthrough, that's `to-visual`. The first two already reach for these
same visuals — this skill is the direct "just show me" button.
