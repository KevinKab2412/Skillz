---
name: plan-review
description: >
  Review a GitHub epic and its child tasks with a senior-engineer eye before code is written. Check
  for duplication, over-large or incomplete behavioral slices, missing dependency edges, architecture
  contract gaps, misplaced checkpoints, and structural problems. Use for "review this plan", "review
  these issues", "is this breakdown atomic?", "poke holes in this plan", or after /spec in /pair.
  Reviews the plan rather than writing or executing code.
---

# Plan Review — senior-engineer review of a GitHub plan

Review the plan with a senior-engineer eye **before any code is written**. Fetch the task list
(the user gives the epic number, or find the most recent open `spec:epic` in `KevinKab2412/planning`). Per
[../spec/GITHUB-ISSUES.md](../spec/GITHUB-ISSUES.md):

```bash
gh api repos/KevinKab2412/planning/issues/<epic-n>/sub_issues --jq '.[] | "#\(.number) [\(.state)] \(.title) | \((.labels|map(.name))|join(","))"'
gh issue view -R KevinKab2412/planning <task-n> --json title,body,labels   # run for every child task
```

Evaluate for: DRY violations in the plan, over-stuffed tasks that are not independently shippable,
missing dependency edges, slices too large for one coherent behavioral outcome, and structural issues
in the proposed approach. When the epic includes an architecture contract, also verify that every task
stays inside its architectural neighborhood, carries the relevant hard guards and escalation
conditions, and places checkpoints before uncertain seams. Reject plans that convert diagnostic
metrics such as coverage, CRAP, mutation score, complexity, or size into universal hard gates without
an existing repository policy.

For each finding use this structure:
```
### [blocker | should-fix | nit] — Principle
**What:** one sentence
**Why it matters:** two to three sentences tied to this specific plan
**Fix:** concrete change to the task scope or split
```

**Gate after review:**

```
question: "Plan review complete. How do you want to proceed?"
options:
  - "Plan looks good — proceed (Recommended)"
  - "Revise plan — loop back to grill with these findings"
  - "Accept with caveats — annotate the issues and proceed"
```

If "loop back": carry the findings as the opening context for a new [`grill`](../../../grill/SKILL.md) session. Update the task issues after the revised grill (via [`spec`](../spec/SKILL.md)). Re-run this review. Repeat until the plan passes or the user explicitly accepts.
