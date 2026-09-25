# Blast-radius banner — tell the reviewer how hard to look

A PR body's job is to orient a reviewer. But reviewers now read *less* code, not more — one person
ships what a team used to, and reading every line of every PR is no longer possible. So the most
useful thing a PR body can carry, after the summary, is a signal for **where to spend the reading
budget**: which files are a one-way door that need every line read, and which are safe to skim.

That signal is the **blast radius** of the change. Think of the codebase as a tree. The trunk is the
core — entry points, shared state, infra that many things depend on; break it and the whole app
feels it. The leaves are isolated — a one-off component, a new gated endpoint, code nothing else
imports yet; break it and the blast is contained. Review depth should track blast radius: deep on
the trunk, a skim on the leaves.

`to-pr` stamps this as a banner at the very top of the body. It is a **structural** read of the diff,
not a quality judgment — it says *how hard to look*, never *whether the code is good*. `to-pr` does
not review, and the banner never claims to. It is the reviewer's dial, set from the shape of the diff.

## The four signals

Rate each changed non-test file leaf → trunk on four signals. Each one that leans trunk pushes review
depth up. Position and reversibility dominate — they are the "one-way door" test; behavior and proof
modulate.

### 1. Position — where in the tree

Trunk = core entry points, shared state, infra many things depend on. Leaf = isolated, few or no
dependents.

- **Detect it.** For each changed non-test file, count what imports it:
  ```bash
  # rough downstream-dependent count for a changed module
  git diff --name-only <base>...HEAD | while read f; do
    mod=$(basename "$f" | sed 's/\.[^.]*$//')
    n=$(grep -rl --include='*.*' -e "$mod" . 2>/dev/null | grep -v "$f" | wc -l | tr -d ' ')
    echo "$n  $f"
  done | sort -rn
  ```
- **Trunk tells:** many importers; or the file is a known hub — app entry (`App`, `main`, `index`),
  router, store / reducer / global state, shared util or type, auth, networking, config schema, a DB
  migration.
- **Leaf tells:** zero or one importer; a newly added self-contained file; a component or helper
  nothing else consumes yet.

### 2. Behavior — the control experience

Does the change alter behavior that already runs in production (the "control experience"), or only
add new code that nothing calls yet?

- **Detect it.** `git diff --name-status <base>...HEAD`. An `A` (added) file that is not wired into
  an existing path is additive → leaf. An `M` (modified) file that edits functions or branches
  already on a live path changes the control experience → trunk. Deletions and renames of live code →
  trunk.

### 3. Reversibility — can you take it back

Gated behind a flag with an easy rollback, or an ungated one-way door?

- **Detect it.** Grep the diff for a gate:
  ```bash
  git diff <base>...HEAD | grep -iE 'launchdarkly|useflag|isenabled\(|feature_?flag|flags?\.|getflag|\bgate\b|process\.env\.[A-Z_]*ENABLE'
  ```
- **Reversible / leaf:** the change is wrapped in a new or existing flag; flip it off and the old
  behavior returns.
- **One-way door / trunk:** a schema or data migration, an API-contract change, a deletion, or any
  ungated change to existing behavior. When in doubt, treat as ungated.

### 4. Proof — evidence attached

Tests, screenshots, runtime logs, a stated confidence level. Proof lets a reviewer trust and skim
instead of manually checking, so it pulls required depth **down**. Its absence pushes depth **up**.

- **Detect it.** Test files in the diff; a screenshot/video or confidence line in the explainer or an
  existing PR body; runtime logs pasted in.
- **The asymmetry:** strong proof on a leaf change makes a skim fine. Proof never on its own makes a
  trunk change safe to skim — you still read the one-way door.

## The band — worst file wins

One trunk file in an otherwise-leaf PR still needs a deep read *on that file*. So the overall banner
takes the **highest** depth any single file demands, not the average. Decision rule:

| Band | When | What the reviewer does |
|---|---|---|
| 🔴 **Deep read** | any trunk-position file, **or** an ungated change to existing behavior | read every line — this is a one-way door |
| 🟠 **Spot-check** | touches shared code **or** changes behavior, but gated or well-proven | read the load-bearing hunks; trust the rest |
| 🟢 **Skim** | leaf, additive or gated, proof attached (or a purely mechanical diff) | glance; trust the gate and the tests |

