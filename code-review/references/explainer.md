# Explain mode — the teaching artifact

This is `code-review`'s **explain** pass: turn a code change into a document the reader actually
understands, then prove it with a quiz. You reach it three ways:

- The user asks to *understand* rather than *judge* — "explain this diff", "help me understand this
  change", "walk me through this PR", "what did my agent actually do here".
- A review pass didn't land and the user picked **"Explain it"** at the gate.
- `/to-pr` needs a branch explainer to distil into a PR body.

The naive explanation is the raw `git diff`. This does better by inverting the order of *review* into
the order of *teaching*: background before change, intuition before code, and a quiz at the end that
catches the "I thought I understood it" self-deception. The goal isn't to verify the change is
correct — it's to leave the reader able to **participate**: to have the next idea because they
actually hold the change in their head.

Two situations, same document:

- **Author mode** — explaining a change *you* (or your agent) made, before sending it for human
  review. The rule that makes it worth it: **don't send code for review until you can pass its own
  quiz.** The quiz is a speed regulator against shipping code you don't understand.
- **Reviewer mode** — explaining someone else's PR you've been asked to understand or review.

---

## Step 1 — Identify the change and gather context

Figure out what to explain, in this order. Ask only if genuinely ambiguous.

- **A GitHub PR** (URL or number) → `gh pr diff <n>`, `gh pr view <n>` for title/body/context.
- **A branch** ("this branch", a name) → `git diff <base>...HEAD`; infer base from the default branch
  (`git symbolic-ref refs/remotes/origin/HEAD`) or the merge-base.
- **A commit / range** → `git show <sha>` or `git diff <a>..<b>`.
- **Uncommitted work** ("what I just did") → `git diff HEAD` (include staged) and `git status`.

Then **build the mental model you're about to teach from**. Read the changed files at full context —
not just the hunks — plus the surrounding code the change depends on. For a large or unfamiliar
change, dispatch an `Explore` agent to map the affected subsystem so the background is accurate rather
than guessed. Read commit messages and PR descriptions for stated intent, but verify intent against
the code — explain what the change *does*, not only what it claims.

If an intent sketch exists in `docs/sketches/` (from `sketch-change`, written before the build), read
it as the design *origin*: it says what the change set out to be. Narrate intent → outcome — where the
shipped code matches the plan, and where it deliberately went elsewhere. A course-correction is part
of the story, not a fault. Optional: if there's no sketch, skip it.

**Calibrate the audience — write for a bright intern on their first day.** Default: someone sharp but
brand-new, who shares none of this codebase's history and none of its jargon. Lead with the why and
the premise (what problem the change solves, how the system worked before it). Assume zero prior
knowledge: spell out every acronym and tool the first time it appears, and gloss each domain term as
you use it rather than assuming it's held. Write in ASD-STE100 Simplified Technical English, and prefer
a concrete example or a plain analogy over an abstraction — keep the Background block generous, not
tight. Escape hatch: if the user tells you their level, or in author mode clearly knows the area,
honour that and tighten the background accordingly.

## Step 2 — Write the explainer in teaching order

**Construct the teaching content by invoking the
[`explain-this-like-I-am-an-intern`](../../explain-this-like-I-am-an-intern/SKILL.md) skill via the
Skill tool** — it is the source of truth for *how* to explain: lead with the why and the missing
premise, spell out every acronym and domain term on first use, reach for a concrete example before any
abstraction, and name the trap a newcomer would form. Author the sections below from what it produces.
The five-question quiz in Step 3 stands in for its interactive probe, so when you're packaging the
durable artifact you don't block on the back-and-forth — the quiz is the comprehension check.

Copy [`../assets/template.html`](../assets/template.html) to the output path (Step 4) and fill these
sections. This order is the skill — keep it. Delete any section that genuinely doesn't apply; don't
pad.

**1. Background — how the system works today.** Teach the concepts the change *assumes* before
touching the change itself. Lives in a collapsible block ("skip if you know this") so a fluent reader
isn't slowed down. This is what a good textbook does before a hard result.

**2. The idea — intuition before details.** One or two sentences on what the change is really *for*,
then a concrete example or analogy that gives the feel of it. Think of it as a commit message written
a layer deeper. The reader should grasp the essence here, before a single line of code. If you can
only restate the diff in words, you haven't found the intuition yet — dig until you can say *why* in
plain language.

