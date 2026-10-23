# Comment behaviour evaluations

These synthetic cases exercise selection, proportionality, evidence claims, re-review, and comment
formulation. They are optional model evaluations, not network calls in the unit test suite.
`tests/test_code_review_contract.py` checks the instructions and case inventory structurally; it
does not prove that a model follows them.

## Run and assess

1. Give a fresh model context `code-review/SKILL.md`,
   `code-review/references/constructive-review.md`, and one case's `prompt` from `evals.json`.
   For a baseline comparison, use the same prompt with the previous committed skill version.
2. Disable tools, external lookups, repository writes, and session persistence. The cases contain
   all supplied facts; the model drafts for the reviewer who performed the stated investigation.
   Do not ask it to fabricate additional experiments. Explicitly request only the JSON fields in
   `response_fields`, rather than a full report, for this focused exercise.
3. Save raw generated outputs, model identifier, skill revision, command, timing, and errors outside
   the repository. Use an explicitly bounded cost/time budget. Do not run these calls implicitly
   during unit tests or contact production services.
4. Check classification and merge action against the allowed values. Then assess each natural-
   language assertion against the actual output, recording evidence for the judgment. Semantic
   quality matters more than exact wording. Do not count a parser, auth, quota, or provider error
   as an incorrect review or as a passing result; report it as unavailable.
5. Compare baseline and augmented outputs for unsupported claims, unnecessary work, clarity, and
   useful completion conditions. Report ties honestly. A small synthetic run is a smoke check,
   not proof of general reliability or independent human merge clearance.

When inference is unavailable, retain the cases and disclose that only structural validation and
manual scenario checks were completed. Re-run the behavioural comparison when the service becomes
available; do not infer a quality improvement from instruction-string tests alone.
