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
  Also owns bug-focused and security-focused reviews, including Bugbot when available.
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
- **Explain** — the teaching pass. Invokes the
  [`explain`](../explain/SKILL.md) skill via the
  Skill tool to construct the explanation, then packages that into the full HTML explainer + quiz.
  Triggered when the user asks to *understand* rather than *judge* ("explain this diff", "help me
  understand this change", "walk me through this PR"), or when a review didn't land and they want the
  deep dive. Jump to [`references/explainer.md`](references/explainer.md) and follow it; skip the rest
  of this file.

The three review lanes — **Standards**, **Spec**, and **Experts** — run as separate subagents so their contexts
never bleed into each other. A change can pass one and fail the other, and keeping them apart is what
lets that show. Everything else (resolving the target, writing the goal, distilling the findings) is
done in the main thread.

## Default delivery — the complete review in chat

Deliver Step 4's full report directly in the final chat response on the first review request.
The verdict, standards, orientation, all-file reading route, findings with snippets and evidence-led
paste comments, verification, limits, and nit count are the default deliverable. A saved Markdown or
HTML report may supplement it; a link or a short findings-only summary never replaces it unless the
user explicitly requests that format. The user should not need to ask for the full format again.

The 150-word prose cap controls presentation, not coverage: use an orientation table, a grouped
reading-route tree or table, and a verification table to keep every required section inline. Large
diffs still list every changed file. Do not move the payload into an artifact to meet the cap.

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
  the internal [worktree module](../pair/references/worktree/SKILL.md) for that branch and `cd` into
  the worktree it reports. Then
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

Also check for `CODING_STANDARDS.md` (or `CONTRIBUTING.md` / `docs/standards*`) and a configured linter
(`ruff.toml`, `pyproject.toml`'s `[tool.ruff]`, `.eslintrc*`) — reading the **right copy** depends on
how Step 0 resolved the target:

- **A branch or PR (in its own worktree)** → read off `<base>`, not the worktree's working copy:
  `git show <base>:CODING_STANDARDS.md` (same for the other candidate names, and for the linter config).
  A worktree can sit on a branch cut weeks ago; its checked-out file is whatever existed then, and the
  staleness is invisible unless you read from the ref instead. `git show` works identically from any
  worktree — the object lives in the one shared `.git`.
  - **If this diff itself edits `CODING_STANDARDS.md`**, don't read the file at `<base>` as if it still
    applied unchanged — note in one clause that the standard is moving as part of this PR, and judge
    the diff's other files against whichever version makes sense (usually the one in force when the
    author wrote them: `<base>`).
- **The working diff** (no worktree, Step 0 skipped) → read the physical file. This is the one case
  where an uncommitted edit to the standard itself should count.

Read whatever exists in full —
[`references/coding-standards/coding-standards.md`](references/coding-standards/coding-standards.md)
has the maturity rubric. Pass whatever you found, or its absence, into the Standards subagent verbatim.

## Step 2 — Run Standards, Spec, and Experts in parallel

**Choose the scope first.** A normal review keeps all three lanes. An explicit bug-only or
security-only request uses the matching focused lane instead; do not force a menu or run unrelated
lanes. For security, trace changed trust boundaries, authentication/authorization, tenant isolation,
untrusted inputs, secret handling, and injection paths; report concrete exploitable consequences,
not speculative checklists. Label a focused review as partial, never a full merge clearance.

**Optional specialised backends.** If the caller asks for Bugbot or the host's Security Review
subagent and that exact backend exists, read [Bugbot](references/review-backends/bugbot.md) or
[Security Review](references/review-backends/security.md). These are internal adapters, not separate
skills. Reuse the resolved target/worktree; never stash or switch the user's checkout silently.
If the backend is unavailable, say so and perform a regular bug/security-focused review if useful;
label it honestly rather than claiming Bugbot ran. Backend failures get at most one retry. Fold
backend findings into this skill's verification and report; do not emit a second competing verdict.
When no parallel-agent tool exists, run the lanes sequentially and disclose the lack of independence.

Send **one message with three `Agent` calls** (`subagent_type: "claude"`). They share the diff, commit
list, and goal from Step 1; each gets its own clean context. Keep each subagent's brief **under 400
words of output** — they feed a concise report, so a sprawling subagent return defeats the purpose.

**Experts lane runs automatically** in a normal review: follow
[`references/experts-lane.md`](references/experts-lane.md) as the third subagent; no `--experts`
request is needed. Explicit bug-only or security-only scope still limits every lane to that scope.
Missing tools or low-confidence results are disclosed, never treated as a clean experts pass.

When a concrete review claim depends on an unknown external fact (an API guarantee, library behavior,
or current documentation), read pair's [research module](../pair/references/research/SKILL.md)
directly. Research only that gap, cite the evidence, and return to the review; do not start pair,
change the acceptance bar, or add a broad research pass to every review.

---

**Standards subagent prompt:**

```
Review the diff below against (a) this repo's documented standards and (b) the Fowler smell baseline.

## Diff
<paste: git diff <base>...HEAD>

## Commits
<paste: git log <base>..HEAD --oneline>

## Documented standards (CODING_STANDARDS.md)
<paste: CODING_STANDARDS.md / CONTRIBUTING.md content if found in the main thread, else write "None found.">
This is the authoritative judgment-call standard when present — hold the diff to it first. Report a
maturity read (references/coding-standards/coding-standards.md): 🔴 none set (nothing above and no
configured linter rules below) / 🟡 partial (thin, stale, or only one of the two) / 🟢 solid (a real
doc, configured linter thresholds, or both).

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
Start your reply with one line: `Maturity: <🔴/🟡/🟢> — <one clause why>`. Then per file/hunk, report:
(a) every documented-standard violation — cite the rule; (b) any stack best-practice violation if that
lens applies — cite the rule; (c) any smell — name it and quote the hunk. Documented standards override
the baseline; smells are judgement calls. Skip anything tooling enforces. For EACH finding, classify
severity honestly:
- blocker  = a correctness defect that ships broken behaviour to a user.
- should-fix = a real design/maintainability problem a careful reviewer would ask to change first.
- nit = style, wording, or "pattern to notice" — anything you would not block a merge on.
Also tag a finding `(trunk)` when its file is a hub — an entry point, shared state/store, router, auth,
config schema, or a file with many importers; leave leaf files untagged. Give each finding as:
[severity] (trunk, if applicable) File:Line — one plain sentence on what's wrong · one plain sentence
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
shipped to a user). Tag a finding `(trunk)` when its file is a hub (entry point, shared state/store,
router, auth, many importers) the same way the Standards lane does; leave leaf files untagged. Write
each finding in plain English — lead with the consequence, gloss any jargon. Under 400 words.
```

## Step 3 — Investigate findings, then try to refute blockers

### Evidence gate — every surviving finding

Resolve the uncertainty yourself before asking the author for a change. For each proposed runtime
or correctness finding, run the smallest safe reproduction through the real entry point available
in the worktree. Exercise the claimed condition, observe the actual result, and check for an upstream
guard or existing test that contradicts the claim. For concurrency, control the ordering explicitly;
for access control, exercise the relevant identities. Mock paid or destructive external effects,
not the guard or behaviour being judged. Do not call paid services or mutate production to verify a
review claim.

Record the setup, command or test, expected result, actual result, and evidence location. A passing
unrelated suite is not verification of the finding. Temporary regression tests stay isolated; do
not silently patch application code or commit review probes. Design and standards findings need a
concrete code comparison and the applicable rule rather than a fabricated runtime reproduction.

If execution is unavailable, trace the actual caller and guards, label the finding **code-traced,
not reproduced**, and state the limit. If the claim still depends on an unknown outcome, keep it in
**Where I'm least sure**, not the confirmed issues or merge-blocking count. Never invent a test run
or hand the unresolved experiment to the author as a finding.

### Independent refutation — blockers

Collect every finding any lane classified `blocker` that survived the evidence gate. If there are
none, skip only this refutation pass. For each one, send a single `Agent` call
(`subagent_type: "claude"`) trying to refute it:

```
Try to refute this blocker claim. Default to CONFIRMED unless you find concrete contradicting
evidence — report REFUTED only when certain, not on mere doubt.

## The claim
<the finding, verbatim: file:line, what's wrong, the consequence>

## The diff
<paste: git diff <base>...HEAD>

## Verification evidence
<paste: reproduction setup, command/test, expected and actual result, or labelled code trace>

Look for a guard, an upstream validation, an existing test, or a feature flag that the first pass
missed and that makes this not actually ship broken behaviour. Answer in two lines: CONFIRMED or
REFUTED, then one sentence why. Under 60 words.
```

Run these in parallel, one `Agent` call per blocker. A `REFUTED` verdict removes the disproved
correctness claim; retain a separate should-fix only if independent evidence supports it, and explain
that distinction. `CONFIRMED` carries no change. If no agent tool exists, repeat the guard check in
the main thread and disclose that independent refutation was unavailable.
This is a narrow, cheap echo of the adversarial-verify pattern (Cursor's Bugbot and independent research
both found a second independent pass cuts false positives): scoped to blockers only, because that's
where a false positive costs the most trust, and because most reviews carry zero or one, so it rarely
spawns more than a couple of calls.

## Step 4 — Distil to the concise report

All available lanes have returned. Now write the report the user actually reads. **Do not paste the subagent
returns.** They are raw material; your job is to distil them into the structure below, dropping every
nit and rewriting each surviving finding for a bright intern.

Build the four orientation beats yourself from the inputs you already gathered (the diff, the goal,
the changed files) — this is the "here's the story of this change" framing that makes the findings
land, because the reader is oriented before they hit a single problem. Keep each beat to one to three
sentences.

Carry the Standards lane's maturity line (Step 2) straight into the verdict block — it answers "is
there even a standard to check this diff against," a different question from the verdict itself.

Use this exact section order, directly in chat. Orientation may use the table below or three short
headed sections; the reading route may use a table or a grouped tree with per-file line counts.
Preserve the evidence and paste comment for every issue even when the diff is large.

````
# Review — <plain-words title of what the change does>
**🟢 Ship it** — nothing here blocks merge.
   — or —
**🟡 Fix first** — <n> should-fix(es) below, no hard blockers.
   — or —
**🔴 Don't merge yet** — <n> blocker(s): <the one-line worst>.

<source → base · N files> · <PR / Linear id / epic ref if any> · reviewed `<commit>`

**Standards:** <🔴 none set / 🟡 partial / 🟢 solid> — <the Standards lane's one-clause why>. <if 🔴 or
🟡:> consider running `/utils retro` to start one.

| | |
|---|---|
| **The goal** | <the problem this change set out to solve, from Linear + the PR> |
| **What it touches** | <modules and the seam between them; a tiny flow/tree may follow> |
| **The attempt** | <the approach and the one or two load-bearing changes> |

## Review it yourself
<1 sentence naming the spine of the order and why it's that order.>

| # | File | ± lines | Ask |
|---|---|---:|---|
| 1 | `path/file.py` | <added + deleted> | <the question this file settles> |
<…one row per file, grouped into reading stops; every changed file present…>

**Where I'm least sure:** <1–2 sentences: the spots the lanes could not settle, where a human pass
pays best.>
<N> files, all <N> above — matches `git diff --name-only <base>...HEAD | wc -l`.

## The issues
<Only blockers and should-fixes. If there are none: "None worth blocking on." Otherwise, per finding:>

### 🔴 Blocker · `path/file.py:42`   (or  ### 🟡 Should fix · `path/file.py:88`)
Append ` (trunk)` after the path on either form — e.g. `### 🟡 Should fix · path/file.py:88 (trunk)` —
when the owning lane tagged the file a hub; omit it for leaf files. This is the position signal from
`to-pr`'s blast-radius rubric, kept lightweight here (full version:
[pair's internal blast-radius reference](../pair/references/to-pr/references/blast-radius.md)). It never changes severity —
blocker/should-fix still means what it always meant — it just tells the reader which findings to act
on first when they can't get to all of them.
<Plain English, intern-level: what's wrong, no unglossed jargon — 1 sentence.>
```<lang>
<the offending lines, verbatim, line-numbered — see below>
```
Why it matters: <the concrete consequence, in real terms — what actually goes wrong for a user or the
next engineer — 1 sentence.>

| Evidence | Result |
|---|---|
| <reproduction command/test + setup, or labelled code trace / standards comparison> | <expected vs observed; limits if not executed> |

```
<what I checked + actual outcome; then a concrete adjustment question — see below>
```

## Verification
| Check | Result |
|---|---|
| <commands/suites actually run> | <pass/fail counts; distinguish deliberate regression failures> |
| <unrun paths / environment blockers / spec and tool availability> | <limits; never imply a missing pass cleared the change> |
| Repository / PR | <edits, probes, and whether anything was posted> |

## What I left out
<n> nit(s) and wording note(s), not shown — say the word if you want them.
Experts: <completed / unavailable / low confidence / excluded by explicit scope> — <one clause why,
including any coverage gap; never imply a missing or low-confidence pass cleared the change>.

## Want the deep dive?
If any of the above didn't land, say "explain it" and I'll build the full walkthrough — background →
intuition → literate diff → a short quiz — the same explainer pair's internal PR module can distil into a PR body.
````

**The review plan — order by when the author's reasoning becomes legible, not by the diff.** The user
runs their own pass after reading yours, hoping to catch what you missed, so this section is a reading
route rather than a file list. Alphabetical order, `git diff` order and "biggest file first" are all
worthless here.

- **The default spine**, adapted to the change: (1) the vocabulary — the type, model or key everything
  else refers to; (2) the write path, in the order data is created; (3) the read path, in the order it
  is consumed; (4) the orchestration — when it runs and how often; (5) config and admin — how it gets
  switched on; (6) tests alongside their owning modules, or last when they consolidate the contract.
  Include every changed test file.
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
- **Give changed-line counts** (`git diff --numstat <base>...HEAD`, added + deleted, labelled `± lines`)
  so the reader can budget; flag when fixtures or docstrings inflate them. A deleted file still gets
  its changed-line count and a place in the route.
- **"Where I'm least sure" is the point of the section.** Name the places all available lanes went quiet, the
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

**The paste comment — evidence first, then ask for the adjustment.** The fenced comment is what the
user drops onto the PR. Keep the user's conversational voice while doing the investigation yourself:

- State **what I checked and what actually happened**, then ask for a concrete adjustment. Name the
  triggering condition and observed outcome; include a short test name or command when useful.
- Use one compact paragraph, one adjustment question, no headers, bold, severity label or praise
  padding. Lowercase start, symbols in backticks, a space before the closing ` ?`.
- A reproduced example: "i reopened and extended the plan during evaluation in
  `test_reopen_during_evaluation`; the old postmortem still saved and blocked a fresh one. can we
  discard the result when the locked plan's end date differs from the evaluated date ?"
- A code-traced example: "i traced `answer_check_in` through `_fill_unanswered`; unlike the dashboard
  path it never checks the end date (not reproduced locally). can we apply that guard to ordinary
  email replies while exempting postmortems ?"
- A design example: "i compared both upload paths; the storage and rollback steps are duplicated.
  what do you think about sharing those steps in `file_attachment_service` ?"
- Replace "can you check/test/double check whether X happens?" and speculative "what happens if…?"
  with Step 3's actual evidence. Ask the author to adjust the code, not to establish the finding.
  If the outcome is unknown, leave it out of confirmed issues rather than implying it was tested.
- Keep the request collaborative: "can we…?", "is it possible to…?", or "what do you think about…?".
  Never claim an unrun test passed or failed, and never present a code trace as an executed repro.

If you're reviewing in a repo whose owner comments differently, read their last few and match them:
`gh api repos/<owner>/<repo>/pulls/<n>/comments --jq '.[] | select(.user.login=="<them>")'`.

Order the findings by how much they matter, worst first.

## Step 5 — Gate

```
question: "Review done. What next?"
options:
  - "Present findings — I'll decide what to act on (Recommended)"
  - "Fix the should-fixes now — patch them and show me the diff"
  - "Explain it — build the full walkthrough + quiz"
  - "Post the comments as a PR review"
  - "Accept as-is"
```

- **Fix it now** → spawn one `Agent` call (`subagent_type: "claude"`) with the diff and the should-fix
  findings only — never blockers; those need a human call on behaviour, not a mechanical patch. Include
  each finding's drafted before→after. Instruct it to apply the smallest edit that resolves each
  finding, nothing more, then run the repo's existing test/lint command once if cheap. If Step 0 put
  this review in a dedicated worktree, the patch lands there, isolated from the user's own checkout; if
  reviewing the working diff directly, say so before applying — the edit lands in the live checkout the
  user is already editing. When the subagent returns, show the full `git diff` and stop. **Never
  commit** — that's always the user's call, the same rule that keeps the paste-comment path below from
  posting on its own.
- **Explain it** → switch to explain mode: invoke the
  [`explain`](../explain/SKILL.md) skill via the
  Skill tool on the same change so the walkthrough leads with the why, glosses the jargon, and probes
  that it landed; then follow [`references/explainer.md`](references/explainer.md) to package it into
  the HTML explainer + quiz and hand back the path.
- **Post to the PR** is outward-facing and stays the user's call — only run
  `gh pr review <n> --comment` (or `--request-changes`) if they pick it. The paste blocks exist so the
  user can post in their own hands; that's the default path.
- **Accept as-is**, when this ran against a planning epic and all findings are resolved or accepted,
  closes the epic: `gh issue close -R KevinKab2412/planning <epic-n>`. Then show a one-line summary — epic
  closed, what shipped, any deferred follow-ups.

## Pipeline notes (when called from /pair)

`code-review` is the review stage of `/pair`, replacing the old two-axis stage. These behaviours carry
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

The complete Step 4 report is in the final chat response without a follow-up request; an artifact
link is supplemental. The verdict is the first line after the title and it's unambiguous
(ship / fix first / don't merge). Right after its metadata,
the Standards-maturity line says whether there was even a standard to hold this diff to — a silent
maturity line is as much a bug as a silent lane. The four beats orient a newcomer to the change before
any finding. Every surfaced finding is a blocker or should-fix, written so a bright intern gets it
without asking, quotes the offending lines so the reader never has to open the file, carries a one-line
paste comment stating what was checked, the observed outcome and a concrete adjustment question,
and is tagged `(trunk)` when it lives in a hub file. Every issue passed Step 3's evidence gate; a code
trace is labelled and unresolved hypotheses stay out of the merge-blocking count. Every blocker
survived a refute attempt, with any lack of independent tooling disclosed. Verification lists real
commands, outcomes and limits; disproved claims are removed.
The review plan gives the user their own route through the change, accounts for every changed file with
none skipped, and says where your own pass is weakest. The nits are counted, not shown. A lane that had
nothing to say says so — a silent lane must never read as a clean bill of health. The report ends with
the offer to go deeper, so understanding is always one word away.
