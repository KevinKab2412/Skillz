# Experts lane (automatic)

The experts lane holds the change to a curated **domain corpus** — the `experts` MCP server's
standards for software engineering, Python, Laravel, AI engineering, data engineering/analysis, GTM,
zettelkasten, and more. Run it automatically alongside Standards and Spec in every normal review.
For an explicit bug-only or security-only review, restrict this lane to that requested scope too;
an explicit exclusion by the user takes precedence. Keep only blockers and should-fixes.

First read the shared [experts module](../../pair/references/experts/SKILL.md) directly and pass
its path to the reviewer. This reuses MCP guidance without starting the pair pipeline or invoking
a retired standalone skill. The module owns tool selection, citation, and low-confidence rules.

Add a **third subagent** alongside Standards and Spec, in the same parallel
message, with this prompt:

```
Hold the change below to the relevant expert's domain standards from the `experts` MCP.

## Diff
<paste the diff>

## What to do
Read the shared experts module at <absolute path to pair/references/experts/SKILL.md> first.
1. Summarise the diff in 1–2 sentences — which domain does it touch (software engineering, Python,
   Laravel, AI engineering, data engineering/analysis, GTM, zettelkasten)?
2. If the owning domain is obvious, call review(artifact=<that summary>, expert=<domain>) directly.
   If it's ambiguous or spans domains, call route(artifact=<that summary>) first to get the owning
   expert plus cross-domain challengers, then review(expert=<the winner>); weigh the challengers too.
3. The corpus holds no LLM — the tools return Standards, supporting passages, a rubric, and a Finding
   schema for YOU to reason over. Do the judging yourself.

## Honesty rules
- Honour low_confidence: if the tools return it, the corpus has little to say here — report that
  plainly and DO NOT invent findings to fill space.
- If the experts MCP server isn't connected or a call errors, say so in one line and stop — never
  fail the review over a missing experts server.

## Brief
Per finding, cite the returned Standard id the way you'd cite a repo rule, and classify it
blocker / should-fix / nit using the same definitions the Standards reviewer uses. Write each finding
in plain English — lead with the consequence, gloss any jargon. Under 350 words. If nothing clears the
bar, say the experts corpus surfaced no domain-standard issues on this change.
```

Fold its findings into **The issues** section of the report exactly like the other two lanes: drop
nits, rewrite each survivor for a bright intern, attach a paste comment. If two lanes caught the same
thing, post **one** comment, and note the cross-lane agreement — the lanes don't share context, so when
they land on the same line, verify and deduplicate the shared claim. Include Experts blockers in
the same refutation step as blockers from other lanes. Report whether the pass completed, was
unavailable, returned low confidence, or was excluded by explicit scope in "What I left out".
