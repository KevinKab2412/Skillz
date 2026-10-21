---
name: to-pr
description: >-
  Prepare draft PRs from finished work, with concise descriptions, blast-radius banners, and visual
  proof. Use for opening a PR, turning an HTML explainer into a PR body, splitting changes into
  reviewable PRs, or creating/managing a logical stack of dependent branches. Inspect local and
  remote unmerged branches; propose splits or stacks only for real dependencies, with approval
  before moving work or rewriting history. Owns gh-stack operations; no separate stacking skill.
  Default base is dev; PRs are drafts. Does not review code or generate explainers.
---

# to-pr

> **Output discipline (hard rule).** Every output this skill produces obeys [`references/brevity/output-discipline.md`](references/brevity/output-discipline.md): **≤150 words of prose**, plain dumbed-down English, point first. Anything past 150 words becomes a **visual** — table, tree, diff, or code block (format menu: [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md)). Words inside a visual don't count. The cap covers the PR body itself — keep its prose under 150 words and put the change's shape in a diff or table.

Open a **draft** PR for the current branch, with a clean, **concise** Markdown body distilled from
the work that's already finished. `to-pr` does not review the code and does not build a review
artifact — **that happens before you call it**. It shapes finished work into reviewable PRs,
then writes a scannable description and opens each draft. Splitting and stacking are conditional
preparation steps, not mandatory ceremony for a single coherent branch.

It distils from whatever source best describes the change:

- **If a `code-review` explainer already exists** for this branch (a self-contained HTML learning
  artifact under `explanations/` or `docs/`, produced by a prior review pass), use it as the richest
  source — it already carries the summary, the "why", and any figures.
- **Otherwise, work straight from the branch** — the diff over `<base>...HEAD` and the commit
  messages. Do not generate an explainer and do not run `code-review`; just read what shipped and
  describe it.

Whichever the source, a PR description has one job: a reviewer skims it to get oriented, then reads
the real code in GitHub's own diff view. So this skill **distils**; it never transcribes. Keep the
summary, the "why", and any figure that teaches — drop the scaffolding a teammate doesn't need.

**Keep it proportional.** A good PR body is *shorter* than the change it describes. If the
description is longer than the diff, cut. GitHub already renders the code and the diff — the body
earns trust by being scannable, not exhaustive.

## Lead with a blast-radius banner

Reviewers now read *less* code, not more — no one can read every line of every PR. So the most useful
thing a body carries, after the summary, is **where to spend the reading budget**: which files are a
one-way door that need every line read, and which are safe to skim. `to-pr` stamps that at the very
top as a **blast-radius banner** — a one-line band (🔴 Deep read / 🟠 Spot-check / 🟢 Skim) plus a
five-row signal table.

The band comes from the shape of the diff: how central the changed files are (trunk vs leaf), whether
it alters existing behavior, whether a bug would be loud (seen on first load) or silent (wrong data
that looks fine), whether a rollback restores everything or it is a one-way door, and whether proof is
attached. The deep read goes where a bug would be silent or permanent; a wide but loud, revertible
change with live proof gets a spot-check. It is a **structural** signal — it says *how hard to look* and stops there. It
carries no opinion on whether the code is good; `to-pr` does not review, and the banner never pretends
to. Defect severity (blocker / should-fix / nit) is `code-review`'s separate axis. The full rubric —
how to read each signal off the diff, the band thresholds, the banner format — is in
[`references/blast-radius.md`](references/blast-radius.md).

## Inputs

Parse these from the user's invocation. Nothing here is required — with a bare `/to-pr` on a branch,
build the body from the diff and commits (Step 1).

- **Explainer path** (optional) — an existing `.html` file to distil (e.g.
  `explanations/explain-<slug>-<date>.html`). If omitted, look for one; if there's none, work from
  the diff instead. Never generate one.
- **Base branch** (default `dev`) — the PR target and the range the body describes (`<base>...HEAD`).
  Honor an explicit "base X" / "into X" / "against X".
- **Draft** — always open as a draft; the user marks it ready separately.
- **Title** (optional) — if the user gives one, use it; otherwise derive it from the explainer's
  `<h1>` if there is one, else from the branch's commit history.
