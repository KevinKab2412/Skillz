---
name: to-visual
description: >
  Turn one concept into an animated, beat-by-beat HTML explainer: a 1920×1080 composition that
  pauses after each beat, silent, with one caption per beat. Ideas get a Vox-style metaphor (a dbt
  pipeline as a conveyor belt, a queue as a mailbox); code gets code-editorial beats where one coral
  accent links a line to the part of the picture it drives. Also plays the step-through walk JSON
  (code plus live state cards). Other skills call it when their gate says the idea changes over
  time — explain-this-like-I-am-an-intern, code-review's explain mode, show-me, spec, sketch-change
  — or run it directly with "/to-visual <concept>". Writes one self-contained HTML page (or an
  inline fragment), checks every beat in a browser, and opens it.
argument-hint: "What should I animate? (a concept, a pipeline, a mechanism — or a walk JSON)"
---

# to-visual

Make **one** idea click by watching it happen. The output is a live HTML page: a 1920×1080 stage
cut into 6–12 **beats**. The player plays a beat, then stops, so the reader sets the pace
(→ next or skip to the beat's end, ← back, space play/pause, R replay). It is silent; each beat has
one caption. It augments an explanation that is already written. It does not replace that text.

Read [`references/design-language.md`](references/design-language.md) before storyboarding and
[`references/authoring.md`](references/authoring.md) before writing a scene. The templates and the
walk JSON schema are in [`references/templates.md`](references/templates.md).

## Inputs

A calling skill (or the user) passes what it has; ask only for what's missing and can't be inferred.

| Input | Meaning | Default |
|---|---|---|
| concept | the one idea to show | required |
| analogy | the metaphor, if the caller already chose one | you pick one from the metaphor menu |
| example values | small, real data (4 rows, not "N rows") | invent small, plausible values and say so |
| prose | the explanation already written | none: the page carries only the visual |
| out | output path | `explanations/visual-<slug>-<YYYY-MM-DD>.html` at the repo root, else the cwd |
| mode | `page` (standalone) or `fragment` (inline in a host page) | `page` |

## The gate

Animate only when the idea **changes over time** (a pipeline, a mechanism, a state machine,
concurrency, a migration, data moving through stages) **and** a static figure has been ruled out.
The shared wording lives in [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md)
(the "Animated walkthrough" rung). If the gate doesn't fire, say so and hand back without a file:
a missing animation should read as a choice.

## Steps

1. **Storyboard first.** Before any code, write the beats as a small table: `# · caption (≤ 12 words)
   · what moves · state after`. One idea per beat. Include the **trap** beat (the misconception a
   newcomer forms, shown being wrong). Check it against the design-language rules.
2. **Pick the template.**
   - **walk**: tracing code as it runs (event loop, reducer, request through middleware). Write
     the walk JSON; no JavaScript. Schema in `templates.md`.
   - **scene**: a concept metaphor, optionally with one code beat. Copy
     [`assets/examples/dbt-conveyor.html`](assets/examples/dbt-conveyor.html) and adapt it with the
     kit (`authoring.md`). Keep its shape: world (moves with the camera), hud (fixed), one script.
3. **Write the source next to the output**: `<out-dir>/<slug>.scene.html` or `<slug>.walk.json`, so a
   later edit reworks the source, never the assembled file.
4. **Assemble** (the script inlines the kit, GSAP and the scene into one file):

   ```bash
   python3 <this-skill>/scripts/assemble.py --scene <slug>.scene.html --out <out> \
     [--mode fragment] [--before before.html --after after.html] [--title "…"]
   python3 <this-skill>/scripts/assemble.py --walk <slug>.walk.json --out <out>
   ```

5. **Verify (required).** Open the page in a browser tool. Read the console: zero errors. Screenshot
   the **end of every beat** with `<out>?beat=N` (or `window.__visual.seekBeatEnd(N-1)`), and look
   for overlaps, clipped text, stray dots, panels half-covering content, and frames that sit too high
   or low. Fix the scene, re-assemble, re-check. The prototype's first pass had five such bugs; this
   step is where they get caught. No browser tool available → say verification was skipped.
6. **Hand back.** `open` the page (page mode). Return to the caller:
   - the output path (and the source path)
   - the beat captions, numbered
   - **one quiz hook**: a question only answerable by having watched (e.g. "at beat 4, which box
     was still messy?"), for callers that quiz

   Your chat reply stays short: the path, one line on what the animation shows, and the hook.

## Callers

| Caller | When | Mode |
|---|---|---|
| `explain-this-like-I-am-an-intern` | the subject is a process or mechanism and the gate fires | page, opened beside the chat explanation |
| `code-review` explain mode | a runtime/mechanism beat or a code trace (the old step-through walk) | fragment in the explainer's figure slot |
| `show-me` | the shape changes over time | page |
| `spec`, `sketch-change` (via `pair`) | the proposed flow is easier watched than read | page, linked from the spec / sketch |

## What this is not

Not a video editor and not decoration. No narration, music or MP4 (the composition keeps the
HyperFrames shape, so `npx hyperframes render` stays possible later, untested). One idea per page:
if the storyboard needs two ideas, make two pages or cut one.
