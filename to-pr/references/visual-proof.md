# Visual proof — capture evidence, draft a comment, let the user post

Every `/to-pr` prepares **proof of the finished change** and **drafts a PR comment** for the user to
post. This is the video's core move: hand the reviewer evidence — a screenshot, a flow — so they trust
and skim instead of re-deriving.

**The proof step never posts on its own.** It captures, shows the user the result in chat, and drafts
the comment. Posting to the PR happens **only when the user gives the word** — see
[[feedback-never-post-pr-comments]]: approval to post is not approval to author, and a posted comment
is public the moment it lands. So the default is capture + draft; the browser upload-and-submit runs
only after the user says "post it".

Two kinds, picked from the diff:

- **UI change → real screenshots** (captured with `agent-browser`).
- **No UI, or the app won't start → a mermaid diagram** (state or sequence) of how the behavior changed.

## Step 1 — Decide the proof kind

Read the diff. UI is touched if changed paths include front-end files — `.tsx/.jsx/.vue/.svelte`,
`components/`, `pages/`, `app/`, `routes/`, template or style files. If UI is touched **and** the app
can be started locally → **screenshots** (Section A). Otherwise → **diagram** (Section B).

## Section A — Screenshot proof (UI changes)

### A1. Start the app locally

Reuse the [`run`](../run/SKILL.md) skill to find and run the start command — it already knows the
patterns (a project skill, `package.json` scripts, `Procfile`, `docker-compose`, `Makefile`, the
README). Launch it in the background; wait for the port to answer before capturing.

### A2. Capture the changed screens

Use `agent-browser` pointed at the local app:

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

### A4. Draft the comment (do not post)

Save the shots locally, show them to the user in chat, and produce a **ready-to-post comment draft** in
a fenced block: one caption line per shot. Then stop. Do not upload to GitHub and do not submit — that
is the user's call (A5).

### A5. Post — only on the user's explicit go

When the user says to post, drive the **logged-in** `agent-browser` GitHub session:

1. `agent_browser_state_load` a saved `github` state; if none exists, one-time `agent_browser_auth_login`
   then `agent_browser_state_save` as `github`.
2. `agent_browser_open` the PR, scroll to the comment box.
3. `agent_browser_upload` the PNGs onto the comment box's file input (`input[type=file]`; fall back to
   drag/paste). **Wait** until each upload finishes — GitHub inserts a
   `![name](https://github.com/user-attachments/assets/…)` line for each. This browser upload is the
   only path that renders images in a **private** repo: there is no comment-image API, and a committed
   raw URL breaks behind GitHub's camo proxy (an anonymous fetcher with no login).
4. Add the captions, then submit **only if the user said to post this draft as-is**. If they want to
   review first, leave the box filled and unsubmitted and tell them it's staged.

### A6. Stop the app

Tear down the local app process started in A1.

## Section B — Diagram proof (no UI, or launch failed)

Build the **smallest** mermaid that shows how the code's behavior changed, following the figure rules
in [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md):

- a `sequenceDiagram` for a call/request/message flow that changed,
- a `stateDiagram-v2` for a state machine or lifecycle that changed,
- a shape-matched `flowchart` for control flow.

Read it off the diff. Present it as a **ready-to-post fenced block in chat** for the user to paste.
Mermaid renders inline in a comment, so no upload is needed — but still don't `gh pr comment` it
yourself; the user posts it (or says to).

## Rules

- **Prepare proof every call; never post it.** Default on for every `/to-pr` (`--no-proof` to skip).
  Capture + draft always; posting to the PR waits for the user's explicit word. Same rule as
  [[feedback-never-post-pr-comments]].
- **Comment, never body.** The body stays lean (blast-radius banner + summary). Proof is a separate
  comment draft so it never bloats the description.
- **Never fake a shot.** App won't start or capture fails → fall back to a diagram and say so. Empty
  data → an honest empty-state shot, labelled. Never describe pixels that aren't there.
- **Trusted clicks for finicky UIs.** Real coordinate `mouse_move/down/up`, not `eval`/`@ref` clicks,
  on React/Radix/Reflex controls that silently ignore synthetic events.
- **After-only by default.** One set of "after" shots. Before/after needs running the base branch too —
  skip unless the user asks.