- **Quiz** (default off) — only relevant when distilling an existing explainer; leave it out unless
  the user asks to keep it.
- **Blast-radius band** (optional override) — the reviewer's dial is computed from the diff by
  default. If the user sets a band ("mark this deep read", "this is leaf, skim it"), use theirs and
  keep the signal table as the evidence.
- **Proof** (default on) — every call prepares visual proof and posts it as a PR comment (Step 8).
  Pass `--no-proof` to skip it (e.g. when the app can't run in this environment).

## Step 0 — Choose single PR, split, or stack

Before preparing a PR, follow [PR layout](references/pr-layout.md): inspect the current work plus
local and remote branches that have not merged, and open PRs. Inspect existing refs read-only;
fetch the relevant remote when available, and disclose stale/offline results. Use actual code and
commit dependencies, ownership, and PR history to decide what belongs together. An unmerged branch
is only a candidate, never permission to change it. Independent work stays independent.

- One coherent change → continue below with one PR.
- Independent concerns → propose separate PRs.
- Real foundation → consumer dependencies → propose a linear stack; consult the internal
  [gh-stack guide](references/gh-stack/guide.md) and its design reference.
- Stack maintenance only (view, sync, rebase, checkout, merge) → follow that guide for the requested
  operation and stop; do not create unrelated PRs. Inspect help before using version-dependent flags.

Get approval of branches, scopes, bases, and order before splitting or forming/restructuring a stack.
Snapshot committed, dirty, and untracked work before moving it. Never auto-stash, delete branches,
force-push, rewrite history, or merge a PR merely because `/to-pr` was invoked. Explicit requests for
those operations still require checking their affected scope. For every approved PR, run Steps 1–9
against **that layer's base**, not trunk; with `gh stack submit --auto`, use Step 7 to update each
created draft's title/body rather than opening duplicates.

## Steps

1. **Gather the source material.** Reviewing the code is *not* part of this — assume it already
   happened. Just collect what describes the finished change:
   - **If the user gave an explainer path**, read that HTML file. If it isn't there, say so and fall
     back to the diff rather than stopping.
   - **If they didn't**, look for an existing branch explainer (e.g.
     `explanations/explain-<slug>-<date>.html`). If one is there, distil from it.
   - **If there's no explainer** (the common case for a bare `/to-pr`), work straight from the
     branch: read the diff with `git diff <base>...HEAD`, the file list with
     `git diff --name-only <base>...HEAD`, and the commit messages with
     `git log <base>..HEAD`. Those are your raw material for the summary, the "why", and the change
     bullets. Do **not** run `code-review` and do **not** write an explainer.

2. **Decide the PR title.** Use the user-provided title if any; else the explainer's `<h1>` text if
   there is one; else summarise the branch's commits into one line. If a ticket id (e.g. `SIG-520`)
   appears in the explainer's `.meta`/title or in a commit message, keep it in the title so the PR
   links back. Keep the title one line.

