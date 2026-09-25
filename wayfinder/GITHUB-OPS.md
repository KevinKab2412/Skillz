# Wayfinder — GitHub operations cookbook

Every map and ticket is a GitHub issue in **`KevinKab2412/planning`** (private, issues-only). All commands use
`gh`; none touch `git commit`/`git push` (so the global push guard never fires). `R=KevinKab2412/planning`
throughout.

## Labels (already created in the repo)

`wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`,
`blocked`.

## Create the map

```bash
R=KevinKab2412/planning
gh issue create -R $R --label "wayfinder:map" \
  --title "<effort name>" \
  --body "$(cat <<'MD'
## Destination
<one or two lines>

## Code repo
<owner/repo this effort is for, or "n/a">

## Notes
<domain; skills to consult; standing preferences>

## Decisions so far

## Not yet specified
- <fog: suspected question / area to revisit>

## Out of scope
MD
)"
```

The command prints the map's URL — its number is the map id. Refer to the map by its **title** in
narration, never a bare `#N`.

## Create a ticket (sub-issue of the map)

```bash
# 1. create the ticket with its type label
TICKET_URL=$(gh issue create -R $R --label "wayfinder:grilling" \
  --title "<the decision this ticket resolves>" \
  --body $'## Question\n<the decision or investigation>\n\n## Blocked by\nnothing')
TN=${TICKET_URL##*/}

# 2. link it as a sub-issue of the map (sub_issue_id is the DATABASE id, not the number; -F sends it as an integer)
CID=$(gh api repos/$R/issues/$TN --jq '.id')
gh api --method POST repos/$R/issues/<MAP_N>/sub_issues -F sub_issue_id=$CID
```

Type label is one of `wayfinder:research|prototype|grilling|task`.

## Wire blocking (second pass, after tickets exist)

```bash
# mark a ticket blocked by another; record it in the body and add the label
gh issue edit -R $R <TICKET_N> --add-label "blocked"
# (edit the ticket body's "## Blocked by" line to list "#<BLOCKER_N>")
```

Frontier = open sub-issues **without** the `blocked` label and **unassigned**:

```bash
# all open tickets under the map
gh api repos/$R/issues/<MAP_N>/sub_issues --jq '.[] | select(.state=="open") | "#\(.number) \(.title) | assignee=\(.assignee.login // "—") | \((.labels|map(.name))|join(","))"'
# → the frontier is the rows with no "blocked" label and assignee "—"
```

## Claim a ticket (before any work)

```bash
gh issue edit -R $R <TICKET_N> --add-assignee @me
```

## Resolve a ticket

```bash
# 1. post the answer as a resolution comment (this is the primary source)
gh issue comment -R $R <TICKET_N> --body "**Resolved:** <the decision>. <why / what was learned>. <links to any asset, e.g. prototype/<slug> branch>"
# 2. close it
gh issue close -R $R <TICKET_N>
# 3. append a one-line pointer to the map's Decisions so far
#    (fetch the map body, add "- [<title>](<ticket-url>) — <gist>" under "## Decisions so far", edit it back)
gh issue edit -R $R <MAP_N> --body "<updated body>"
```

## Advance the frontier

```bash
# when <BLOCKER_N> closes, unblock everything it was blocking
gh issue edit -R $R <DEPENDENT_N> --remove-label "blocked"   # for each dependent whose last blocker is now closed
```

Graduate fog by creating new tickets (as above) and removing the corresponding line from the map's
**Not yet specified** section. Rule a ticket out of scope by closing it and adding a line to the map's
**Out of scope** section.

## Cross-link to the code repo

The map's `Code repo:` line names the repo. When a ticket produces an artifact in the code repo (a
prototype branch, a research note), put its URL in the resolution comment — the planning repo holds no
files, only issues, so every artifact lives *by reference*.

## Hand off to spec

When no open tickets remain:

```bash
# list every closed decision ticket + its resolution for the spec synthesis
gh api repos/$R/issues/<MAP_N>/sub_issues --jq '.[] | select(.state=="closed") | "#\(.number) \(.title)\n\(.body)\n"'
gh issue view -R $R <TICKET_N> --comments   # to pull each resolution comment
```

Feed those into [`spec`](../pair/references/spec/SKILL.md), which links each spec section back to its ticket URL as the
primary source.
