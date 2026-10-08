---
name: sketch-change
description: Generate a coarse, forward-looking HTML sketch of how you INTEND to build something — the data flow, the key state, pseudo-code for the load-bearing parts, the design decisions you made and why, and the places you're still guessing — so the engineer can react to a concrete strawman and impart counter-thinking BEFORE any code (or even any grilling) is written. The forward twin of code-review: code-review explains a change that already exists; sketch-change explains one that doesn't yet, and asks to be argued with. Use whenever the user wants to see your plan of attack before you build: "sketch how you'd approach this", "show me your plan of attack first", "walk me through your approach before you code", "how are you thinking about building X", "give me a design sketch", "pre-flight this before we dig in", "let me see your reasoning before you touch the code" — or as the opening stage of /pair, to give the grill something concrete to shoot at. Stays coarse on enumeration (not every field or signature — that's spec/plan-review's job) but rich and explicit on reasoning, so its design choices are contestable. Produces a self-contained HTML file and opens it.
---

# sketch-change — a design you argue with, before the code exists

`code-review` explains a change *after* it's written. `sketch-change` is its mirror: it explains a
change *before* it's written — a concrete strawman of how the agent intends to build the thing, put in
front of the engineer to be **contested**, not admired.

The point is to put you back in the pilot seat. An agent left to itself picks patterns and moves on;
you never see the fork it took. This artifact drags those choices into the open — *which* pattern,
*why*, and *where it's unsure* — early enough that a sentence from you ("no, a state machine here",
"this has to be idempotent", "you missed the retry path") redirects the whole build for the cost of a
paragraph instead of a rewrite. That's the Toyota line made concrete: **you teach the machine.** A
sketch too vague to argue with fails at its one job.

Where it sits: this is the forward bookend of the understanding loop — `sketch-change` at design time,
`code-review` after the build. As the front of `/pair` it gives the grill a target: instead of the
agent cold-opening with abstract questions, you react to a concrete proposal, and the grill collapses
to just the gaps the sketch exposed.

## Fidelity: coarse on enumeration, rich on reasoning

The one way this skill fails is getting the grain wrong — in *either* direction. Hold both lines:

- **Coarse on enumeration.** Do *not* list every `state` field, every function signature, every prop.
  That's `spec` and `plan-review`'s job, it's premature before the approach is agreed, and it's thrown
  away the moment you redirect the design. Enumerating early is wasted work, not thoroughness.
- **Rich on reasoning.** Do *name every load-bearing design decision and why you made it* — the
  pattern chosen, the data that flows where, the tradeoff taken. This is the part you contest, so
  vagueness here defeats the skill. "I'll add a store" is uncontestable; "a single reducer owns
  submission state because three components need to read `isSubmitting` and I want one source of
  truth — I considered local state per component and rejected it" is something you can argue with.

The test for any line: *could the engineer disagree with this and change the build?* If yes, it earns
its place. If it's just an enumerated detail they'd never override at this stage, it's noise — leave it
for spec.

## Step 1 — Understand the request and ground the sketch in the real code

