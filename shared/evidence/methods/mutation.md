# Mutation testing

## Suitable claims

The selected verification suite detects deliberately introduced classes of implementation defects.
This measures verifier sensitivity and complements the caller's focused known-bad check.

## Prerequisites

A green baseline, isolated worktree, relevant tests, bounded target scope/time budget, and an existing
mutation runner such as Infection or mutmut. Restrict edits to local test code/builds; restore all
temporary mutations. Inspect version-specific commands and selection rules before execution.

## Independent reference and passing criteria

Approved acceptance outcomes determine which mutations matter. Classify killed, survived, uncovered,
equivalent, invalid, and timed-out mutants separately. Record runner scoring semantics and exclusions.
Use only repository-approved score thresholds; investigate material survivors even when an aggregate
score passes. A timeout is not proof that an assertion observed the intended wrong behavior.

## Execution recipe — illustrative PHP/Infection run

Assumes Infection and its required coverage tooling are already configured and installed, and the
normal baseline tests pass. The path is a generic example, not a request to add a mutation dependency.

```sh
./vendor/bin/infection --filter=src/Domain/DeliveryEligibility.php --threads=1
```

Inspect each relevant survivor in the runner's report. For a boundary rule, determine whether changing
`>=` to `>` is caught by a test at the boundary. Add independent acceptance assertions for meaningful
gaps and rerun the focused suite and mutation selection. For Python, inspect the installed mutmut
version's configuration and CLI; do not assume Infection's flags transfer.

## Known-bad check

Use a small known mutation, such as the boundary change, and confirm the expected test kills it for
the expected assertion. If a mutant is marked killed only by an unrelated crash or timeout, report
that distinction. Restore the baseline and verify the ordinary suite still passes.

## Blind spots

High mutation scores do not prove missing features, absent requirements, security, or complete
correctness. Equivalent mutants can survive legitimately; weak operator sets and excessive exclusions
can inflate scores. Mutation testing often needs bounded scope because of runtime cost.

## Official documentation

- [Infection command-line options](https://infection.github.io/guide/command-line-options.html)
- [mutmut](https://mutmut.readthedocs.io/en/latest/)

Check installed versions, baseline requirements, and report semantics. Recipe unexecuted.
