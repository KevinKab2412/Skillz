# Visual proof — capture evidence, post it as a comment

Every `/to-pr` prepares **proof of the finished change** and **posts it as a PR comment**. This is the
video's core move: hand the reviewer evidence — a screenshot, a flow — so they trust and skim instead of
re-deriving.

**The proof step posts on its own, without asking.** The user has said to post automatically and adjust
afterwards (edit or delete the comment) if they don't like something. Because the comment goes out under
their name unreviewed, keep it plain: one factual caption per shot saying what's on screen, no opinions,
no sales pitch. This is the only comment `to-pr` writes by itself; any other PR or issue comment still
waits for the user's words ([[feedback-never-post-pr-comments]]).

Two kinds, picked from the diff:

- **UI change → real screenshots** (captured with `agent-browser`).
- **No UI, or the app won't start → a mermaid diagram** (state or sequence) of how the behavior changed.

## Step 1 — Decide the proof kind

Read the diff. UI is touched if changed paths include front-end files — `.tsx/.jsx/.vue/.svelte`,
`components/`, `pages/`, `app/`, `routes/`, template or style files. If UI is touched **and** the app
can be started locally → **screenshots** (Section A). Otherwise → **diagram** (Section B).

## Section A — Screenshot proof (UI changes)

### A1. Start the app locally

