# Blast-radius banner — tell the reviewer how hard to look

A PR body's job is to orient a reviewer. But reviewers now read *less* code, not more — one person
ships what a team used to, and reading every line of every PR is no longer possible. So the most
useful thing a PR body can carry, after the summary, is a signal for **where to spend the reading
budget**: which files hide bugs only a line-by-line read will catch, and which are safe to skim.

That signal is the **blast radius** of the change. Think of the codebase as a tree. The trunk is the
core — entry points, shared state, infra that many things depend on; break it and the whole app
feels it. The leaves are isolated — a one-off component, a new gated endpoint, code nothing else
imports yet; break it and the blast is contained. Review depth should track blast radius: deep on
the trunk, a skim on the leaves.

Reach alone doesn't set the depth, though. A broken page frame reaches every route, but the first
person who opens the app sees it, and a screenshot catches it more cheaply than a reviewer can. A
store-scoping bug can reach the same routes and look perfectly fine on screen — only reading the code
catches it. So the deep read goes where a bug would be **silent** or **permanent**; a wide but **loud**,
revertible change with live proof gets a spot-check.

`to-pr` stamps this as a banner at the very top of the body. It is a **structural** read of the diff,
not a quality judgment — it says *how hard to look*, never *whether the code is good*. `to-pr` does
not review, and the banner never claims to. It is the reviewer's dial, set from the shape of the diff.

## The five signals

Rate the changed non-test files on five signals. **Failure** and **reversibility** decide whether a
file earns a deep read: a silent bug on a live path, or a true one-way door. **Position** and
**behavior** say how far a bug would reach. **Proof** says how much the reviewer can trust without
reading.

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

### 3. Failure — loud or silent

If this code is wrong, how does anyone find out?

- **Loud:** the page won't render, the app won't boot, a request errors, the layout visibly breaks,
  a load hangs. Anyone who clicks through the changed path sees it, so a screenshot or a live run
  catches it before a reviewer would.
- **Silent:** a user, tenant or store sees or edits data that isn't theirs; a permission is granted or
  denied wrongly; numbers come out wrong but plausible; data is deleted; an error is swallowed or
  never reaches monitoring. Nothing looks broken, and only reading the code catches it.
- **Detect it.** For each trunk or live-path file, name the worst plausible bug in one line, then ask
  whether a person clicking through the app would notice it. Access checks, tenant/store scoping,
  money, deletes and error reporting are silent by default. If you can't tell, call it silent.

### 4. Reversibility — can you take it back

After a rollback, is the world back where it was, or does something stay changed?

- **Detect it.** Look for what a `git revert` can't undo, and for a gate that makes rollback instant:
  ```bash
  # one-way-door candidates
  git diff --name-status <base>...HEAD | grep -iE 'migrations?/|alembic|schema'
  # gates
  git diff <base>...HEAD | grep -iE 'launchdarkly|useflag|isenabled\(|feature_?flag|flags?\.|getflag|\bgate\b|process\.env\.[A-Z_]*ENABLE'
  ```
- **Revertible:** any code change a `git revert` and a deploy undo, flagged or not. A flag makes the
  rollback instant and pulls depth further down. A change with no flag still comes back with a
  revert, so it counts as revertible. Most repos ship most work without flags; reading "no flag" as
  "one-way door" paints every PR red, and then the dial tells the reviewer nothing.
- **One-way door:** a data or schema migration whose reverse doesn't restore the data, a deletion of
  customer data or files, an API contract that clients outside this deploy depend on, a schema
  upgrade of a stateful dependency (e.g. an MLflow or database version bump that migrates its store).
  When in doubt, treat it as a one-way door.

### 5. Proof — evidence attached

Tests, screenshots, runtime logs, a stated confidence level. Proof lets a reviewer trust and skim
instead of manually checking, so it pulls required depth **down**. Its absence pushes depth **up**.

- **Detect it.** Test files in the diff; a screenshot/video or confidence line in the explainer or an
  existing PR body; runtime logs pasted in.
