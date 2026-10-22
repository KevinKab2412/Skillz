---
name: standup
description: Generate a standup update from recent activity. Use when preparing for daily standup, summarizing yesterday's commits and PRs and ticket moves, formatting work into yesterday/today/blockers, or structuring a few rough notes into a shareable update.
argument-hint: "[yesterday | today | blockers]"
---

# Standup — internal utils module

> Check which Git, PR, tracker, and meeting tools are actually connected. Skip missing integrations
> and state the resulting coverage gap; never assume a platform-specific connector exists.

Generate a standup update by pulling together recent activity across your tools.

## History (do this first, and last)

Standup history lives in `~/Desktop/standups.db` (SQLite, schema in
[schema.sql](schema.sql) — run it against the file if it does not exist yet).
It exists so the update covers **everything since the last standup**, not
everything that happened today. Work done at 11pm and reported the next
afternoon still gets said once, in the right update.

### Before gathering

```bash
PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
sqlite3 ~/Desktop/standups.db \
  "SELECT id, covers_to, body FROM standups WHERE project='$PROJECT' ORDER BY created_at DESC LIMIT 1;"
```

- **A row came back** → its `covers_to` is the watermark. Gather from there to
  now (`git log --since='<covers_to>'`, PRs updated since, etc.). Read its `body`
  too — that is what the team already heard.
- **No row** → fall back to midnight today, and treat this as the first entry.

Then drop anything already spoken for:

```bash
sqlite3 ~/Desktop/standups.db "SELECT sha FROM reported_commits;"
```

Dedupe on sha, not just timestamp — a rebase can move a commit's date forward
across the watermark and make old work look new.

### Handling overlap

Work in flight across two standups is the normal case, not an edge case. When the
new activity continues something the last update already mentioned:

- Say what moved, not what the thing is again. "finished the campaign editor,
  list page and editor both done" — not "worked on the campaign editor".
- If it is genuinely still mid-flight with nothing to show, it belongs in a
  next-up line or nowhere. Repeating yesterday's sentence is worse than silence.
- If the watermark window turns up nothing new at all, say that in one line
  rather than padding the update with the last one's points.

The five-point cap still applies to the whole update.

### After delivering

Write the update, in the exact wording delivered:

```python
# body = the markdown as delivered; points = its "- " lines
# shas = commit hashes covered; prs = (repo, number) pairs touched
# covers_from = previous covers_to (or NULL); covers_to = now
```

Insert one `standups` row, its `points`, its `reported_commits` and
`reported_prs`. Use ISO8601 with offset for every timestamp.

**If the user rewrites the update** — which they often will, to match their voice
— update that row's `body` and replace its `points` so the history holds what was
actually said, not the draft.

## House Style (always applies)

These are not defaults to be negotiated — they hold unless the user overrides them in the invoking message.

- **Five points maximum.** Fewer is fine. If the day had more than five things worth saying, pick the five that a teammate would actually care about and drop the rest rather than compressing everything into sub-bullets.
- **One line per point.** No sub-bullets, no trailing clauses stapled on with semicolons or em-dashes to smuggle in a second thought. A fragment beats a full sentence — "foxybox data fixes for appointments per day" is a complete point.
- **Flat, not dramatic.** State what changed and stop. No adjectives rating the work ("nasty", "gnarly", "tricky", "subtle", "interesting"), no narrating how hard it was or what nearly went wrong, no counter-factuals about what a bug "would have" caused. If a thing was hard, that shows in the fact that it took the day, not in the wording.
- **No selling.** Don't editorialise the value of the work, quote metrics as evidence, flag that something is green, or ask for attention. "PR up to reconcile the AST with the segment exporter" — not "PR is green and ready if anyone has time to look".
- **Conversational.** Write it the way you would say it out loud to the team. Plain verbs, no status-report register — "moved audience resolution into core so the worker stops calling the API over HTTP", not "Refactored audience resolution module to eliminate inter-service HTTP dependency."
- **No ticket references.** No Linear ids (`SIG-###`), no Jira keys, no issue-tracker links. The team can look those up; the standup is for saying what happened.
- **No task-tracker internals.** No bead ids (`sl-xxx`), no epic or task ids, no mention of beads/TodoWrite/local trackers at all. These are personal scaffolding and mean nothing to anyone else.
- **No section headers unless asked.** Default to a flat list of points. Only split into yesterday / today / blockers if the user asks for that shape or names one of those sections.
- **Say what changed, not what you touched.** File and module names only when they are the clearest way to identify the thing; never a list of paths.
- **A "next up" line is a normal point.** What you're picking up tomorrow reads as one of the five, not as a separate section.

### Register calibration

The bar is what teammates actually post. These are real examples — match this length and flatness:

> PR up to reconcile AST with the segment exporter, defines a general audience definition convention

> Tasks backend is basically done on the API side. Read, write, comments, completion rules, auto follow up task. Also pulled the duplicate store permission into one shared class. Next up is all frontend, list page then editor

> scorecards: added some extra filtering for foxybox plus a bonus export to excel

> Addressed the change requests on my email reply PR and made a few new improvements

Note what is absent: no numbers offered as proof, no mention of tests or CI, no "for the first time", no explaining why the work mattered. An area prefix (`scorecards:`, `foxybox:`) is idiomatic and often the shortest way in.

PR numbers are fine — they are how the team finds the work to review.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        STANDUP                                    │
├─────────────────────────────────────────────────────────────────┤
│  STANDALONE (always works)                                       │
│  ✓ Tell me what you worked on and I'll structure it             │
│  ✓ Format for daily standup (yesterday / today / blockers)      │
│  ✓ Keep it concise and action-oriented                          │
├─────────────────────────────────────────────────────────────────┤
│  SUPERCHARGED (when you connect your tools)                      │
│  + Source control: Recent commits and PRs                        │
│  + Project tracker: Ticket status changes                        │
│  + Chat: Relevant discussions and decisions                      │
│  + CI/CD: Build and deploy status                                │
└─────────────────────────────────────────────────────────────────┘
```

## What I Need From You

**Option A: Let me pull it**
If your tools are connected, just say `/utils write today's standup` and I'll gather everything automatically.

**Option B: Tell me what you did**
"Worked on the auth migration, reviewed 3 PRs, got blocked on the API rate limiting issue."

## Output

Default shape — a flat list, five points at most, one sentence each:

```markdown
## Standup — [Date]

- [What changed, in one plain sentence]
- [What changed, in one plain sentence]
- [Blocker stated as a sentence, if there is one]
```

Only when the user asks for the yesterday / today / blockers split:

```markdown
## Standup — [Date]

### Yesterday
- [One sentence]

### Today
- [One sentence]

### Blockers
- [One sentence, including who can unblock it]
```

The five-point cap applies to the whole update, not per section.

## If Connectors Available

If **~~source control** is connected:
- Pull recent commits and PRs (opened, reviewed, merged)
- Summarize code changes at a high level

If **~~project tracker** is connected:
- Pull tickets moved to "in progress" or "done"
- Show upcoming sprint items

If **~~chat** is connected:
- Scan for relevant discussions and decisions
- Flag threads needing your response

## Tips

1. **Run it every morning** — Build a habit and never scramble for standup notes.
2. **Add context** — After I generate, add any nuance about blockers or priorities.
3. **Share format** — Ask me to format for Slack, email, or your team's standup tool.
