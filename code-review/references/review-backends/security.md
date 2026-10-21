---
name: review-security
description: Review code changes with Security Review subagent.
---
# Review Security

Internal adapter for `code-review` when the host's Security Review backend is requested and exists.
If unavailable, report that limitation and use the parent's regular security-focused review.

Launch exactly one `security-review` subagent with:

- `run_in_background: false` unless explicitly asked to run in background
- `description: "Security Review"`
- `subagent_type: "security-review"`

The backend computes its own diff. Reuse `code-review`'s resolved target and base; there is no need
to recompute the parent skill's diff merely for this invocation. The repository path should be the active workspace or repository root for the code the user wants reviewed.

By default, the review subagent infers the repository's actual base branch, such as `main`, when computing `branch changes`. In most cases, do not provide `Base Branch`. Only provide it if you know the current branch or PR should be compared against a specific branch other than the repository's default base branch, such as when you created the current branch from another branch.

Special case: if the user explicitly asks to review a specific PR or branch, make sure that target is checked out before launching the subagent:
- Examples include `github.com/... /review`, `review {link}`, or `review {branch-name}`.
- Resolve the provided PR link, PR number, or branch name to the PR head branch or named branch.
- Check whether the target branch is already the currently checked out local branch. If it is, continue.
- For another branch, use `code-review`'s isolated worktree. Never switch or stash the user's checkout.
- Launch only after confirming the target head and base in that worktree.

Use this exact prompt shape:

```text
Full Repository Path: <absolute repository path>
Diff: <one of: "branch changes", "uncommitted changes">
Base Branch: <only include this line when reviewing branch changes against a known specific base branch>
Custom Instructions: <only include this line when the user gave specific review instructions>
```

Default to `branch changes`, which reviews branch changes against the merge-base with the default/base branch, including committed, staged, and unstaged changes. If the user asks to review only uncommitted, local working tree, dirty, or not-yet-committed changes, use `uncommitted changes`.

If the review subagent fails before producing findings, inspect the failure text.

- If the failure is caused by calling the subagent incorrectly, such as a missing `Full Repository Path`, missing `Diff`, wrong prompt shape, or wrong subagent type, correct the invocation and retry it once immediately.
- For any other subagent failure, retry once with the same prompt shape.
- If the same failure persists after the retry, stop. Briefly tell the user that the review subagent could not complete and include the short error or blocker. Do not keep retrying.

After the subagent finishes, return evidence to the parent `code-review` pass. The parent verifies
blockers, deduplicates findings, and owns the only user-facing verdict. Backend output expectations:

- If it reports that no diff was found or the diff is empty, tell the user in one sentence that there was no diff to review.
- If it found no issues, give a one-line status such as "Security review found 2 findings / Security review found no issues".
- For issues, return severity, file:line, concrete consequence, and supporting evidence, worst first.
  The parent formats findings using `code-review`'s report, not a separate backend report.

Do not fix findings or rerun review unless the user explicitly asks for that next step.
