# Pending draft reviews — save without submitting

Use only after the user authorizes saving draft comments on this PR. Draft permission and submission
permission are separate. Do not use `gh pr review` for drafts: it submits a review.

## Reconcile before writing

1. Resolve the repository and PR explicitly. Read the current head, all discussion pages, reviews,
   review comments, and author replies. Check for an existing pending review by the authenticated
   user. Do not create duplicate drafts or overwrite unrelated work.
2. Compare the current head with the reviewed commit. If it changed, revalidate affected findings
   and anchors before creating the draft. If you cannot, stop and report stale evidence.
3. Reconcile candidates with existing feedback. An acknowledged issue needs new supporting evidence,
   not another identical request. Link an existing issue-comment discussion from the pending review
   body; a live reply to that discussion is outside draft-only permission.
4. Make each author-facing comment self-contained: condition, observed result, consequence, scoped
   collaborative request, and completion condition. Put longer reproduction steps in the review body
   or an inline code block, not solely in local temporary files. Distinguish product questions and
   requested UX adjustments from reproduced defects.

## Create a pending review

For a new draft, use GitHub's create-review REST endpoint with the exact reviewed `commit_id`, a
review `body`, and optional inline `comments`. Each inline comment has `path`, `line`, `side: "RIGHT"`
(or the correct old-side anchor), and `body`. Validate anchors against the current PR diff. Write the
payload outside the repository if it is a temporary review artifact.

```bash
gh api repos/<owner>/<repo>/pulls/<number>/reviews \
  --method POST --input /tmp/pending-review.json
```

**Omit `event` entirely.** Omitting the event creates a `PENDING` review. Do not send `APPROVE`,
`REQUEST_CHANGES`, or `COMMENT`, do not call a submit-review endpoint, and do not post issue comments
as a fallback. If creating a draft fails, inspect the error and remote state before retrying; the
first request may already have succeeded.

If there is already a pending review, read its body and comments first. Update only authorized
comments using endpoints that preserve pending state, or ask before replacing the review. Never
delete the user's existing draft to simplify implementation. Avoid duplicating a review after an
uncertain response.

## Verify, then stop

Read the review and its comments back from GitHub. Verify:

- the review belongs to the authenticated user and the intended PR;
- its state is `PENDING` and its commit matches the reviewed head;
- the body, comment count, paths, lines, and text match what was intended;
- no live issue comment, approval, request-changes review, or merge was created.

Some review-comment REST responses expose diff positions without `line`. In that case, query each
comment's GraphQL node by its `node_id` and verify `path`, `line`, `state`, and
`pullRequestReview { state }`; do not guess that a missing REST field means the anchor was lost.

Return the PR link, review id, draft-comment count, and a brief note of what was consolidated into
the review body. Explicitly say **saved as a pending draft; not submitted**. Do not submit later
without the user's explicit authorization. A pending draft is available to its author, not published
feedback to the team.
