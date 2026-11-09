---
name: polish
description: >
  Polish a change set clean and simple before it goes up for review — the final cleanup pass
  that makes a diff read like a careful teammate wrote it, not like an agent narrating itself.
  Does two things in one pass, within the changed lines only: (1) simplify — Saxon-over-Latinate
  word choice in names and comments, one word per concept, cut names the context already carries,
  inverted-pyramid structure, merge overlapping concepts, drop derivable state, no back-compat
  with unshipped code; and (2) de-noise — strip bead ids and bead-speak (sl-6ad, "per the bead"),
  local-artifact refs (PLAN.md, NOTES.md, docs/foo.md), ticket ids (SIG-468, JIRA-123), and
  agent-to-user chatter ("as requested", "I've added…", "TODO(kevin)"), and delete comments the
  code already says while keeping only load-bearing WHY. Use whenever the user wants their changes
  cleaned up, tidied, simplified, or de-noised before committing or opening a PR — "polish my
  changes", "clean up this diff", "simplify these names", "de-bead this before I push", "scrub the
  staged changes", "make this read like a teammate wrote it", "tidy the comments", "/polish" — and
  as the final cleanup step of the /cook pipeline (replacing the old scrub). Trigger even when the
  user doesn't say "polish", as long as they point at a change set (staged, working tree, a commit,
  or a range) and want it made simpler or cleaner before review.
---

# polish

Make a change read like a careful teammate wrote it — and simpler than it arrived.

Two things rot a fresh diff. First, an agent **narrates**: it restates what a line does, leaves TODOs
addressed to you by name, cites the bead or markdown plan it worked from, drops "as requested" into a
docstring. None of that survives contact with a teammate — bead ids and local paths are *your* way of
working, meaningless in a shared history, and comments that restate code lie the moment the code
changes. Second, first-draft code is **more complicated than it needs to be**: Latinate names where a
short Saxon word would land harder, a compound name hedging against a decision, state passed around
that was already derivable, an old signature kept alive for code that never shipped.

Polish is the one pass that fixes both. What's left should be the simplest correct version of the
change, carrying only the few comments a smart teammate genuinely couldn't reconstruct.

**The one rule that keeps this safe: touch only what the change set introduced.** You are polishing
the lines this change added or modified — not reformatting the file, not renaming symbols the change
never touched, not re-commenting old code. A pass that churns untouched lines defeats its own purpose:
it makes the diff *harder* to review, which is the exact thing you're trying to fix. The scanner in
Step 1 draws that fence; every later step stays inside it.

## Inputs

Parse these from the user's invocation; ask only if you genuinely can't tell what the change set is.

- **Change set** (required) — what to polish. One of:
  - `staged` — `git diff --cached` (the default when the user says "my changes" with things staged).
  - `working` — `git diff` (unstaged working-tree changes).
  - a **commit hash** — the files that commit touched (`git show <hash>`).
  - a **range** — `A..B`.
  If it's ambiguous, run `git status` to see what's staged vs. unstaged and pick the obvious one,
  saying which you chose.

## Step 1 — Fence the change set

Run the bundled scanner to enumerate exactly which lines the change introduced and flag the obvious
de-noise candidates. It runs `git` in the current directory, so run it from inside the repo you're
polishing — or pass the repo path as a second argument:

```bash
python3 <skill-dir>/scripts/scan_changeset.py <staged|working|HASH|A..B> [repo-path]
```

`<skill-dir>` is this SKILL.md's own directory — resolve it from the skill's path (when installed,
that's `~/.agents/skills/polish`). This is the one step that must actually run, so confirm the path
resolves before relying on the flags.

It prints JSON: per file, the **new-file line numbers** the change added or modified, plus any lines
matching the reference patterns (bead ids, ticket ids, local doc refs, agent chatter). Treat the flags
as *candidates*, not verdicts — the scanner is deterministic and dumb; you make the call. **The line
numbers are the fence.** Read the surrounding code for context, but only *edit* within those lines.

For a **commit hash or range**, polish edits the current working tree, not history — see Step 5.

## Step 2 — Simplify

Within the changed lines, make the code the simplest correct version of itself. Do not change
behavior; run the relevant existing checks after.

**Word choice — names and comments are prose.** Apply Orwell's rules: never use a long word where a
short one will do; if you can cut a word, cut it; prefer the active; prefer the everyday word over the
jargon one. Latinate vocabulary (`reconcile`, `coalesce`, `normalize`) sounds abstract; Anglo-Saxon
words (`prune`, `run`, `watch`, `drop`, `walk`) are short and physical. Prefer the Saxon word.

**Names.**

- **One word per concept, one concept per word.** Keep a vocabulary. If `sync` names "pull remote
  changes," it can't also name "flush edits to disk" — rename one.
- **Cut words the context already carries.** A module named `workspaceWatcher` doesn't need
  `startNativeWorkspaceWatcher`; `watchWorkspace` says the same thing.
- **A compound name is usually a hedge.** `lastObservedDiskContent` is a spec to defend; `baseline` is
  a description to read.

**Structure.**

- **Inverted pyramid.** Lead a file with its exported or significant functions; push helpers below.
  Don't bury the lead.
- **Merge overlapping concepts.** If two types, functions, or constants overlap heavily, combine them —
  the fewer distinct concepts a reader holds in their head, the better.
- **Use shared code.** Check for an existing library or utility (path parsing, etc.) before inlining a
  new copy.
- **Derivability.** If a value is computable from what's already in scope, don't pass or store it. An
  `isDirty` parameter that's always `content !== baseline` should be dropped — removing derivable state
  often simplifies signatures, types, and control flow in one move.

**No back-compat with unshipped code.** An alias, old signature, or data shape that only ever existed
earlier in *this* branch is compatibility with something that was never deployed. Delete the old path
and update its callers.

Only break a large file into modules by concept when the change set is what made it large — this is a
polish pass on a diff, not a licence to re-architect the file around it.

## Step 3 — De-noise the references

Within the changed lines, remove personal scaffolding. These almost never belong in shared code:

- **Bead ids and bead-speak** — `sl-6ad`, `beads-xxx`, "per the bead", "see bead", "tracked in bd".
- **Local artifact references** — comments pointing at files a teammate won't have or shouldn't need:
  `PLAN.md`, `NOTES.md`, `see docs/foo.md`, "as described in the spec doc". On a docs or markdown change
  set, the scanner's `local_doc` flags are usually *real* links (a `SKILL.md` or `README` legitimately
  linking another doc) — judge these by hand rather than stripping them.
