---
description: Implement one bounded, approved task in the current worktree
argument-hint: "<task-brief-path>"
---

Read the task brief at `$1` and the repository's `AGENTS.md`. Implement only
that approved batch inside the stated architecture contract. Before editing,
record the starting HEAD and worktree status. Do not change a public seam,
dependency direction, or scope beyond the brief. Stop and report a conflict or
missing decision rather than choosing an architecture. Run the brief's focused
tests and hard guards. Report changed files, test results, uncertainties, and
the exact worktree diff. Do not create, edit, close, or comment on planning
issues or pull requests; the frontier orchestrator will review the result.
