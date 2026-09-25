---
name: code-review
description: >
  Review a PR, branch, or working diff and give one clear merge call in a short plain-English report.
  Read the goal and architecture contract from the PR, tickets, and planning epic; run Standards and
  Spec reviews in parallel; orient the reader; and surface only blockers and should-fixes with
  ready-to-paste comments. Use for "review this PR", "review my changes", "should I merge this",
  "review this branch", "did the build match the plan", "code review", or as /pair's review stage.
  Also use when the user asks to understand a change: "explain this diff", "walk me through this PR",
  or "help me understand this change"; in that case build the full HTML teaching artifact and quiz.
  Prefer this skill over a raw diff whenever the user wants to judge or understand a change.
---

# Code Review — one answer: ship it, or here's what to fix

> **Output discipline (hard rule).** Every output this skill produces obeys [`references/brevity/output-discipline.md`](references/brevity/output-discipline.md): **≤150 words of prose**, plain dumbed-down English, verdict first. Anything past 150 words becomes a **visual** — table, tree, diff, or code block (format menu: [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md)). Words inside a visual don't count. This governs the terminal report **and** the HTML explainer + quiz — keep their prose under the cap and let visuals carry the depth.

This skill does one job well: look at a change and tell the user, in plain words, **whether it's safe
to merge and what to fix if not**. The output is short on purpose. A reviewer at the end of the day
should get the verdict in one line, understand the change in four short beats, and see only the
findings that actually matter — each explained so clearly they don't have to ask "wait, what?".

It has two modes:

- **Review** (default) — the verdict pass. Runs below.
- **Explain** — the teaching pass. Builds the full HTML explainer + quiz. Triggered when the user
  asks to *understand* rather than *judge* ("explain this diff", "help me understand this change",
  "walk me through this PR"), or when a review didn't land and they want the deep dive. Jump to
  [`references/explainer.md`](references/explainer.md) and follow it; skip the rest of this file.

The two axes of the review — **Standards** and **Spec** — run as separate subagents so their contexts
never bleed into each other. A change can pass one and fail the other, and keeping them apart is what
lets that show. Everything else (resolving the target, writing the goal, distilling the findings) is
done in the main thread.

## What "concise" means here (read this first)

The point of this skill is to fight two failure modes at once: **too slow** and **too much to read**.
So the discipline is:

- **Verdict first.** The very first line after the title is the merge call. Everything else is there
  to justify it, and the user can stop reading once they trust it.
- **Only should-fixes and blockers.** A finding earns a place only if you'd genuinely ask for the
  change before merge. **Drop every nit** — style tooling already catches, wording of a comment or
  UI string, "the pattern to notice next time", speculative "you could also". Nits are not made
  concise by shortening them; they're removed. Say *how many* you dropped so the omission reads as a
  choice, not an oversight.