- **Ticket ids in code** — `SIG-468`, `JIRA-123` sitting in a comment or docstring. (They belong in the
  commit message or PR, not scattered through the source.)
- **Agent-to-user chatter** — `as requested`, `as you asked`, `per your instructions`, `I've added…`,
  `Note: I changed…`, `TODO(kevin)`, `generated by`, and similar first-person or you-addressed notes.

If a reference is the *whole* comment, delete the line. If it's embedded in an otherwise useful comment,
excise just the reference and keep the rest — then re-judge that comment under Step 4.

## Step 4 — Prune the comments

Default to **removing**, not rewriting. The test for keeping a comment is simple: *could a competent
teammate reconstruct this from the code in front of them?* If yes, the comment is noise — delete it. If
no, keep it (tightened to one line if it's rambling). State, in plain English, the constraint the code
can't show: the non-obvious **WHY**.

Delete comments that restate the code or narrate change history:

```
# before
# increment the counter by one
counter += 1
# loop over each user in the list
for user in users:
    # skip inactive users
    if not user.active:
        continue

# after
counter += 1
for user in users:
    if not user.active:
        continue
```

Keep comments that carry a **WHY** the code can't show — the load-bearing ones:

```
# kept: the reason is invisible from the code
# Stripe rounds half-to-even; we round half-up to match the invoice PDF.
amount = round_half_up(cents)

# kept: a real gotcha
# Must run before the migration below — it backfills the column that one reads.
```

**Never touch functional comments.** These are code, not commentary, and deleting them changes behavior
or breaks tooling:

- Shebangs (`#!/usr/bin/env python`) and encoding lines.
- Linter / type / formatter pragmas: `# noqa`, `# type: ignore`, `# pragma: no cover`, `# fmt: off`,
  `// eslint-disable-next-line`, `// @ts-ignore`, `# pylint: disable=…`.
- License / copyright headers.
- Docstrings on public functions, classes, and modules (tighten a bloated one, but keep it).
- Codegen / framework markers the toolchain reads.

When in doubt whether a comment is load-bearing, keep it. A surviving mediocre comment is a smaller harm
than a deleted one that was holding a real constraint.

## Step 5 — Make the edits, surgically

Apply every edit from Steps 2–4 **only within the line ranges from Step 1**. Don't reflow surrounding
code, re-wrap untouched comments, rename symbols the change didn't introduce, or fix unrelated style —
that churn is exactly what makes a diff hard to review. After editing, re-run the scanner (or a plain
`git diff`) and confirm every change you made lands on a line the original change set already touched,
and that the relevant existing checks still pass.

## Step 6 — Commit messages (propose, don't rewrite)

If the change set is a **commit or range**, its message often carries the same scaffolding (bead ids,
ticket refs). Scan the message(s) too. **Do not rewrite history on your own** — instead, print a cleaned
message as text plus the exact command the user can run:

```
git commit --amend    # for the tip commit
# or, for an older commit:
git rebase -i <hash>~1   # reword <hash>
```

For staged/working changes there's no message yet — if the user is about to commit, offer a clean
one-line message they can use.

## Step 7 — Report

Close with a short summary so the user can trust the pass without re-reading every file:

```
Polished <N> files (<change-set>):
  simplified:          <n> names · <n> structure · <n> derivable-state dropped
  references removed:  <n> bead · <n> ticket · <n> local-doc · <n> chatter
  comments removed:    <n>   tightened: <n>   kept (load-bearing): <n>

Kept on purpose:
  path/to/file.py:42 — "Stripe rounds half-to-even…" (external constraint)

Commit message (proposed):
  <cleaned message, if applicable>
```

Then show the diff, or tell the user to run `git diff`, so they see exactly what moved before they
stage it.

---

*Attribution: the simplify criteria (word choice, names, structure, derivability, overfitting) are
adapted from the `simplify` skill in [hubble.md](https://github.com/bholmesdev/hubble.md) by Ben Holmes,
used under the MIT License. The de-noising steps (reference stripping, comment pruning, the surgical
changed-lines-only rule, and the bundled `scan_changeset.py`) carry forward from this repo's prior
`scrub` skill, which `polish` replaces.*
