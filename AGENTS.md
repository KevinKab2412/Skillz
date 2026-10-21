# Agent Instructions

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var


---

<!-- Claude Code context (merged from CLAUDE.md) -->

# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.



## Build & Test

_Add your build and test commands here_

```bash
# Example:
# npm install
# npm test
```

## Architecture Overview

Cross-skill policy lives under `shared/` and is injected into opted-in skills through each
`references/.shared` manifest during `install.sh`. Skills own their workflow-specific lifecycle and
authoritative state; shared modules own only policy that must remain identical across callers.

## Conventions & Patterns

- Generic workflow memory is advisory and non-blocking. Planning issues, repository records,
  architecture contracts, and teaching mission and learning records remain authoritative.
- Memory-aware nested skills inherit the outermost workflow memory session. They may capture their
  own qualified events but must not repeat startup recall or final flush.
- Skills may depend on versioned MCP memory tools through the shared memory reference. They must not
  call SQLite, FastEmbed, the outbox, client configuration, or daemon internals.
- Escalate if memory needs to override or duplicate an authority, requires mission-specific generic
  scope, or requires a new service operation.


## Writing Style

- **Never use the "corrective reframe" tic.** Do not write the "not X — it's Y" (or "isn't X, it's Y")
  construction that demotes a modest framing and then overwrites it with a grander one for rhetorical
  punch. Banned shapes include: "That's not a tuning detail — it's the two things the system sells",
  "This isn't a rename, it's the whole public API", "Call it X if you want, but it's really Y", and
  "X? No. Y." The em-dash pivot, the comma pivot, and the question-then-answer pivot are all the same
  move and all banned.
  - **Instead, just state the claim directly.** Say what the thing *is* and why it matters, without
    first knocking down a smaller reading. "These are the two things the system sells" beats "That's
    not a tuning detail — it's the two things the system sells." Drop the setup; keep the substance.
  - **Allowed:** a plain factual correction where a contrast is literally the point ("This isn't the
    prod config, it's the staging one"). What's banned is the contrast used as *emphasis* — inventing
    a weak frame just to dramatically overrule it.

<!-- skillz:available-skills -->
## Available Skills

Skills load automatically from `~/.agents/skills/` (shared across Claude Code, Codex, and OpenCode). Invoke with `/skill-name` or just describe what you need:

- **`/code-review`** — Review a PR, branch, or working diff and give one clear merge call in a short plain-English report.
- **`/deploying-to-cloud`** — Deploys and manages Laravel applications on Laravel Cloud using the `cloud` CLI.
- **`/experts`** — Reach the `experts` MCP gateway — a local server holding 11 domain corpora (software_engineer, python, laravel, ai_engineer, data_engineer,…
- **`/explain-this-like-i-am-an-intern`** — Get clarity on anything — a subject you want to finally understand, or a message of mine that just didn't land.
- **`/grill`** — Interview the user relentlessly about an idea until you reach shared understanding, while actively maintaining the project's domain model (glossary +…
- **`/meetily`** — Read, search, and summarise meeting transcripts recorded by the local Meetily app, which stores them in a SQLite database on this Mac.
- **`/morning`** — Render the user's morning brief as a styled HTML artifact, or set it up as a recurring weekday task.
- **`/pair`** — Full spec-to-ship pipeline that orchestrates the individual engineering skills with human strategic gates and bounded agent autonomy — optional…
- **`/research`** — Investigate a question against high-trust primary sources, web search, site scraping and crawling (Firecrawl), and Mobbin UI examples, then capture…
- **`/retro`** — Run a retrospective on a coding session, a PR, or a batch of recent PRs — to improve the environment agents work in next time, not to fix the code…
- **`/show-me`** — Explain the current topic *visually* instead of in a wall of prose — a compact diagram, a code-shape sketch, or one focused HTML artifact.
- **`/skill-creator`** — Create new skills, modify and improve existing skills, and measure skill performance.
- **`/standup`** — Generate a standup update from recent activity.
- **`/to-pr`** — Prepare draft PRs from finished work, with concise descriptions, blast-radius banners, and visual proof.
- **`/to-visual`** — Turn one concept into an animated, beat-by-beat HTML explainer: a 1920×1080 composition that pauses after each beat, silent, with one caption per…
- **`/wayfinder`** — Plan a chunk of work too big for one session — wrapped in fog, where the way from here to the destination isn't visible yet — as a shared map of…

> Skill source of truth: `~/.agents/skills/` — managed via the Skillz repo. Run its `install.sh` to sync.
<!-- /skillz:available-skills -->
