---
name: research
description: Investigate a question against high-trust primary sources, web search, site scraping and crawling (Firecrawl), and Mobbin UI examples, then capture findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, a whole doc site read, UI patterns explored, or reading legwork delegated to a background agent.
---

> **Output discipline (hard rule).** Every output this skill produces obeys [`references/brevity/output-discipline.md`](references/brevity/output-discipline.md): **≤150 words of prose**, plain dumbed-down English, the answer first. Anything past 150 words becomes a **visual** — table, tree, diff, or code block (format menu: [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md)). Words inside a visual don't count. This covers the findings file the background agent writes **and** your summary of it: put the findings in a **table with citations**, keep the surrounding prose under 150 words.

Spin up a **background agent** to do the research, so you keep working while it reads.

This is a utility other stages call, not just a standalone: [pair's internal grill module](../pair/references/grill/SKILL.md) and
[`spec`](../pair/references/spec/SKILL.md) call it when *pinning requirements* needs an outside fact. It answers "is
it true / what exists / what do others do" — facts with citations, not a recommendation.

Its job:

1. Read the shared [experts module](../pair/references/experts/SKILL.md) directly; this does not run pair.
   **Consult the local experts first** when the question falls in a domain they cover — software engineering, Python, Laravel, AI engineering, data engineering, data analysis, the GTM domains (sales, retention, customer research, positioning & branding), or Zettelkasten. Their curated **Standards** (extracted from books, each with a stable id, a Rule, and a Reject-when) are a **primary source** — read them before the wider web so they frame the rest of the research. Use the `experts` MCP tools (find/route): `find(query, expert)` for the relevant expert(s) to pull the standards most relevant to the question; if the owning domain is unclear, `route` the question first to pick the expert, then `find` (or `review` an artifact against them). **Cite each Standard by its id** alongside the URL/Mobbin citations below. Honor `low_confidence`: if the experts return it, say the corpus has nothing solid on this rather than forcing a citation. If the question is clearly outside every expert domain (e.g. a specific third-party API's changelog), skip this step. If the `experts` MCP isn't connected, note it briefly and proceed with the other sources — never fail the research over it.
2. Investigate the question against the wider **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
3. **Web search** for supplementary context, recent changes, or community consensus — but always trace any claim back to a primary source before including it.
4. **Read deeply with Firecrawl.** Web search *finds* a page; Firecrawl *reads* it. Reach for it whenever `WebFetch` hands back an SPA shell, a JS-rendered page, a paywall stub, or one page isn't enough and you need a whole doc site. Match the tool to the operation:
   - `mcp__firecrawl__firecrawl_search` — search the web and get clean, scraped markdown back in one call; the default when you're both finding *and* reading.
   - `mcp__firecrawl__firecrawl_scrape` — one known URL to clean markdown, with JS rendered. Use over `WebFetch` when the page is dynamic or `WebFetch` returned nothing useful.
   - `mcp__firecrawl__firecrawl_map` — enumerate every URL under a site *without* fetching their content, to find the right pages before you read them.
   - `mcp__firecrawl__firecrawl_crawl` — collect many pages across a doc site or section at once (async; poll `mcp__firecrawl__firecrawl_check_crawl_status`).
   - `mcp__firecrawl__firecrawl_extract` — pull the same structured fields across one or more pages when you need data, not prose.

   Firecrawl only changes *how* you read a source — cite it by its URL exactly as you would a `WebFetch`, and still trace every claim back to a primary source.
5. **Search Mobbin** for real-world UI/UX examples when the question touches design, flows, or patterns. Use all three tools as relevant:
   - `mcp__mobbin__search_flows` — end-to-end user flows (onboarding, checkout, auth, etc.)
   - `mcp__mobbin__search_screens` — individual screen layouts and patterns
   - `mcp__mobbin__search_sections` — specific UI components or sections within screens
   Include relevant examples in the findings with the app name and flow context as the citation.
6. Write the findings to a single Markdown file, citing each claim's source (Standard id for the experts, URL for web/docs, app name + flow for Mobbin).
   - **Show the shape, don't only narrate it.** When a finding *is* a shape — an architecture, a request flow, a state machine, a taxonomy, a decision tree, or an option-by-criterion comparison — draw the smallest visual that carries it instead of a dense paragraph: a ` ```mermaid ``` ` block (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`) for flow and interaction, a fenced file/call/component tree for structure, a Markdown table for a comparison. These render natively in the Markdown findings file. Keep each one small, put it next to the sentence it supports, and don't overwhelm — a claim that's already clear in one line needs no diagram. The format menu is in [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md).
7. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.
