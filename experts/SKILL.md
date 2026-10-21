---
name: experts
description: >
  Reach the `experts` MCP gateway — a local server holding 11 domain corpora
  (software_engineer, python, laravel, ai_engineer, data_engineer, data_analyst, sales_gtm,
  retention_gtm, customer_research_gtm, positioning_branding_gtm, zettelkasten), each a named
  expert with its own standards. Infer the right tool and expert from what the user asks, invoke
  it, then reason over the returned standards + rubric and answer citing each Standard by id.
  Use when the user hands you an artifact to judge (a diff, module, design, note, draft) → review;
  asks what a domain holds on a topic → find; or the owning domain is unclear / they want several
  domains' views → route. Triggers on "/experts", "ask the experts", "what do the experts say
  about…", "run this by the expert", "which expert owns this", "get the standards on…", "review
  this against the <domain> standards", and on naming any one of the 11 experts directly. The
  server holds no LLM — every tool returns standards for *you* to reason over, not a finished
  answer.
---

Reach the **`experts`** MCP gateway — a local server exposing 11 domain corpora, each a named
**expert** with its own **standards**. Every tool returns standards + a rubric for *you* to reason
over; the server holds no LLM (ADR-0001), so the thinking is yours. Do it in order: pick the tool
and expert, invoke, then answer over what comes back — citing each Standard by its id.

## 0. Confirm the gateway is reachable

The tools are `mcp__experts__route`, `mcp__experts__find`, `mcp__experts__review` (Claude Code) — or
the same three under an `experts` server in Cursor. If they aren't available, **say so plainly** and
point the user at `/mcp` (Claude Code) or their MCP settings (Cursor) to check the `experts` server
is connected. Don't invent an answer from your own knowledge and pass it off as the corpus.

## 1. Pick the tool and the expert

The experts are: `software_engineer`, `python`, `laravel`, `ai_engineer`, `data_engineer`,
`data_analyst`, `sales_gtm`, `retention_gtm`, `customer_research_gtm`, `positioning_branding_gtm`,
`zettelkasten`.

Read what the user actually wants and match it to one tool:

| The user… | Tool | Why |
| --- | --- | --- |
| hands you an **artifact to judge** — a diff, module, design, note, draft | `review(artifact, expert)` | they want a verdict against a domain's standards |
| asks **what a domain holds** on a topic — "what does X say about Y" | `find(query, expert)` | they want the relevant standards, no artifact to grade |
| the **owning domain is unclear**, or they want **several domains' views** | `route(artifact_or_question)` | let the gateway pick the owner + challengers |

**Name the expert directly when the domain is obvious** — a Python diff goes to `python`, a
positioning memo to `positioning_branding_gtm`. Don't route an obvious question: `route` reranks the
artifact against all 11 stores to *discover* the owner, so naming the expert yourself gives the
gateway for free what it would otherwise spend that work to learn. Reach for `route` only when the
owner is genuinely unclear or the user explicitly wants more than one domain weighing in.

After a `route`, you'll often want a second call: `find` or `review` the winning expert to go deep on
what `route` surfaced. Chain them — `route` to pick, then `find`/`review` to work the pick.

## 2. Invoke

Call the matching tool with the artifact/query and the expert you chose (`route` takes no expert).
Pass `focus` when the user narrowed the lens ("just the error handling", "only the caching"); pass
`k` on `route` when they want more or fewer challengers than the default.

## 3. Answer over what comes back — cite by Standard id

Reason over the returned **standards + rubric** (and the **Finding schema** on `review`) and give the
user your answer. This is the work: the tool handed you the raw material, you produce the judgment.

- **Cite every Standard by its id** as you use it, so the user can trace each claim to the corpus.
- On `review`, structure the verdict as **Findings** per the returned schema and lean on the rubric
  and supporting passages — don't grade on vibes when the tool handed you a rubric.
- **Honor `low_confidence`.** If the response flags low confidence, say the corpus has nothing solid
  on this and stop — don't paper over the gap with your own priors. A straight "the experts don't
  cover this" is the right answer, and the honest one.
