---
name: retro
description: >
  Run a retrospective on a coding session, a PR, or a batch of recent PRs — to improve the environment
  agents work in next time, not to fix the code itself. Looks for navigation gaps, missing or unwired
  automated checks, coding-standard violations that should become a CODING_STANDARDS.md entry or a
  deterministic check instead, steering-file bloat, token-inefficient tool use, and information an
  agent or human reviewer couldn't see. Use for "run a retro", "retrospective on this session/PR/week",
  "what should we change about how we work", or after `code-review` keeps flagging the same should-fix
  shape across sessions, or reports a 🔴/🟡 Standards-maturity read. Produces ranked candidates with a
  concrete, user-approved patch for each — never a diff to the reviewed code itself.
disable-model-invocation: true
---

# Retro — improve the environment, not the diff

> **Output discipline (hard rule).** Every output this skill produces obeys
> [`references/brevity/output-discipline.md`](references/brevity/output-discipline.md): **≤150 words of
> prose**, plain English, worst-first. A table of candidates isn't prose — use one.

A retro looks backward at how a session, a PR, or a week of PRs actually went, and asks what in the
**environment** — the standards file, the lint config, `AGENTS.md`, the agent's tool access — should
change so the same mistake doesn't recur. It never touches the reviewed code. If a candidate is "fix
this bug," that belongs to `code-review`, not here.

## Step 1 — Gather the primary sources

Work out the scope, in this order of preference:

- **A named session or PR** — read its transcript/diff directly.
- **"This session"** (the default, no scope given) — use the current conversation.
- **A time range** ("this week's PRs") — `gh pr list --state merged --search "merged:>=<date>"`, then
  pull each PR's diff and comments.

For each one in scope, collect: the diff, any `code-review` report that ran against it (its
Standards-maturity line and findings, if recoverable from the session or PR comments), and — the most
valuable signal — **human reviewer comments that caught something automation didn't**:
`gh api repos/<owner>/<repo>/pulls/<n>/comments`. A human catching what two automated lanes missed is
the single clearest retro candidate there is.

## Step 2 — Look for candidates, each with a trigger condition

Only raise a candidate when its trigger condition actually fired this session — an unconditional
checklist pass produces noise, not signal.

| Category | Ask | Use when |
|---|---|---|
| **Navigation** | Was a hidden file dependency hard to find? Would a pointer in `AGENTS.md`/`CONTEXT.md` have helped? | the session spent real time locating something |
| **Automated checks** | Read the repo's own `lint`/`check`/CI config first — is there a check sitting unwired or silently broken? A repo with **no** guardrail at all (no pre-commit hook, no CI lint/typecheck/test job) is itself a finding. | an agent mistake could have been caught mechanically, or no guardrail exists |
| **Coding standards** | Classify the violation per [`references/coding-standards/coding-standards.md`](references/coding-standards/coding-standards.md): mechanical → a linter rule/pre-commit hook/CI job; judgment call → one line in `CODING_STANDARDS.md`. Default to the mechanical check whenever one is possible. | `code-review`'s Standards lane failed to catch it, or flagged it as a nit repeatedly |
| **Steering-file bloat** | Is `AGENTS.md`/`CONTEXT.md` (repo or global) large? Any instruction in it that never changed behavior this session (a no-op)? | the steering file is large or the agent ignored part of it |
| **Tool economy** | Any expensive or token-inefficient tool call — a custom CLI/MCP call that could be cheaper? | an agent made a visibly expensive call |
| **Information access** | Was a crucial fact unavailable — dev-server logs, a third-party service, read access to something? | the agent or a human reviewer was missing information that existed somewhere |

## Step 3 — Present, ranked by severity

For each surviving candidate: the category, the one sentence of evidence that triggered it, the
concrete fix, and — for anything editing `CODING_STANDARDS.md` or a lint/CI config — a ready **diff**,
not a description. Use a `show-me` visual (file tree, diff) where it reads faster than prose. End with
one question: which to apply.

```
question: "Which candidates should I apply?"
options:
  - "Apply the top one (Recommended)"
  - "Apply all"
  - "None — just wanted to see them"
```

On approval, apply only the chosen edits (`CODING_STANDARDS.md`, lint config, `AGENTS.md` pointer) in
the working tree and show `git diff`. **Never commit** — that's the user's call, same as everywhere
else in this toolset.

## Reference — why review, not implement, owns the standards file

All work here goes through two stages with very different context pressure. **Implement** carries the
most: it explores, writes, and debugs, one task at a time — see
[`pair/references/implement/SKILL.md`](../pair/references/implement/SKILL.md), which already scopes its
own cleanup step to the current batch and nothing wider. **Review** carries the least — it receives a
diff, so no exploration is needed — which is why `code-review`'s Standards lane, not `implement`, is the
one that reads and enforces `CODING_STANDARDS.md`
([`references/coding-standards/coding-standards.md`](references/coding-standards/coding-standards.md)).
A retro candidate that would ask `implement` to additionally check a repo-wide standards file is the
wrong fix — it re-overloads the stage that's already carrying the most. Route it to `code-review`'s
Standards lane instead.

## Done when

Every surfaced candidate fired because something concrete happened this session, not because the
checklist exists. Each carries a ready diff where one applies. Nothing here touches the reviewed code —
that's always `code-review`'s job, never this skill's.