Check the worktree root for `.worktree-stack.local.env` first — the sign this repo gives every
worktree its own isolated dev stack instead of one shared app/DB that concurrent worktrees fight over
(a personal, gitignored convention — nothing to set up on a repo that doesn't have it). If it's there:

- Source it for this worktree's ports (e.g. `WORKTREE_DASHBOARD_PORT`) and bring its stack up/confirm
  it's healthy (e.g. in signal-lift-dev: `./worktree-up.local.sh` from `deploy/dockers/local-dev/` in
  that worktree — idempotent and fast if already running, since identity and ports are derived
  deterministically from this worktree's path).
- Point A2's `agent_browser_open` calls at `http://localhost:<that worktree's port>/`, not whatever a
  generic start command would have bound.
- **Don't tear this down in A6** — it's meant to persist across runs and other skills
  (`/pair`, `/code-review`) in the same worktree, and gets torn down with the worktree itself, not
  with this one `/to-pr` call.

No `.worktree-stack.local.env` → fall back to the [`run`](../run/SKILL.md) skill to find and run the
start command — it already knows the patterns (a project skill, `package.json` scripts, `Procfile`,
`docker-compose`, `Makefile`, the README). Launch it in the background; wait for the port to answer
before capturing. This is the path A6 tears down.

### A2. Capture the changed screens

Use `agent-browser` pointed at the local app, in a **session scoped to this worktree**: call
`agent_browser_session_id` (default `scope: "worktree"`) once and reuse the name it returns as
`session` on every call below, with `headed: false`. Without this, two worktrees running
`/to-pr`/`/pair`/`/code-review` at the same time fight over the same browser tab, and a headed browser
steals screen focus from whatever else is on screen.

- `agent_browser_open` the route(s) the diff changed. Reach the state the change needs (log in, select
  the tenant/account, open the dialog, toggle the feature). `agent_browser_screenshot` each one; save
  the PNGs to the session scratchpad, named after what they show (`save-card-button.png`).
- Capture only what the diff changed — one to three shots, not a tour.

**Trusted clicks — the finicky-UI trap.** On React/Radix/Reflex UIs, `agent_browser_click @ref` and
`eval`-dispatched `.click()`/`MouseEvent`s are **silently ignored** — they are untrusted
(`isTrusted:false`) and the framework drops them, reporting success while nothing happens. For anything
that won't respond (menus, account/tenant switchers, dialogs), use a **real coordinate click**: read
the element's centre from `getBoundingClientRect()` via `eval`, then
`agent_browser_mouse_move` → `mouse_down` → `mouse_up` at those x/y. Watch for two gotchas: elements
often have a hidden mobile+desktop copy (pick the one with `rect.width>0`), and a login session can
drop mid-run (re-login if the page reverts to the login screen).

### A3. Empty states are real evidence — never fake data

If a screen has no data (nothing seeded in this environment), that is a **valid screenshot** — capture
it and label the caption honestly ("empty — no records seeded locally"). Do **not** imply a bug, and do
**not** fabricate or describe data that isn't on screen. A described screenshot that doesn't exist is
worse than an honest empty state. If richer data lives under another tenant/account, switch to it (real
coordinate click) and recapture; if you can't reach populated data, ship the empty-state shot and say
so.

### A4. Write the comment

Save the shots to the session scratchpad and write the comment to `proof-comment.md` in the **same
folder** as the shots. Give each shot its caption line and a local image reference, so the file reads as
the posted comment will:

```markdown
**Save button on the card** — enabled once the form is valid.
![Save button on the card](./save-card-button.png)
```

Go straight on to A5; don't wait for approval.

### A5. Post

`gh` uploads the shots and posts the comment in one call, using the login `gh` already holds. This works
in private repos too. Uploaded images are visible only to signed-in users who can read the repo. No
browser, no separate GitHub sign-in.

1. **Check `gh` is new enough.** `--attach` arrived in `gh` 2.99.0. If `gh --version` is older, stop and
   ask the user to `brew upgrade gh`. Don't fall back to a browser upload or a committed image.
2. **Post** from the folder holding the shots, naming the PR by URL (that folder isn't the repo, so `gh`
   can't infer it):
   ```bash
   cd <shots folder> && gh pr comment <PR URL> --body-file proof-comment.md \
     --attach ./save-card-button.png --attach ./empty-list.png
   ```
   `gh` uploads each file and rewrites the comment's matching `![…](./x.png)` reference to the uploaded
   URL. A file the comment doesn't reference is appended at the end.
3. **Verify.** `gh pr view <PR URL> --json comments --jq '.comments[-1] | .url, .body'` should show one
   `github.com/user-attachments/assets/…` link per shot and no `./…png` paths left over. Give the user
   the comment's URL so they can edit or delete it.

**Limits** (from the `gh` 2.99.0 release): PNG, JPEG, GIF, WebP, SVG, MP4, MOV or WebM; 10 MB per image;
up to 50 files per call; GitHub.com and Enterprise Cloud only. The user needs push access. `gh`'s own
login token works, but an Actions `GITHUB_TOKEN` or a GitHub App token is rejected. If the call fails,
report the error and hand the user the draft and the PNG paths to post by hand. Never fake the upload.

### A6. Stop the app

Tear down the local app process started in A1 — **unless A1 used a worktree-scoped stack**
(`.worktree-stack.local.env` was present), in which case leave it running. That stack is reused by later
`/to-pr`/`/pair`/`/code-review` calls in the same worktree and is torn down with the worktree itself
(see the [`worktree`](../worktree/SKILL.md) skill's cleanup note), not after one visual-check run.

## Section B — Diagram proof (no UI, or launch failed)

Build the **smallest** mermaid that shows how the code's behavior changed, following the figure rules
in [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md):

- a `sequenceDiagram` for a call/request/message flow that changed,
- a `stateDiagram-v2` for a state machine or lifecycle that changed,
- a shape-matched `flowchart` for control flow.

Read it off the diff. Write it as a fenced ` ```mermaid ``` ` block under a one-line caption, then post
it straight away with `gh pr comment <PR URL> --body-file <file>`. Mermaid renders inline in a comment,
so no `--attach` is needed. Give the user the comment's URL.

## Rules

- **Prepare and post proof every call.** Default on for every `/to-pr` (`--no-proof` to skip). Capture,
  write, post, then hand the user the comment link. Don't wait for approval; the user edits or deletes
  it afterwards.
- **Comment, never body.** The body stays lean (blast-radius banner + summary). Proof is a separate
  comment so it never bloats the description.
- **Never fake a shot.** App won't start or capture fails → fall back to a diagram and say so. Empty
  data → an honest empty-state shot, labelled. Never describe pixels that aren't there.
- **Trusted clicks for finicky UIs.** Real coordinate `mouse_move/down/up`, not `eval`/`@ref` clicks,
  on React/Radix/Reflex controls that silently ignore synthetic events.
- **Post with `gh --attach`.** One `gh pr comment --body-file … --attach …` call uploads and posts
  (A5). No browser and no GitHub sign-in beyond `gh`'s own.
- **After-only by default.** One set of "after" shots. Before/after needs running the base branch too —
  skip unless the user asks.
