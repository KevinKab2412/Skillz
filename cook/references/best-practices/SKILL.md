---
name: best-practices
description: Apply stack-specific engineering best-practices for a stack the caller names — Vercel's React/Next.js performance guidance for `react`, the `dagster-expert` skill for `dagster`, both when both apply, and an explicit no-op when neither does. Use when another skill (e.g. `implement` or `code-review`) has read an epic's `stack:*` labels and hands you the stack to apply; also use when the user says "apply the React best-practices", "check this against the Dagster guidance", or names a stack to hold code to. This skill does NOT discover which stack applies — the caller passes it in.
---

Apply the best-practices for the stack(s) the **caller names**. The caller — usually
[`implement`](../implement/SKILL.md) or [`code-review`](../../../code-review/SKILL.md), which read the
epic's `stack:*` labels — tells you which stack applies. Do not go looking for "the current epic"
yourself; if the stack is genuinely unclear, ask the caller which it is rather than guess.

## Route on the given stack

Read the stack you were handed and apply the matching guidance. The stacks are independent — apply
each one that was named.

- **`react`** — apply the vendored Vercel React/Next.js performance guidance. **Read
  [`vercel-react.AGENTS.md`](vercel-react.AGENTS.md) now** and hold the code you're writing or
  reviewing to its rules. It's the full ~70-rule guide (waterfalls, bundle size, server-side
  performance, re-renders, memoization), ordered by impact — that's why it lives in its own file
  and is read on demand, not inlined here. Cite a rule by its section (e.g. "1.5 Promise.all() for
  Independent Operations") when you flag or fix something.
- **`dagster`** — invoke the installed **`dagster-expert`** skill via the Skill tool
  (`dagster-expert:dagster-expert`) and follow its guidance for the Dagster work at hand.
- **both `react` and `dagster`** — apply both of the above.
- **neither** — **skip.** This is an explicit no-op: there is no best-practices guidance for this
  stack, so do nothing and return. Say so in one line so the caller knows the step ran and found
  nothing to apply, rather than silently.

## Attribution

`vercel-react.AGENTS.md` is a verbatim vendored copy of Vercel Engineering's "React Best Practices",
distributed under the MIT License (Copyright (c) 2026 Ben Holmes). Source:
<https://github.com/bholmesdev/hubble.md/blob/main/.agents/skills/vercel-react-best-practices/AGENTS.md>.
Keep the attribution header in that file intact.