**When unsure, round up** — toward the deeper read. Safety over speed; that is the whole point of the
dial.

## The banner

Place it at the **very top of the PR body**, above the summary. It is one line of prose (which counts
toward the 150-word cap) plus a table (which does not). Fill the "This PR" column with the real,
concrete finding for this diff — a count, a filename, "no flag" — never a bare "trunk".

**Name the specific reason, not the band.** For 🔴 and 🟠, the clause after the band must say *what
in this PR* earns the depth and *what goes wrong if it's missed* — the concrete subsystem, not a
generic label. "Deep read" tells the reviewer nothing; "Deep read because it touches the permissions
system — a bug here silently grants or denies access" tells them exactly where to spend the budget and
what to watch for. Pull the reason from the worst signal (the trunk file's name, the ungated flow, the
migration). 🟢 Skim can stay brief — a skim needs no justification.

```
> **🔴 Blast radius: Deep read** — touches the permissions system (`auth/policy.ts`); a bug here silently grants or denies access. Read every line.
>
> | Signal | This PR | → depth |
> |---|---|---|
> | Position | trunk · 9 files import `auth/policy.ts` | deep |
> | Behavior | changes existing access checks | deep |
> | Reversibility | ungated, no flag | deep |
> | Proof | unit tests only, no screens | up |
```

```
> **🟠 Blast radius: Spot-check** — reworks the checkout flow, but behind the `new_checkout` flag so it rolls back cleanly. Read the load-bearing hunks.
>
> | Signal | This PR | → depth |
> |---|---|---|
> | Position | shared · `checkout/` used by 3 routes | up |
> | Behavior | changes existing behavior | up |
> | Reversibility | gated · `new_checkout` flag | down |
> | Proof | unit + e2e tests, screenshot | down |
```

```
> **🟢 Blast radius: Skim** — new isolated component, nothing imports it yet; tests attached.
>
> | Signal | This PR | → depth |
> |---|---|---|
> | Position | leaf · 0 importers | skim |
> | Behavior | additive only | skim |
> | Reversibility | new file, easy revert | skim |
> | Proof | snapshot test + screenshot | skim |
```

## Keep it tight — the budget

The banner lives inside `to-pr`'s output discipline: the whole PR body is capped at **150 words of
prose**, and words inside a visual don't count. So the banner is almost free — the table is a visual,
and only the one-line band clause spends any of the 150. Hold these caps:

- **Band clause:** one line, ≤ 20 words. Subsystem + the risk, nothing more. If it needs two lines,
  it's carrying detail that belongs in the summary.
- **Table cells:** a few words — a count, a filename, "no flag". Never a sentence.
- **No repeats.** The banner names the risk once. Don't restate it in the summary below, and don't
  restate the summary in the banner. Each line in the body earns its place by adding something new.
- **The table is the "all the info needed" part.** Four rows carry the full reasoning for free; the
  prose just points at the worst one. When you're tempted to explain the band in prose, add a word to
  the relevant cell instead.

**Mixed PR (trunk + leaf).** When most files are leaf but one or two are trunk, keep the band at the
worst file and add a single line under the table naming which files carry the depth, so the reviewer
spends the budget in the right place:

```
> **Deep-read files:** `store/reducer.ts`, `api/auth.ts` — the other 4 files are leaf; skim them.
```

## Honesty rules

- **Structural, not a verdict.** The banner says how hard to look. It never says the code is right or
  wrong — that is `code-review`'s job, and its "severity" (blocker / should-fix / nit) is a different
  axis. Don't infer defects here.
- **Never claim proof that isn't there.** "no tests, no screens" is a true, useful row. Inventing a
  screenshot to lower the band is the one failure that makes the dial worse than nothing.
- **Round up under doubt.** An unclear file is a deeper read, not a skim.
- **The user can override.** If they set a band explicitly, use theirs and keep the table as the
  evidence for the reader.