**3. Figure, or an animated walkthrough.** Reach for the *smallest* view that carries the shape,
escalating only as the change demands. Most changes are made legible by a **compact text visual** — a
shallow file tree for where code lives, a call tree for control flow, a component tree for UI
structure, a Mermaid sequence/state diagram for interaction over time, or a shape-matched diff for
what changed. These embed straight in the explainer, read at a glance, and are the default; the menu
and taste rules are in [`show-me/visual-formats.md`](show-me/visual-formats.md). A static SVG is
enough when the change is spatial and doesn't move.

When the change *moves* — the "Animated walkthrough" gate in `visual-formats.md` fires — invoke the
[`to-visual`](../../to-visual/SKILL.md) skill via the Skill tool with `mode: fragment`, and paste the
fragment it returns into the template's figure slot, inline:

- **An agent-written change with runnable tests (Django today)** → a **concept view**: "Concepts this
  change touches" (cards marked NEW / CHANGED, plus a synchronization table with the test behind each
  sync), then the central concept's operational principle **recorded from the change's own tests**,
  then a playable concept machine. to-visual records on an exported copy and never touches the
  checkout under review (`to-visual/references/concept-view.md`). Prefer this whenever the tests can
  run: it shows what the code really does, not what an agent imagines it does.
- **How the machine takes turns** (an event loop, a reducer, a scheduler, blocking vs yielding, a
  migration unfolding) → a **walk**: Corey Schafer's move, source on one side and live state cards on
  the other. Write the walk JSON per [`step-through.md`](step-through.md); no custom JavaScript.
- **What the change does as a concept** (data moving through stages, a mechanism before/after, the
  behaviour behind a diff hunk) → a **scene**: pass the concept, the analogy if you have one, the real
  values from the diff, and the prose you've already written for the Idea section.

If the gate does not fire, keep a static figure or none, and say so. Timeline scrubbers and
DIY-migration games that need more than the beat player still live in
[`future-ephemeral-interfaces.md`](future-ephemeral-interfaces.md).

**4. The code — a literate diff.** Not a dump of files in `git diff` order. Walk the reader through the
change in the order that *teaches* best (often: the core change first, then what follows from it).
Before each file, a line or two of prose: why it changes, what to notice. Use the template's `filehdr`
+ `.diff` markup (`.add` / `.del` / `.ctx` lines). Show the hunks that carry meaning; summarise
mechanical noise ("+40 lines of generated types, omitted") rather than pasting it. The reader should
be able to follow the logic without opening the repo.

## Step 3 — Quiz: the speed regulator

Edit the `QUIZ` array at the bottom of the template. **Five questions, medium difficulty** — hard
enough that skimming fails, answerable by someone who actually read and understood the explainer.

- Test *understanding of this change*: why a thing was done this way, what breaks without it, what a
  value flows into — not trivia the reader could guess without reading.
- If you embedded an animation, make **one** of the five questions answerable only by having stepped
  through it (which card was running when X awaited, which box was still messy at beat 4, which beat
  scheduled the second task; for a concept view, a fact only the recorded rows show). `to-visual` hands back a quiz hook to start from. That keeps the
  animation honest rather than decorative.
- One clearly-correct option per question, three *plausible* distractors. Weak distractors let the
  reader pass by elimination and defeat the point.
- Write a one-line `why` for every option (right and wrong) — the explanation is where the learning
  lands. Don't worry about answer position or length; the template shuffles options at render.

The bar is 4/5. In **author mode**, state the rule explicitly when you hand off the file: *don't send
this PR for human review until you can pass its quiz.*

## Step 4 — Output

- Save to `explanations/explain-<slug>-<YYYY-MM-DD>.html` at the repo root (`slug` = a few words from
  the change; get the date from `date +%Y-%m-%d`). Create `explanations/` if absent and mention it can
  be gitignored — these are personal understanding artifacts.
- Set `__TITLE__` (what the change does, in plain words) and `__META__` (source + base, e.g.
  "PR #214 · feature/iso-render → main · 7 files").
- Remove the guidance comments from the template before saving.
- `open` the explainer so it's in front of the user, and give them the path. An embedded animation
  lives inside it (its source `.walk.json` / `.scene.html` sits next to it in `explanations/`).

## Done when

The explainer opens cleanly, every section is filled with real content (no placeholder text or leftover
template comments), the literate diff covers every meaningful hunk, and the quiz has five working
questions with explanations on all options. If the animated-walkthrough gate fired, the `to-visual`
fragment sits in the figure slot, every beat was checked in a browser, and one quiz question depends on
having stepped through it. In author mode, restate the
review rule. That's the whole point: the change is now something you could explain to a colleague at a
whiteboard — and if you can't pass the quiz, you're not there yet.
