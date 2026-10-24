# Experts lane (automatic)

The experts lane grounds a material change in the task's subject, then holds the diff to a curated
**domain corpus** — the `experts` MCP server's standards for software engineering, Python, Laravel,
AI engineering, data engineering/analysis, GTM, zettelkasten, and more. Run it automatically
alongside Standards and Spec in every normal review.
For an explicit bug-only or security-only review, restrict this lane to that requested scope too;
an explicit exclusion by the user takes precedence. Keep only blockers and should-fixes.

First read the shared [experts module](../../pair/references/experts/SKILL.md) directly and pass
its path to the reviewer. This reuses MCP guidance without starting the pair pipeline or invoking
a retired standalone skill. The module owns tool selection, citation, and low-confidence rules.

Add a **third subagent** alongside Standards and Spec, in the same parallel
message, with this prompt:

```
Hold the change below to the relevant expert's domain standards from the `experts` MCP.

## Domain Grounding packet
<paste the packet from the main review, including the task subject, relevant Standard IDs, domain
invariants/failure modes, and version-matched official docs; or state that none is needed>

## Diff
<paste the diff>

## What to do
Read the shared experts module at <absolute path to pair/references/experts/SKILL.md> first.
1. Summarise the task's subject and the diff in 1–2 sentences. Use the packet's domain findings to
   identify the key invariants, tradeoffs, and failure modes that should inform the review.
2. If the packet lacks topic-level expert grounding, search the task subject with `find(query, expert)`
   before reviewing the diff. If the owning domain is obvious, name it directly. If the domain is
   unclear or spans domains, call `route(artifact_or_question)` first, then search the winner and
   material challengers. Search the subject itself — for example queue delivery semantics, pipeline
   replay, or tenant isolation — rather than only testing principles.
3. Call `review(artifact=<the task-and-diff summary>, expert=<the primary domain>)` against the
   relevant Standards. When routing identified material challengers, search and weigh their topic
   standards too. For framework or library behavior, use the version-matched official docs in the
   packet; if a material contract is missing, consult the primary docs for the version found in the
   repo's manifests/lockfiles. Cite relevant Standard IDs and doc links.
4. The corpus holds no LLM — the tools return Standards, supporting passages, a rubric, and a Finding
   schema for YOU to reason over. Do the judging yourself. Surface only concrete issues in this diff;
   domain guidance alone does not create a finding or change the acceptance bar.

## Honesty rules
- Honour low_confidence: if the tools return it, the corpus has little to say here — report that
  plainly and DO NOT invent findings to fill space.
- If the experts MCP server isn't connected or a call errors, say so in one line and stop — never
  fail the review over a missing experts server.

## Brief
Read code-review/references/constructive-review.md for impact, evidence, and merge-action calibration.
Per finding, cite the returned Standard id the way you'd cite a repo rule, and classify it
blocker / should-fix / nonblocking / nit using the same definitions the Standards reviewer uses.
A reproduced defect is not automatically a blocker; explain its concrete consequence and scope. Write each finding
in plain English — lead with the consequence, gloss any jargon. Under 350 words. If nothing clears the
bar, say the experts corpus surfaced no domain-standard issues on this change.
```

Fold its findings into **The issues** section of the report exactly like the other two lanes: drop
nits, rewrite each survivor for a bright intern, attach a paste comment. If two lanes caught the same
thing, post **one** comment, and note the cross-lane agreement — the lanes don't share context, so when
they land on the same line, verify and deduplicate the shared claim. Include Experts blockers in
the same refutation step as blockers from other lanes. Report whether the pass completed, was
unavailable, returned low confidence, or was excluded by explicit scope in "What I left out".
