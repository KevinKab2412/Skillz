# Verification-method bank

Read this index when choosing a verifier or assessing whether supplied checks support a material
claim. Read only the matching entries. This bank complements expert/domain research and
version-matched official docs; approved requirements remain the acceptance bar.

## Select by claim

| Claim to establish | Method | Possible tools |
|---|---|---|
| Approved appearance is preserved for named views and states | [Pixel diff](methods/pixel-diff.md) | Existing screenshot comparator, Playwright |
| An action produces the specified response, state, or rejection | [Behavioral assertions](methods/behavioral-assertions.md) | Pest, pytest, existing browser/API/CLI runner |
| Domain invariants hold across generated inputs | [Property-based testing](methods/property-based.md) | Hypothesis, existing property runner |
| Interfaces satisfy agreed consumer/provider expectations | [Contract testing](methods/contract.md) | JSON Schema/OpenAPI validators, Pact |
| A replacement preserves approved reference behavior | [Differential testing](methods/differential.md) | Existing paired API/browser/CLI clients |
| Input transformations preserve a justified output relationship | [Metamorphic testing](methods/metamorphic.md) | Existing test/property runner |
| Encode/decode or export/import preserves required information | [Round-trip checks](methods/round-trip.md) | Existing serializer/import/export runner |
| Action sequences obey approved lifecycle transitions | [State-machine testing](methods/state-machine.md) | Hypothesis stateful, existing workflow runner |
| Named failures produce safe handling and recovery | [Fault injection](methods/fault-injection.md) | Controlled fixtures, Toxiproxy |
| Replays and overlapping operations preserve durable invariants | [Concurrency/replay checks](methods/concurrency-replay.md) | Independent clients, barriers, real test database |
| A pipeline or migration preserves aligned source data | [Data reconciliation](methods/data-reconciliation.md) | Read-only SQL, existing data test runner |
| Named workloads meet approved latency/resource budgets | [Performance benchmarks](methods/performance.md) | pytest-benchmark, k6, existing load runner |
| UI states meet specified automated and manual accessibility criteria | [Accessibility checks](methods/accessibility.md) | axe, browser runner, keyboard/assistive checks |
| Tests detect deliberately introduced defect classes | [Mutation testing](methods/mutation.md) | Infection, mutmut, safe manual mutation |

Methods describe evidence; tools execute checks. A tool choice or green suite alone does not
establish acceptance coverage. Combine methods where one leaves material claims untested. This is
a starter bank, not an exhaustive menu: select another defensible method when these do not fit.

## Selection and review

1. Carry forward domain invariants, failure modes, and the approved outcomes. Map each material
   claim to an observable public seam and a suitable method; explain why that method fits.
2. Inspect repository tests, manifests, lockfiles, plugins, configuration, fixtures, and CI commands.
   Reuse installed tooling and conventions. Consult [framework adapters](framework-adapters.md)
   for Pest/pytest discovery and primary documentation; do not install a new runner by default.
3. Record cases, independent expected-result sources, environment, exact commands, passing criteria,
   threshold rationale, and blind spots in the caller's existing verifier brief. Identify any
   material claim requiring a complementary method or human decision.
4. Demonstrate that a safe known-bad example fails the relevant check, retaining the caller's
   mutation/test-first requirements. Use an isolated test fixture or temporary change and restore it.
5. Run and inspect the evidence. Report passed, failed, and untested separately, including unsupported
   claims. Follow [behavior evidence](behavior-evidence.md) for recording, identity, safe artifact
   handling, stale evidence, and implementation-to-review handoff.

Review checks the mapping and oracle as well as results. A missing library entry is not a defect;
flag a verification gap only with its concrete consequence and applicable requirement. Supplied
runs remain distinct from reviewer-reproduced checks.

## Provenance and execution status

These entries are curated generic recipes, not expert-corpus findings. No experts MCP consultation
informed this initial bank. Framework/source validation status for the original entries is recorded
in [framework adapters](framework-adapters.md); added entries identify their public primary sources
and are illustrative and unexecuted. Consult installed-version docs before adopting any recipe.

## Add an entry

Use a generic, independently written example and public primary sources. Keep proprietary code,
screenshots, fixtures, configuration, names, and derived private details out of this public bank.
Each entry must include suitable claims, prerequisites, an independent reference, an execution
recipe with a small example and command, passing criteria, a known-bad check, blind spots, and
official documentation. Mark examples' assumptions and distinguish illustrative recipes from
executed checks. Link documentation rather than mirroring whole sites; resolve API details against
the caller's installed versions at use time. Record unavailable sources rather than inventing
verified compatibility. Add the entry to the claim table and keep shared policy in its existing home.