There's no diff to read yet, so build the picture from two sides: the **request** (what's wanted) and
the **current system** (what you'll build into). Ask only if the request is genuinely ambiguous.

- Read the code the change will touch or sit beside — at full context, not just the entry point — so
  the sketch proposes against how the system *actually* works, not a guess. A sketch built on a
  misread of the current code wastes the engineer's review on a strawman that was never viable.
- For a large or unfamiliar area, dispatch an `Explore` agent to map the affected subsystem first.
- Note the conventions already in play (state patterns, error handling, test seams) — your proposal
  should either follow them or say explicitly where and why it breaks from them.

**Calibrate the audience — write for a bright intern on their first day.** Someone sharp but
brand-new, who shares none of this codebase's history and none of its jargon. Verbosity and
complexity only add time to understanding, and the whole point is for the engineer to grasp your
reasoning *fast* and redirect it. So: lead with the why, spell out every acronym and domain term the
first time it appears, and prefer a concrete example or a plain analogy over an abstraction — write in
ASD-STE100 Simplified Technical English. This is simple *prose*, not simple *thinking*: the design
decisions stay substantive and contestable; you just say them plainly. Escape hatch: if the engineer
clearly knows the area (in `/pair`, they usually do), tighten the background accordingly.

## Step 2 — Write the sketch in decision order

Copy `assets/template.html` to the output path (Step 3) and fill these sections. Keep this order — it
moves from shared ground to the contestable core. Delete any section that genuinely doesn't apply;
don't pad.

**1. Background — how the system works today.** Only the concepts your proposal *assumes*. Collapsible
("skip if you know this") so a fluent engineer isn't slowed. Skip entirely if they know the area cold.

**2. The approach — intuition before mechanism.** One or two sentences on what you're going to build
and what it's really *for*, then a concrete example or analogy for the feel of it. The engineer should
grasp the shape here before any pseudo-code.

**3. Data flow — a figure, if it earns its place.** If the change is about state moving through the
system, a small figure (a static SVG, or a *light* box-and-arrow diagram) shows what prose can't —
where data enters, what transforms it, where it lands. Coarse: the flow, not the field list. Cut it if
prose already carries it. When the *movement* is the decision you want contested (a pipeline's
stages, a retry loop, work moving between queues) and a static figure can't carry it, invoke the
[`to-visual`](../../../to-visual/SKILL.md) skill via the Skill tool (its gate is in that file) with
`mode: fragment`, and paste the fragment here: an animation of the *proposed* flow gives the engineer
a concrete strawman to argue with, beat by beat.

**4. Intended shape — coarse pseudo-code for the load-bearing parts.** Use the template's `shape`
blocks. Pseudo-code, *not* real signatures: enough to show the structure of the tricky pieces — the
core function's logic, the shape of the key state, the control flow that matters. A line of prose
before each block on what it's doing and why. Show only the parts that carry a decision; a getter
nobody would argue about doesn't belong here.

**5. Design decisions — contest these.** The heart of the artifact. List the load-bearing choices you
made, each as *decision + why + the alternative you rejected*. This is what the engineer argues with,
so make them real and specific. Use the template's `decision` blocks.

**6. Where I'm guessing — teach me here.** The honest section: the places you're unsure, the
assumptions you're making about intent, the questions only the engineer can answer. In `/pair` this
list becomes the grill's opening agenda — so the grill starts from your actual gaps, not from zero.

## Step 3 — Output

- Save to `docs/sketches/sketch-<slug>-<YYYY-MM-DD>.html` (`slug` = a few words from the change; get
  the date from `date +%Y-%m-%d`). Create `docs/sketches/` if absent. These are throwaway design
  artifacts — `docs/` is already gitignored in many repos, so they land ignored by default; if `docs/`
  is tracked here, add `docs/sketches/` to `.gitignore` so a sketch never ships.
- Set `__TITLE__` (what you're going to build, in plain words) and `__META__` (the request source and
  the area touched, e.g. "checkout flow · 4 files in src/checkout").
- Remove the guidance comments from the template before saving.
- `open` the file so it's in front of the engineer, give them the path, and **invite the pushback
  explicitly**: tell them the Design decisions and Where-I'm-guessing sections are there to be argued
  with, and that redirecting now is far cheaper than after the build.

## Hand-off (in /pair)

When this runs as the front of `/pair`, the sketch feeds the grill: carry the **Where I'm guessing**
list and any decision the engineer contested straight into the grill as its opening agenda. If the
engineer's markup already settled everything, say so and offer to shorten or skip the grill — the
sketch did its job. If they blew up a core decision, that's the grill earning its keep; work it.

The sketch also outlives the grill as the session's **intent baseline**. Keep the file on disk through
the run so the later review stage can read it back and trace *what we set out to build* against *what
shipped* — which contested decisions landed, and where the direction changed. That drift is expected:
the design evolves through the grill and the pipeline, and a deliberate course-correction is a good
outcome, not a defect. So the sketch is context for the review's story, **never the acceptance bar** —
the spec/epic is. It stays throwaway (never committed); it just has to live long enough to be read.

## Done when

The file opens cleanly, every section holds real content (no placeholder text or leftover template
comments), the pseudo-code is coarse enough to stay out of spec's lane but concrete enough to show the
structure, and — the load-bearing test — the **Design decisions** and **Where I'm guessing** sections
give the engineer something specific to disagree with. If a reader couldn't push back on anything in
the sketch, it's too vague to have done its job; sharpen the decisions until they can.
