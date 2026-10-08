---
name: to-visual
description: >
  Turn one concept into an animated, beat-by-beat HTML explainer: a 1920×1080 composition that
  pauses after each beat, silent, with one caption per beat. For a code change it builds a concept
  view: the concepts the change touches, a watch recorded from the change's own tests (each beat is
  one real request, each row one real database row), a playable concept machine, and a quiz. For an
  idea, it animates the concept, explained through a familiar concept first and code-editorial beats
  for code. Also plays the step-through walk JSON. Draws on a concept library (Jackson's concepts,
  Litt's patterns) that agents extend. Other skills call it when their gate says the idea changes
  over time: explain-this-like-I-am-an-intern, code-review's explain mode, show-me, spec,
  sketch-change. Or run it directly with "/to-visual <concept or PR>". Writes one self-contained HTML
  page (or an inline fragment), checks every beat in a browser, and opens it.
argument-hint: "What should I animate? (a concept, a PR or diff, a mechanism — or a walk JSON)"
---

# to-visual

Make **one** idea click by watching it happen. The output is a live HTML page: a 1920×1080 stage
cut into 6–12 **beats**. The player plays a beat, then stops, so the reader sets the pace
(→ next or skip to the beat's end, ← back, space play/pause, R replay). It is silent; each beat has
one caption. It sits beside an explanation that is already written.

The reader is usually Kevin, an engineer digesting code that an agent wrote. So for a code change,
show **what the code really does**, recorded from its own tests, and name the **concepts** it touches.

Read [`references/design-language.md`](references/design-language.md) before storyboarding. For a code
change, follow [`references/concept-view.md`](references/concept-view.md). For a hand-built scene, read
[`references/authoring.md`](references/authoring.md); templates and the walk schema are in
[`references/templates.md`](references/templates.md).

## Start from the library

Before storyboarding a concept, look it up. The seed ships in [`library/`](library/README.md); agents'
additions live in the private overlay `~/.agents/to-visual/library/`:

```bash
grep -ril "<concept>" <this-skill>/library ~/.agents/to-visual/library 2>/dev/null
```

A card gives you the purpose, the familiar concept to explain it through, the misconception to stage
as the trap beat, the operational principle to animate, and how it's usually drawn. If you explain a
concept or invent a pattern that isn't there, **add a card to the overlay** (never to this public
repo), tagged `origin: <agent> <date> · <repo>#<PR>`. Entries go live at once; Kevin prunes later.

## Inputs

A calling skill (or the user) passes what it has; ask only for what's missing and can't be inferred.

| Input | Meaning | Default |
|---|---|---|
| concept or change | the one idea to show, or a PR / branch / diff | required |
| familiar concept | what the reader already knows that this is an instance of | from the library card, else you pick one |
| example values | small, real data | recorded from tests for a change; small plausible values otherwise (say so) |
| prose | the explanation already written | none: the page carries only the visual |
| out | output path | `explanations/<visual or concepts>-<slug>-<YYYY-MM-DD>.html` at the repo root, else the cwd |
| mode | `page` (standalone) or `fragment` (inline in a host page) | `page` |

## The gate

Animate only when the idea **changes over time** (a pipeline, a mechanism, a state machine,
concurrency, a migration, data moving through stages) **and** a static figure has been ruled out.
The shared wording is the "Animated walkthrough" rung in
[`references/show-me/visual-formats.md`](references/show-me/visual-formats.md). If the gate doesn't
fire, say so and hand back without a file: a missing animation should read as a choice.

## Steps

1. **Storyboard first.** Write the beats as a small table: `# · caption (≤ 12 words) · what moves ·
   state after`. One idea per beat. Animate the concept's **operational principle**, and include a
   **trap** beat: the reader's likely wrong concept, shown being wrong.
2. **Pick the template.**
   - **concept view** (a code change with runnable tests): inventory → recorded watch → play → check.
     Follow `concept-view.md`: export the change, record a trace with `scripts/record_trace.py`, and
     write a view spec. Example: [`assets/examples/trash.view.json`](assets/examples/trash.view.json).
   - **walk** (tracing code as it runs, no recording): write the walk JSON; schema in `templates.md`.
   - **scene** (an idea with no code to run): adapt [`assets/examples/dbt-conveyor.html`](assets/examples/dbt-conveyor.html)
     with the kit (`authoring.md`).
3. **Keep sources next to the output** (`<slug>.view.json` + trace + machine JS, `<slug>.walk.json` or
   `<slug>.scene.html`), so a later edit reworks the source, never the assembled file.
4. **Assemble** (the script inlines the kit, GSAP and your data into one file):

   ```bash
   python3 <this-skill>/scripts/assemble.py --view <slug>.view.json --out <out> [--mode fragment]
   python3 <this-skill>/scripts/assemble.py --walk <slug>.walk.json --out <out>
   python3 <this-skill>/scripts/assemble.py --scene <slug>.scene.html --out <out> [--before b.html --after a.html]
   ```

5. **Verify (required).** Open the page in a browser tool. Read the console: zero errors. Screenshot
   the **end of every beat** with `<out>?beat=N` (or `window.__visual.seekBeatEnd(N-1)`), and look
   for overlaps, clipped text, stray dots, panels half-covering content, and frames that sit too high
   or low. Click through the play machine once and answer one quiz question. Fix, re-assemble,
   re-check. No browser tool available → say verification was skipped.
6. **Hand back.** `open` the page (page mode). Return to the caller:
   - the output path (and the source paths)
   - the beat captions, numbered
   - **one quiz hook**: a question only answerable by having watched it

   Your chat reply stays short: the path, one line on what it shows, and the hook.

## Callers

| Caller | When | Mode |
|---|---|---|
| `code-review` explain mode | an agent-written change: concept view when the tests can be recorded, else a walk or scene | fragment in the explainer |
| `explain-this-like-I-am-an-intern` | the subject is a process or mechanism and the gate fires | page, opened beside the chat explanation |
| `show-me` | the shape changes over time | page |
| `spec`, `sketch-change` (via `pair`) | the proposed flow is easier watched than read | page, linked from the spec / sketch |

## What this is not

Not a video editor and not decoration. No narration, music or MP4 (the composition keeps the
HyperFrames shape, so `npx hyperframes render` stays possible later, untested). The recorder only
reads: it runs a change's tests on an exported copy and never writes to the repo under review. One
idea per page: if the storyboard needs two ideas, make two pages or cut one.