3. **Write the body in Markdown** — distilling, not transcribing.
   - **Working from the diff (no explainer):** write the sections directly — a 1–3 sentence summary,
     the "why", any figure worth drawing (as a `mermaid` block, per the figure rule below), and a
     short bullet summary of the change grouped by file or concern. Skip straight to Step 5 for
     assembly; the mappings below are only for when an explainer exists.
   - **Distilling an explainer:** work in the explainer's own order, but drop anything that doesn't
     help a reviewer orient. Mapping:
   - `<h2>` → `##`, `<h3>` → `###`.
   - Paragraphs / `.lede` → plain paragraphs. `<blockquote>` → `>` Markdown quote.
   - `.callout` blocks → a blockquote led by the bold label, e.g. `> **Intuition** — …`. Keep only
     the ones that carry real signal; skip teaching asides a teammate already knows.
   - `details.bg` (the collapsible "Background") → keep it collapsible, converting the inner content
     to Markdown, but trim it hard — a reviewer skips known background:
     ```
     <details>
     <summary>How this works today (skip if you know it)</summary>

     …short markdown…

     </details>
     ```
   - **Figures / diagrams → keep them; re-express as GitHub-native visuals.** The illustrative parts
     (a state machine, a flow, a before/after) are the most valuable thing to carry across — they
     convey what prose can't, and reviewers love them. GitHub strips inline `<svg>` and `<script>`,
     so re-express each figure as the smallest visual that renders natively — pick the shape that
     fits: a fenced ` ```mermaid ``` ` block (`stateDiagram-v2`, `flowchart`, `sequenceDiagram`) for
     flow and interaction; a fenced text **file tree** for where code moved; a **call tree** for
     control flow; a **component tree** for UI structure; a ` ```diff ``` ` block shaped to match
     (a diffed file tree for a layout change, a diffed component tree for a UI change). The menu is
     in [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md). Read the
     figure's structure from the explainer's SVG or widget markup and reconstruct it faithfully. If a
     figure is purely decorative or can't be faithfully re-expressed, drop it rather than paste
     broken markup.
   - **Diff walkthrough → a short summary, not a re-paste.** GitHub already shows the full diff in
     the Files Changed tab, so don't reproduce it. Summarize the change as a few bullets grouped by
     file or by concern — *what* changed and *why*. Quote a fenced ` ```diff ``` ` snippet only for
     the one or two hunks that are genuinely load-bearing or non-obvious; never the whole diff.
   - **Unescape HTML entities** in any extracted text: `&lt;`→`<`, `&gt;`→`>`, `&amp;`→`&`,
     `&quot;`→`"`, `&#39;`/`&apos;`→`'`. Get these right in mermaid labels and any diff snippet.
   - **Quiz → drop by default.** The self-check quiz is personal-learning scaffolding and the single
     biggest source of PR-body bloat; leave it out unless the user explicitly asks to keep it. If
     they do, render each question under a `## Reviewer self-check` heading with its answer hidden
     behind a `<details>` toggle:
     ```
     **1. <question stem>**

     - A. <option>
     - B. <option>
     - C. <option>
     - D. <option>

     <details><summary>Answer & why</summary>

     **Correct: <letter>** — <why the correct option is right>

     </details>
     ```
   - **Drop entirely:** the `<script>` scoring logic, the scorebar, and any `<style>`/`<head>`
     content — none of it renders on GitHub.

4. **Score the blast radius.** Read the reviewer's dial off the diff, following
   [`references/blast-radius.md`](references/blast-radius.md). Rate the changed files on five signals —
   position (trunk vs leaf), behavior (changes the control experience vs additive-only), failure (loud
   vs silent), reversibility (revertible vs one-way door), and proof attached — then set the band to
   the **worst file**: a silent bug on a trunk file or live path, a one-way door, or a loud trunk
   change with no live proof → 🔴; a loud, revertible trunk change with live proof, gated shared
   code, or a silent risk confined to a leaf → 🟠; leaf + gated/additive + proof, or code that never
   reaches prod → 🟢. A missing flag alone is not a one-way door — a `git revert` undoes it. When
   unsure, round up. Fill the signal table's "This PR" column with the real finding for this diff (a
   count, a filename, "no flag"), never a bare label. **For 🔴 and 🟠, the banner's one-line clause
   must name the specific reason** — the actual subsystem and what breaks if it's missed ("Deep read
   because it touches the permissions system — a bug here silently grants or denies access"), not a
   generic "trunk change". 🟢 Skim can stay brief. This is structural — never infer defects. Honor a
   user-set band if given.

