# GitHub-issues plan — planning-repo cookbook

The implementation pipeline (`spec` → `plan-review` → `implement` → `code-review`) tracks work as
**GitHub issues in `KevinKab2412/planning`** (private, issues-only) — the same home
[`wayfinder`](../../../wayfinder/SKILL.md) uses for its maps, so a map and the spec built from it sit
together, branch-independent and out of any shared code repo. All commands use `gh`; none touch
`git commit`/`git push`, so the global push guard never fires. `R=KevinKab2412/planning` throughout.

**Always pass `-R $R`.** `gh` defaults to the repo of the current directory, so an omitted `-R` files
the plan into whatever code repo you happen to be standing in — the one mistake this cookbook exists
to prevent. And never write the plan into the tracker the work originated from (Linear, Jira): name
that ticket's id in the epic instead and leave the ticket untouched.

The **epic** is one issue; each **task** is a sub-issue of it.

## Ensure labels exist (idempotent — run once)

```bash
R=KevinKab2412/planning
gh label create -R $R "spec:epic"    --color 5319e7 --description "Accepted plan — the epic" --force
gh label create -R $R "spec:task"    --color 1d76db --description "Bounded behavioral slice under an epic" --force
gh label create -R $R "blocked"      --color b60205 --description "Has an open blocker — not on the frontier" --force
gh label create -R $R "needs-human"  --color d93f0b --description "Human approval required before proceeding" --force
gh label create -R $R "architecture:checkpoint" --color fbca04 --description "Architecture gate required before the next batch" --force
```

## Create the epic

```bash
R=KevinKab2412/planning
EPIC_URL=$(gh issue create -R $R --label "spec:epic" \
  --title "<originating ticket id, if any>: <task title, ≤180 chars>" \
  --body "<the full spec from the spec skill>")
EPIC_N=${EPIC_URL##*/}
```

`EPIC_N` is the epic's issue number — the handle every downstream stage uses. Refer to it by **title**
in narration, not a bare `#N`. Since the plan lives outside the code repo, the epic body must also name
the **code repo and branch** the work targets, or a later reader can't tell what it applies to.

## Create a task (sub-issue of the epic)

```bash
R=KevinKab2412/planning
# 1. create the task with its behavior, acceptance examples, seam, and architecture fence
TASK_URL=$(gh issue create -R $R --label "spec:task" \
  --title "<task title>" \
  --body "$(cat <<'MD'
## Scope
<what this slice delivers, end-to-end>

## Test seam
<the confirmed seam>

## Acceptance examples
- [ ] <human-approved example tied to a user story>
- [ ] <independently sourced expected result>

## Architecture contract
**Contract:** <named architectural neighborhood>
**Module:** <module or established seam>
**Knowledge owned:** <decisions localized here>
**Allowed dependencies:** <edges>
**Forbidden dependencies:** <edges>
**Boundary data:** <allowed inward-facing values and forbidden outer types>
**Allowed neighborhood:** <modules or interfaces the agent may change without escalation>
**Predicted touchpoints:** <likely files or modules; differences require explanation>

## Verification
**Hard guards:** <commands or binary checks>
**Diagnostic signals:** <evidence to report, not unconfigured thresholds>

## Escalate when
- <strategic decision the implementation agent must return to the human>

## Checkpoint
**Cadence:** <after this task | after N related tasks | before crossing named seam>
**Reassess:** <architectural uncertainty implementation should resolve>
MD
)")
TN=${TASK_URL##*/}
# 2. link it as a sub-issue of the epic (sub_issue_id is the DATABASE id; -F sends it as an integer)
gh api --method POST repos/$R/issues/$EPIC_N/sub_issues -F sub_issue_id=$(gh api repos/$R/issues/$TN --jq '.id')
```

## Wire blocking + human gates (second pass, after tasks exist)

```bash
# task blocked by another → label + record in body's "Blocked by" line
gh issue edit -R $R <TN> --add-label "blocked"          # (edit body to list "Blocked by #<BLOCKER_N>")
# once every named blocker is closed → move the task onto the frontier
gh issue edit -R $R <TN> --remove-label "blocked"
# irreversible op (migration, schema change, external write) → gate it
gh issue edit -R $R <TN> --add-label "needs-human"      # implement will stop and ask before this one
# after explicit approval → persist the decision, then clear the gate for fresh workers
gh issue comment -R $R <TN> --body "## Human gate approved
**Decision:** <approved operation and constraints>
**Date:** <ISO date>"
gh issue edit -R $R <TN> --remove-label "needs-human"
# uncertain seam or contract cadence → inspect before starting the next batch
gh issue edit -R $R <TN> --add-label "architecture:checkpoint"
```

## Read the plan

```bash
# epic body (the spec)
gh issue view -R $R <EPIC_N> --json title,body,labels
# all tasks under the epic
gh api repos/$R/issues/<EPIC_N>/sub_issues --jq '.[] | "#\(.number) [\(.state)] \(.title) | \((.labels|map(.name))|join(","))"'
# the frontier = open tasks with no "blocked" label
```

## Record a prototype verdict on the epic

```bash
gh issue comment -R $R <EPIC_N> --body "prototype verdict: <one line>; settings it depends on: <knobs>; learned: <one line>"
```

The prototype itself is never committed and never branched (see
[`../prototype/SKILL.md`](../prototype/SKILL.md) capture step 2), so this comment and the spec are the
only durable trace — carry the numbers here rather than pointing at something runnable.

## Record an architecture checkpoint

After the human accepts `/architecture`'s gate, comment on the checkpoint task with the exact batch
range or patch digest, gate, guard results, drift, decision, and any approved contract revision. Append
approved contract revisions to the epic as `## Architecture Contract revision <N>` so fresh agents can
recover the current fence. Close a checkpoint task only when its accepted gate is `Continue`.

## Complete a task / close the epic

```bash
gh issue close -R $R <TN>       # a finished task; checkpoint tasks close only after Continue
gh issue close -R $R <EPIC_N>   # the epic, when review passes
```

## Find open epics (for `pair resume`)

```bash
gh issue list -R KevinKab2412/planning --label "spec:epic" --state open --json number,title,url
```

**No `gh`?** Fall back to a Markdown checklist of the spec + tasks and tell the user GitHub tracking
was skipped. There is no local DB — the issues *are* the plan.