- **Explain to a bright intern.** This is the core fix for the "I read the finding and still don't
  know what it means" problem. Every finding is written for someone sharp but new: no unglossed
  jargon (if you must say "race condition" or "N+1 query", say what it means in the same breath),
  lead with the concrete consequence ("if two people hit save at the same moment, the second one
  silently wins"), not the abstract principle ("this violates atomicity"). Two or three sentences,
  no more.
- **No walls of text.** Four short orientation beats, then the findings. If a beat needs a paragraph,
  it's too long — cut it to the load-bearing sentence.
- **Show the shape, don't narrate it.** When an orientation beat is about a *shape* — which modules
  the change reaches and the seam between them (**What it touches**), or the load-bearing move
  (**The attempt**) — a tiny compact visual reads faster than prose: a shallow file tree, a call
  tree, a Mermaid sequence/state diagram, or a shape-matched diff. Keep it small (a few nodes, not
  the whole graph) and put it right under the beat's one sentence. The format menu is in
  [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md). A plain sentence
  that's already clear needs no diagram — don't add one for decoration.

## Step 0 — Ensure a worktree for the branch under review

Before resolving the target, put yourself in a **dedicated worktree for the branch being reviewed**,
so the review never disturbs your current checkout:

- **Reviewing a branch or a GitHub PR** (a named head branch) → check `git worktree list --porcelain`
  for a `branch refs/heads/<branch>` line. If one exists, `cd` into that path. If not, run
  [`worktree`](../worktree/SKILL.md) for that branch and `cd` into the worktree it reports. Then
  resolve the target and gather the goal there.
- **Reviewing the working diff** ("my changes", "what I just did") → skip this step. The uncommitted
  work lives in the current checkout; a worktree can't carry it, and moving would lose it.

If you're already standing in the right worktree for the branch, this is a no-op — note it and go to
Step 1.

## Step 1 — Resolve the target and gather the goal

Work out what to review, in this order. Ask only if genuinely ambiguous.

- **A GitHub PR** (URL or number) — the primary case:
  ```bash
  gh pr view <n> --json title,body,author,baseRefName,headRefName,url,files,closingIssuesReferences
  gh pr diff <n>
  ```
- **A branch** ("this branch", a branch name) → `git diff <base>...HEAD`; infer the base from
  `git symbolic-ref refs/remotes/origin/HEAD` or the merge-base.
- **The working diff** ("my changes", "what I just did") → `git diff HEAD` and `git status`.

Pin the base with a **three-dot merge-base** (`origin/dev...HEAD` or `origin/main...HEAD`) so
feature-branch noise is excluded, and grab the commit list (`git log <base>..HEAD --oneline`).
**Confirm the diff is non-empty in the main thread** — an empty or bad ref should fail here, not
inside a subagent.

Then gather **the goal** — what this change set out to do. This is both the Spec axis's yardstick and
the first orientation beat, so collect it once:

- **The PR description** (from `gh pr view` above).
- **Linked Linear tickets.** A PR body or branch name often carries a ticket id (e.g. `SIG-520`). Pull
  the ticket to read what was asked. **Read-only** — never comment on, edit, or move a Linear ticket;
  what appears there is the user's to write.
- **A linked planning epic.** If the change references a `KevinKab2412/planning` epic, pull its acceptance
  criteria: `gh issue view -R KevinKab2412/planning <n> --json title,body,labels`. This is the approved
  spec when it exists. Preserve its Architecture Contract as part of the acceptance bar, including
  any human-approved revision returned by an architecture checkpoint. Fetch epic comments and the
  comments on every `architecture:checkpoint` task; the newest approved contract revision and recorded
  checkpoint ranges are authoritative. Conversation memory is not.

If there are **no** acceptance criteria anywhere, the Spec axis runs in reduced mode against the PR's
*stated intent* only — say so plainly rather than inventing a spec.

Read the epic's `stack:*` labels if a planning epic is in play — a `stack:react` / `stack:dagster`
label routes the matching `best-practices` lens into the Standards axis (Step 2).

## Step 2 — Run Standards and Spec in parallel

Send **one message with two `Agent` calls** (`subagent_type: "claude"`). They share the diff, commit
list, and goal from Step 1; each gets its own clean context. Keep each subagent's brief **under 400
words of output** — they feed a concise report, so a sprawling subagent return defeats the purpose.

**Experts lane is off by default** — it's the main source of the old overload. Only add it when the
user explicitly asks for a domain deep-dive ("hold this to the experts", "run the experts pass") or
passes `--experts`; then follow [`references/experts-lane.md`](references/experts-lane.md) as a third
subagent.

---

**Standards subagent prompt:**

```
Review the diff below against (a) this repo's documented standards and (b) the Fowler smell baseline.

## Diff
<paste: git diff <base>...HEAD>

## Commits
<paste: git log <base>..HEAD --oneline>

## Repo standards
Check pyproject.toml / ruff.toml (or the repo's linter config) for intentionally configured thresholds.
Enforce configured rules. If none exist, use size, coverage, complexity, mutation, CRAP, coupling, and
interface counts only as diagnostic evidence; do not invent universal thresholds or call a metric alone
a violation. A large deep module can impose less cognitive load than many shallow wrappers.
For Reflex projects (files touching rx.State subclasses): State holds UI state, exposes event
handlers, delegates work — no inline business logic; transformations live in service modules;
computed vars are simple derivations. Check docs/Arch/reflex-patterns.md if present.

## Stack best-practices (only if the epic carries a stack:* label)
<Include only when the epic has stack:react or stack:dagster; otherwise omit this section.>
Invoke the `best-practices` skill via the Skill tool with the stack from the label (`react` and/or
`dagster`). Hold the diff to those rules and cite the rule the way that skill asks (e.g. Vercel
section "1.5 Promise.all() for Independent Operations").

## Fowler smell baseline (always applies; repo standards override where they conflict)
Each smell is a judgement call, not a hard violation. Skip anything tooling already enforces.
- Mysterious Name — a name that doesn't reveal what it does/holds → rename; if no honest name comes, the design's murky.
- Duplicated Code — the same logic shape in more than one hunk → extract it, call from both.
- Feature Envy — a method reaching into another object's data more than its own → move it onto that data.
- Data Clumps — the same fields travelling together → bundle into one type.
- Primitive Obsession — a primitive standing in for a domain concept → give it its own small type.
- Repeated Switches — the same switch/if-cascade on the same type → replace with polymorphism.
- Shotgun Surgery — one logical change forcing scattered edits → gather what changes together.
- Divergent Change — one file edited for several unrelated reasons → split by responsibility.
- Speculative Generality — abstraction for needs the spec doesn't have → delete it.
- Message Chains — long a.b().c() navigation → hide the walk behind one method.
- Middle Man — a class that mostly just delegates → cut it, call the real target.
- Refused Bequest — a subclass ignoring most of what it inherits → use composition.

## Brief
Per file/hunk, report: (a) every documented-standard violation — cite the rule; (b) any stack
best-practice violation if that lens applies — cite the rule; (c) any smell — name it and quote the
hunk. Documented standards override the baseline; smells are judgement calls. Skip anything tooling
enforces. For EACH finding, classify severity honestly:
- blocker  = a correctness defect that ships broken behaviour to a user.
- should-fix = a real design/maintainability problem a careful reviewer would ask to change first.
- nit = style, wording, or "pattern to notice" — anything you would not block a merge on.
Give each finding as: [severity] File:Line — one plain sentence on what's wrong · one plain sentence
on the concrete consequence · (for blocker/should-fix) a one-line before→after or the fix in words.
No jargon without a gloss. Under 400 words.
```

---

**Spec subagent prompt:**

```
Review the diff below against the goal it was meant to satisfy.

## Diff
<paste: git diff <base>...HEAD>

## Commits
<paste: git log <base>..HEAD --oneline>

## The goal (the approved spec)
<paste: PR description + linked Linear ticket(s) + planning-epic acceptance criteria — whichever exist.
If none exist, say so and review against the PR's stated intent only.>

## Architecture contract (when present in the approved spec)
Check that the diff preserves knowledge ownership, protected policy, interface guarantees, dependency
direction, boundary-data rules, scope, and hard guards. Report unexplained drift; do not treat an
approved checkpoint revision as a defect. Diagnostic metrics are evidence, not contract failures,
unless the repository owns an explicit threshold.

## Brief
Report: (a) acceptance criteria (or stated intent) that are missing or only partially implemented —
quote the criterion; (b) behaviour in the diff that nothing asked for (scope creep); (c) criteria
that look implemented but where the implementation looks wrong. Classify each as blocker /
should-fix / nit using the same definitions the Standards reviewer uses (blocker = broken behaviour
shipped to a user). Write each finding in plain English — lead with the consequence, gloss any
jargon. Under 400 words.
```

## Step 3 — Distil to the concise report

Both lanes have returned. Now write the report the user actually reads. **Do not paste the subagent
returns.** They are raw material; your job is to distil them into the structure below, dropping every
nit and rewriting each surviving finding for a bright intern.

Build the four orientation beats yourself from the inputs you already gathered (the diff, the goal,
the changed files) — this is the "here's the story of this change" framing that makes the findings
land, because the reader is oriented before they hit a single problem. Keep each beat to one to three
sentences.

Use this exact shape:

````
# Review — <plain-words title of what the change does>
<source → base · N files> · <Linear id / epic ref if any>

**🟢 Ship it** — nothing here blocks merge.
   — or —
**🟡 Fix first** — <n> should-fix(es) below, no hard blockers.
   — or —
**🔴 Don't merge yet** — <n> blocker(s): <the one-line worst>.

## The goal
<1–2 sentences, plain English: what problem this change set out to solve. From Linear + the PR.>

## What it touches
<1–3 sentences: the parts of the system this change reaches and how they connect — the files/modules
and the seam between them. Enough that the findings below have somewhere to land.>

## The attempt
<1–3 sentences: how the author went about it — the approach and the one or two load-bearing changes.
This is the "here's what they did" beat, in words, not a diff dump.>

## The issues
<Only blockers and should-fixes. If there are none: "None worth blocking on." Otherwise, per finding:>

### 🔴 Blocker · `path/file.py:42`   (or  ### 🟡 Should fix · `path/file.py:88`)
<Plain English, intern-level: what's wrong, no unglossed jargon — 1 sentence.>
```<lang>
<the offending lines, verbatim, line-numbered — see below>
```
Why it matters: <the concrete consequence, in real terms — what actually goes wrong for a user or the
next engineer — 1 sentence.>
```
<the ready-to-paste PR comment, in the user's voice — see below>
```

## Review it yourself
<1 sentence naming the spine of the order and why it's that order.>

1. **`path/file.py`** (N lines) — <the one thing this file settles> · **ask:** <the question to hold
   while reading it>
<…one stop per file or per group-read-together, every changed file present…>

**Where I'm least sure:** <1–2 sentences: the spots the lanes could not settle, where a human pass
pays best.>
<N> files, all <N> above — matches `git diff --name-only <base>...HEAD | wc -l`.

## What I left out
<n> nit(s) and wording note(s), not shown — say the word if you want them. <If the experts lane
wasn't run:> Domain-standards (experts) pass not run — ask for `--experts` if you want it.

## Want the deep dive?
If any of the above didn't land, say "explain it" and I'll build the full walkthrough — background →
intuition → literate diff → a short quiz — the same explainer /to-pr distils into a PR body.
````

**The review plan — order by when the author's reasoning becomes legible, not by the diff.** The user
runs their own pass after reading yours, hoping to catch what you missed, so this section is a reading
route rather than a file list. Alphabetical order, `git diff` order and "biggest file first" are all
worthless here.

- **The default spine**, adapted to the change: (1) the vocabulary — the type, model or key everything
  else refers to; (2) the write path, in the order data is created; (3) the read path, in the order it
  is consumed; (4) the orchestration — when it runs and how often; (5) config and admin — how it gets
  switched on; (6) at most one or two test files, and only where the test states the intent better
  than the module does.
- **Lead with the most opinionated short file**, not the longest one. The file holding the contested
  design decision teaches the change; a 250-line mechanical module teaches the codebase.
- **Cover every changed file. There is no skip list.** The user's aim is to digest the whole diff and
  find what you missed, so a file you judged uninteresting is exactly where your judgement is the
  thing under test. Enumerate `git diff --name-only <base>...HEAD`, place every path in a stop, and
  close the section with a count that matches — the reader must be able to see nothing was dropped.
- **Group by what is read together, not to save space.** A stop can hold several files when they are
  one idea (a module and its test, a model plus its serializer and migration, a fixture plus the
  parser that consumes it). Give each file its own line and line count inside the stop. Order the
  stops so understanding accumulates; low-decision files land last, but they land.
- **A cheap file gets a cheap line, not a cut line.** One clause on what it does and one question is
  enough for a one-line wiring change — "does the export list need it, or is the import enough?" —
  but it still appears.
- **Every stop carries one question**, and the question must be answerable only by reading that file.
  "Does the key survive a reworded label?" earns its stop; "is this correct?" does not. A stop you
  cannot write a question for is a stop to cut.
- **Give the line count** so the reader can budget, and flag when docstrings inflate it.
- **"Where I'm least sure" is the point of the section.** Name the places both lanes went quiet, the
  judgement calls you took a side on, and anything you could not run. Sending the human at your own
  blind spots is worth more than sending them at your findings.

**The snippet — the finding must be legible without opening the file.** A file:line link is a promise
to go and look; the reader is in a terminal and should not have to. So quote the code. Read the actual
file (not just the diff hunk) so the numbers and the surrounding lines are right.

- **The fewest lines that make the problem visible** — usually 3–8, never more than ~12. A signature
  and the one bad line beats the whole function.
- **Verbatim, with line numbers.** Copy the real characters. Never retype from memory, never reformat,
  never "clean up" the author's spacing. Tag the fence with the language.
- **Elide with `…`** rather than paraphrasing, and keep the numbers honest across the gap:
  ```python
  110  def write_pool(
  111      root: Path,
  112      *,
  …
  118      candidates: Iterable[BusinessCandidate],
  119  ) -> Path:
  ```
- **A divergence needs both sides**, labelled, in one block or two adjacent ones — that comparison *is*
  the finding, and prose alone cannot carry it.
- **Point at the line, don't annotate it.** No `# <-- BUG HERE` markers injected into the author's
  code; the sentence above the block already said what's wrong.
- When the problem is an *absence* (a check nobody wrote, a key nothing sets), quote the place it
  should have been and say so in the sentence — an empty block is not a finding.
- The same rule serves the "What I left out" nits if the user asks to see them.

**The paste comment — write it in the user's voice, not the report's.** The finding's prose above is
teaching (for the reader's understanding); the fenced comment is what they drop onto the PR for the
author. The house default, drawn from how this user actually comments:

- **Open with the wondering, not the diagnosis.** Never lead with a clause restating what the code
  does. The author wrote it, and the comment is already anchored to the line, so a "`X` rebuilds
  unconditionally — should …" opener spends the reader's first breath on what they already know. Cut
  everything before the question and start there.
- One line, one question. No headers, no bold, no severity label, no before/after snippet, no
  restatement of the diff, no praise padding.
- Lowercase start, symbols in backticks, a space before the closing ` ?`.
- Reach for one of the three openings this user actually uses:
  - **curious / wondering** — "curious to know does this mean an empty `list_stores` gets tagged `ok`
    rather than `not_found` ?"
  - **should / is it possible to / can you double check** — "is it possible to reuse `_GO_TO_LOGIN` ?",
    "can you double check the per-tenant isolation in the event of an error ?"
  - **what do you think of / about** — "what do you think about pulling the recipients / body /
    confirm dialog out into their own helpers ?"
- A hypothetical carries a risk finding better than an assertion does: state the condition, ask what
  happens, let the author answer — "if a user leaves the field empty and saves does this error fire ?",
  "do you think this can pose an issue on daylight savings time ?".
- Never "this is wrong", "change this", "you should have". The author usually knows something you
  don't; every one of these openings leaves them room to say so.

If you're reviewing in a repo whose owner comments differently, read their last few and match them:
`gh api repos/<owner>/<repo>/pulls/<n>/comments --jq '.[] | select(.user.login=="<them>")'`.

Order the findings by how much they matter, worst first.

## Step 4 — Gate

```
question: "Review done. What next?"
options:
  - "Present findings — I'll decide what to act on (Recommended)"
  - "Explain it — build the full walkthrough + quiz"
  - "Post the comments as a PR review"
  - "Accept as-is"
```

- **Explain it** → switch to explain mode: follow [`references/explainer.md`](references/explainer.md)
  on the same change, then hand back the HTML path.
- **Post to the PR** is outward-facing and stays the user's call — only run
  `gh pr review <n> --comment` (or `--request-changes`) if they pick it. The paste blocks exist so the
  user can post in their own hands; that's the default path.
- **Accept as-is**, when this ran against a planning epic and all findings are resolved or accepted,
  closes the epic: `gh issue close -R KevinKab2412/planning <epic-n>`. Then show a one-line summary — epic
  closed, what shipped, any deferred follow-ups.

## Pipeline notes (when called from /pair)

`code-review` is the review stage of `/pair`, replacing the old two-axis stage. Two behaviours carry
over from that role:

- **Intent trace.** If a design sketch exists in `docs/sketches/` (from `sketch-change`, written
  before the build), read it as intent-origin: what the change set out to be. Narrate intent →
  outcome in **The attempt** beat — which contested decisions landed, where the direction changed.
  Deliberate course-corrections are the story, not a fault; only flag drift with **no** trace to a
  grill decision or spec choice. The epic stays the acceptance bar, not the sketch.
- **Stack labels** route `best-practices` into the Standards lane (Step 1/2), not as a separate stage.
- **Architecture trace.** When the epic contains an Architecture Contract, include it in the Spec lane.
  A contract violation or unexplained cross-seam change is a should-fix unless it breaks behavior or
  security, in which case classify by that concrete consequence. If `/architecture` already returned
  Continue on the same diff, use its evidence but still verify that subsequent changes did not drift.

## Done when

The verdict is the first line and it's unambiguous (ship / fix first / don't merge). The four beats
orient a newcomer to the change before any finding. Every surfaced finding is a blocker or should-fix,
written so a bright intern gets it without asking, quotes the offending lines so the reader never has
to open the file, and carries a one-line paste comment in the user's voice. The review plan gives the
user their own route through the change, accounts for every changed file with none skipped, and says
where your own pass is weakest. The nits are counted, not shown. A lane that had nothing to say says so — a silent lane must
never read as a clean bill of health. The report ends with the offer to go deeper, so understanding is
always one word away.
