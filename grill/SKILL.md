---
name: grill
description: >-
  Interview the user relentlessly about an idea until you reach shared understanding, while actively maintaining the project's domain model (glossary + ADRs) as terms and decisions crystallise. Use when the user wants requirements pinned down before building: "grill me on this", "interrogate this idea", "help me nail down the design", "challenge my thinking on X", "what am I not considering?", "let's scope this properly", or as the first stage of /pair. Produces a decision log plus any CONTEXT.md / ADR updates that later spec or planning work builds on. Do NOT use it to write code or a spec — this stage only reaches shared understanding.
---

# Grill — interview to shared understanding, with active domain modelling

> **Output discipline (hard rule).** Every output this skill produces obeys [`references/brevity/output-discipline.md`](references/brevity/output-discipline.md): **≤150 words of prose**, plain dumbed-down English, point first. Anything past 150 words becomes a **visual** — table, tree, diff, or code block (format menu: [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md)). Words inside a visual don't count. Ask **few questions at a time** and keep each turn under the cap; a decision log or glossary belongs in a table, not a paragraph.

Interview the user relentlessly about every aspect of the idea until reaching shared understanding.
Walk down each branch of the design tree, resolving dependencies between decisions one at a time.
**Alongside the interview, actively maintain the project's domain model** — challenge fuzzy terms,
invent edge-case scenarios, and capture terminology and irreversible decisions to disk as they
crystallise.

This skill presumes the direction is **already decided** — it extracts and pins down *what exactly*
to build. If the decision itself is still open — *should we? which direction? is it worth it?* —
settle that first; grill funnels toward pinned requirements and doesn't reopen whether to build at all.

If the work is **too big for one session** — you hit questions you can't answer without research, a
prototype, or more grilling, and find yourself lost in fog — a single grill won't clear it. That's
[`wayfinder`](../wayfinder/SKILL.md), which charts the whole thing as a map of decision tickets over
many sessions (and dispatches this skill for its grilling tickets). Grill is the single-session
primitive; wayfinder is the multi-session orchestrator around it.

**Interview rules — ask round-by-round, not one-at-a-time:**
- Map the idea as a **decision tree** and work it in **rounds**. Each round, ask *every* question whose
  prerequisites are already settled — the whole current frontier — in one `AskUserQuestion` call
  (it takes up to 4 questions at once). One answer often unlocks the next layer; ask that layer next
  round. This lands ~13 questions in ~3–4 rounds instead of 13 sequential prompts.
- Only hold a question back when it *genuinely* depends on an answer you don't have yet. Don't
  serialise independent questions just because they're related.
- For EVERY question use `AskUserQuestion` so the user picks from options instead of typing free-text.
  Generate 2–4 concrete, mutually exclusive options each. Put the recommended answer first and append
  "(Recommended)" to its label. Put nuance in the description field.
- **Facts the environment can answer, don't ask — dispatch.** If a question is answerable from the
  codebase, config, or git history, send a background `Explore`/`general-purpose` subagent to resolve
  it while you keep grilling, and fold the finding in when it lands. Reserve the user's rounds for
  decisions only they can make.
- Users always have "Other" available — don't force a fit when the answer space is genuinely open.

## Load the domain model at the start

Before the first question, check for existing domain files:
- **`CONTEXT-MAP.md`** at repo root → multi-context repo; use it to route to the right sub-context's `CONTEXT.md` and ADR directory.
- **`CONTEXT.md`** at repo root or under a subdirectory → single-context; read it so you can challenge conflicting terms.
- **`docs/adr/`** (or context-specific ADR directory) → scan for existing decisions relevant to this area.
- If none of the above exist, that's fine — create them lazily when the first term or ADR is warranted.

## During the grill — active modelling behaviours

Apply these alongside the normal interview:

- **Challenge against the glossary.** If the user uses a term that conflicts with an existing `CONTEXT.md` entry, call it out immediately: "Your glossary defines X as A, but you seem to mean B — which is it?"
- **Sharpen fuzzy language.** If the user uses vague or overloaded terms, propose a precise canonical term: "You said 'account' — do you mean Customer or User? They're different things."
- **Discuss concrete scenarios.** When domain relationships come up, stress-test them with specific edge-case scenarios that force precision about boundaries.
- **Cross-reference with code.** If the user states how something works, check the code. If it disagrees, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

## Update CONTEXT.md inline (do not batch)

The moment a term is resolved, write it to `CONTEXT.md` immediately. Format:

```md
# {Context Name}

{One or two sentence description of what this context is.}

## Language

**Order**:
{One or two sentences — what it IS, not what it does.}
_Avoid_: Purchase, transaction
```

Rules:
- Be **opinionated**. When multiple words exist for the same concept, pick the best and list the rest under `_Avoid_`.
- **Tight definitions** — one or two sentences max.
- **Only project-specific terms.** General programming concepts (timeouts, utilities) don't belong even if used often. Ask: is this concept unique to this context, or general programming? Only the former belongs.
- **CONTEXT.md is a glossary. Nothing else.** No specs, no implementation notes, no decisions. Decisions go in ADRs.

Create `CONTEXT.md` lazily — the first time a term is resolved.

## Offer ADRs sparingly

Only offer to create an ADR when **all three** are true:

1. **Hard to reverse** — cost of changing your mind later is meaningful.
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **Result of a real trade-off** — genuine alternatives existed and you picked one for specific reasons.

If any of the three is missing, skip it. Easy-to-reverse decisions get reversed; unsurprising decisions need no note; no-alternative decisions have nothing to record.

**Qualifies:** architectural shape, integration patterns between contexts, tech choices with lock-in, boundary/scope decisions, deliberate deviations from the obvious path, invisible constraints (compliance, SLOs), non-obvious rejected alternatives.

**ADR format** — live in `docs/adr/`, sequential numbering (`0001-slug.md`, `0002-slug.md`, ...). Scan for the highest existing number and increment. Template:

```md
# {Short title of the decision}

{1–3 sentences: context, decision, why.}
```

That's it. Add `Status` frontmatter, `Considered Options`, or `Consequences` sections **only** when they add genuine value.

## Finishing

Continue until the user signals completion ("ready", "ship it", "let's go", "do it", or any clear go-ahead). When done, capture and hand back:
- The full decision log — every Q/A pair resolved.
- Any new/updated `CONTEXT.md` entries.
- Any new ADR file paths.

Whatever consumes this next — a spec, a prototype, or the user's own head — builds on those three. If a look/feel/behaviour question surfaced that only a running artifact can settle, say so and point at [`prototype`](../pair/references/prototype/SKILL.md).
