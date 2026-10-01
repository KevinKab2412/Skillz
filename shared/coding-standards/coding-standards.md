# Coding standards — the judgment-call doc, and what a reviewer reports about it

A shared reference for skills that read or grow a repo's `CODING_STANDARDS.md` — `code-review` reads
it, `retro` grows it. A review needs two inputs it must never confuse: a deterministic linter config
(mechanical rules, enforced automatically, free to check) and a document of judgment calls (patterns no
linter can express — "state holds UI state, delegates work," "this project calls it a `pool` not a
`batch`"). Only the second kind belongs in `CODING_STANDARDS.md`.

## What goes in `CODING_STANDARDS.md`

Repo root, same tier as `AGENTS.md` and `CONTEXT.md`. Reserve it for rules a human reviewer would have
to actually think about, not ones a tool could flag instantly:

- **Belongs:** cross-file consistency, domain vocabulary, architectural shape (module depth, seam
  placement), "matches the surrounding style" calls with no mechanical test.
- **Doesn't belong:** anything expressible as a lint rule, a banned import, a naming regex, a file-size
  limit, an import-order rule. Those go in the repo's own linter config, a pre-commit hook, or a CI job
  — never duplicated here. A rule migrating from here to a config file is the file doing its job.

## The maturity vector — is there a standard to check the diff against at all

Report this **separately** from whether the diff follows it. A codebase can have no standard (nothing
to measure the diff against) or a strong one the diff ignores — different problems, different fixes.

| Read | Signal |
|---|---|
| 🔴 **None set** | No `CODING_STANDARDS.md`/`CONTRIBUTING.md`, no configured linter rules beyond defaults. The review runs on the generic Fowler-smell baseline only. |
| 🟡 **Partial** | One of the two exists, or the file is thin or stale — a few lines, untouched a long time, covers only naming. |
| 🟢 **Solid** | A maintained `CODING_STANDARDS.md` with specific, enforceable judgment calls, a linter config with real configured thresholds, or both. |

**Detect it:** check repo root for `CODING_STANDARDS.md` / `CONTRIBUTING.md` / `docs/standards*`; check
for a linter config (`ruff.toml`, `pyproject.toml`'s `[tool.ruff]`, `.eslintrc*`, etc.) with rules beyond
the tool's defaults. Read whatever exists in full — it's short by design.

## The compliance vector — does *this diff* follow it

This is the review itself: the findings a reviewer already produces, each citing the rule it violates.
Nothing new here — it's the half of the pair that already existed. The maturity read above just stops
it from being the only signal reported. A clean compliance pass against no standard is not the same
thing as a clean pass against a real one, and a reader should never have to guess which happened.

## Growing the file (what `retro` does with this)

A recurring finding is a signal about the standard, not just the diff. When the same should-fix shape
shows up across sessions, classify it before acting:

- **Mechanical** (a fixed syntactic pattern — banned API, import shape, file-location rule) → a
  deterministic check: a linter rule, a pre-commit hook, or a CI job. Build the check; don't write the
  rule down.
- **Judgment call** (no mechanical test could ever catch it) → one line in `CODING_STANDARDS.md`, in
  the project's own vocabulary, next to the rules it's most easily confused with.

Default to the mechanical check whenever one is possible — it never needs to be read, restated, or
remembered by a reviewer. Reserve the doc for the rules that genuinely need judgment.

## Honesty rules

- **Never invent a maturity grade.** 🟢 requires reading the actual file and finding real content — a
  stub `CODING_STANDARDS.md` with one line is 🟡 at best.
- **Say what's missing, not just what's there.** "No `CODING_STANDARDS.md`, no linter config" is a
  useful 🔴 finding on its own — more useful than silence.
- **A 🔴 or 🟡 read is itself a signal `retro` should run** — say so once, don't repeat it per finding.