5. **Assemble the body — banner first, then lead with the ask, keep it tight.** Put the blast-radius
   banner (Step 4) at the very top so the reviewer sets their depth before reading anything else. Then
   a 1–3 sentence summary so the reviewer gets the point immediately, the "why", any figure (as
   mermaid), and a short bullet summary of the key changes. That is usually the entire body. If the branch already has a PR with
   hand-written notes (e.g. `Closes <TICKET>`, merge-order caveats, test counts), graft those lines
   in rather than discarding them. End the body with, on its own line:
   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```
   Write the finished Markdown to a temp file (the session scratchpad, or `/tmp/to-pr-body.md`).

6. **Prepare the branch.** Confirm the current branch is not the base branch. Push it if it has no
   upstream: `git push -u origin HEAD`. If the working tree has uncommitted changes, surface that
   and let the user decide before creating the PR — don't commit on their behalf.

7. **Open the draft PR:**
   ```bash
   gh pr create --draft --base <base> --title "<title>" --body-file <body.md>
   ```
   If a PR already exists for this branch, `gh pr create` will say so — in that case offer to
   update the existing body instead: `gh pr edit --body-file <body.md>`.

8. **Prepare visual proof and post it as a comment** (on by default, every call — `--no-proof` to
   skip). Follow [`references/visual-proof.md`](references/visual-proof.md). Read the
   diff: if it touches UI and the app can be started, launch it (reuse the [`run`](../run/SKILL.md)
   skill), drive the changed screen(s) with `agent-browser` (**real coordinate clicks** on finicky
   React/Radix/Reflex controls — `eval`/`@ref` clicks are silently dropped), and screenshot them —
   **empty states are valid, labelled, evidence; never fake data**. If there's no UI or the app won't
   start, build a mermaid **state/sequence diagram** of the changed flow instead. Write the comment —
   proof is a **comment**, never the body — and **post it straight away, without asking**: one
   `gh pr comment <PR URL> --body-file <draft> --attach <png>…` call uploads the shots and posts
   (`gh` ≥ 2.99.0, `gh`'s own login, private repos included, no browser). The user edits or deletes it
   afterwards if they want changes. Recipe: [`references/visual-proof.md`](references/visual-proof.md)
   A4–A5.

9. **Report** the PR URL. Note that it opened as a draft and remind the user they mark it ready
   themselves. Say the blast-radius band in one line so they know how the reviewer will be steered, and
   link the proof comment you posted (screenshots or a diagram).

## Notes

- **No explainer? Work from the diff.** A bare `/to-pr` on a branch is the common case — build the
  body straight from `git diff <base>...HEAD` and the commit messages. Don't run `code-review` and
  don't write an explainer; reviewing the change is a separate step the user does before `/to-pr`.
- **Shorter than the diff.** The reviewer reads the code on GitHub; the body just orients them. Lead
  with the summary and the "why", keep any figure, and cut the rest. If the body is longer than the
  change, you've over-written it.
- **Banner first, and it's structural.** The blast-radius banner sits above the summary — it's the
  first thing the reviewer reads, and it sets how hard they look (🔴 deep / 🟠 spot-check / 🟢 skim).
  It reads the *shape* of the diff (trunk vs leaf, loud vs silent failure, revertible vs one-way door,
  proof attached) to set the dial; it never judges the code's quality. That verdict is `code-review`'s job, on a separate
  severity axis (blocker / should-fix / nit). Round up when unsure; never invent proof to lower the
  band. Full rubric: [`references/blast-radius.md`](references/blast-radius.md).
- **Keep the visuals.** Re-expressing the change's shape as a GitHub-native visual — a `mermaid`
  block, a fenced file/call/component tree, or a shape-matched `diff` — is worth the effort; it's the
  part reviewers most appreciate. Pick the smallest one that carries the point. Never paste raw
  `<svg>` (GitHub strips it).
- **Proof is posted automatically.** Every call prepares proof (Step 8): screenshots for UI changes,
  a mermaid diagram otherwise. It posts the comment without asking — `gh pr comment --body-file …
  --attach …` uploads the shots and posts in one call, private repos included — and the user adjusts
  it afterwards. This is the one comment `to-pr` writes on its own; any other PR or issue comment
  still waits for the user's words ([[feedback-never-post-pr-comments]]).
  **Empty states are valid, labelled evidence; never fabricate a screenshot.** On finicky
  React/Radix/Reflex controls use **real coordinate clicks** (`mouse_move/down/up`), not `eval`/`@ref`
  clicks, which are silently dropped. Full procedure:
  [`references/visual-proof.md`](references/visual-proof.md).
- **Drafts by default.** This user always opens PRs as drafts and marks them ready manually — do
  not use `--web` or open a non-draft in this workflow.
- **Don't paste the raw HTML.** It renders as broken, unstyled text. Always convert. Only
  `<details>`, `<summary>`, `<table>`, `<img>`, `<a>`, `<kbd>`, `<sub>`, `<sup>`, `<br>`, and
  ` ```mermaid ``` ` fences survive GitHub's sanitizer.