- **Live proof** means someone ran the changed path: screenshots of the changed screens, a live
  request, a run against a real store. It catches loud bugs, so it moves a loud, revertible trunk
  change from 🔴 to 🟠.
- **The limits:** proof never lowers a silent-failure or one-way-door file, and never takes a trunk
  change to 🟢. Strong proof on a leaf change makes a skim fine.

## The band — worst file wins

One deep-read file in an otherwise-leaf PR still needs a deep read *on that file*. So the overall
banner takes the **highest** depth any single file demands, not the average. Decision rule:

| Band | When | What the reviewer does |
|---|---|---|
| 🔴 **Deep read** | a trunk file or live path where a bug would be **silent**; **or** a one-way door; **or** a loud trunk change with no live proof | read every line of those files |
| 🟠 **Spot-check** | trunk or live behavior where a bug would be **loud**, revertible, with live proof attached; shared code that's gated or not wired in yet; a silent risk confined to a leaf | read the load-bearing hunks; trust the proof for the rest |
| 🟢 **Skim** | leaf, additive or gated, proof attached; a purely mechanical diff; or code that never reaches prod (local dev tooling, docs) | glance; trust the gate and the tests |

**When unsure, round up** — a failure you can't place as loud counts as silent, and a rollback you
can't vouch for counts as a one-way door. Safety over speed; that is the whole point of the dial.

## The banner

Place it at the **very top of the PR body**, above the summary. It is one line of prose (which counts
toward the 150-word cap) plus a table (which does not). Fill the "This PR" column with the real,
concrete finding for this diff — a count, a filename, "no flag" — never a bare "trunk".

**Name the specific reason, not the band.** For 🔴 and 🟠, the clause after the band must say *what
in this PR* earns the depth and *what goes wrong if it's missed* — the concrete subsystem, not a
generic label. "Deep read" tells the reviewer nothing; "Deep read because it touches the permissions
system — a bug here silently grants or denies access" tells them exactly where to spend the budget and
what to watch for. Pull the reason from the worst signal (the silent failure, the migration, the
external contract). 🟢 Skim can stay brief — a skim needs no justification.

```
> **🔴 Blast radius: Deep read** — touches the permissions system (`auth/policy.ts`); a bug here silently grants or denies access. Read every line.
>
> | Signal | This PR | → depth |
> |---|---|---|
> | Position | trunk · 9 files import `auth/policy.ts` | deep |
> | Behavior | changes existing access checks | deep |
> | Failure | silent · a wrong check grants access with no error | deep |
> | Reversibility | no flag · a revert undoes the code, not a leak | up |
> | Proof | unit tests only, no screens | up |
```

```
> **🟠 Blast radius: Spot-check** — replaces the page frame every route renders through; a bug shows on first load, and the screenshots cover each route.
>
> | Signal | This PR | → depth |
> |---|---|---|
> | Position | trunk · `template()` wraps all 63 routes | deep |
> | Behavior | every page's chrome changes | up |
> | Failure | loud · a broken frame shows on load | down |
> | Reversibility | no flag · `git revert` restores the old frame | down |
> | Proof | render tests, screenshots of every route | down |
```

```
> **🟢 Blast radius: Skim** — new isolated component, nothing imports it yet; tests attached.
>
> | Signal | This PR | → depth |
> |---|---|---|
> | Position | leaf · 0 importers | skim |
> | Behavior | additive only | skim |
> | Failure | contained · nothing renders it yet | skim |
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
- **The table is the "all the info needed" part.** Five rows carry the full reasoning for free; the
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
- **A dial stuck on one colour has stopped working.** The band earns its place by telling PRs apart.
  If nearly every PR in a repo comes out 🔴, recheck the Failure and Reversibility rows: a loud,
  revertible change with live proof is a 🟠.
- **The user can override.** If they set a band explicitly, use theirs and keep the table as the
  evidence for the reader.

> **At a glance:** the banner is a structural read of the diff — deep where a bug would be silent or permanent, a spot-check where it would be loud and revertible. It sets *how hard to look*, never whether the code is good.
