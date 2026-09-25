# Visual proof — attach evidence to the PR as a comment

Every `/to-pr` attaches **proof of the finished change** as a PR *comment* (never the body), so a
reviewer sees what changed without checking it out. This is the video's core move: make the agent
hand over evidence — a screenshot, a flow — so the reviewer trusts and skims instead of re-deriving.

Two kinds, picked from the diff:

- **UI change → real screenshots**, uploaded through a **logged-in browser**.
- **No UI, or the app won't start → a mermaid diagram** (state or sequence) of how the behavior changed.

## Why upload screenshots through a real browser

GitHub has **no API** to put an image into a comment. The only working path is the browser's own
upload door — the same drag-drop a human uses — which mints a `github.com/user-attachments/assets/…`
URL that renders for everyone, **public or private repo**. Committing a PNG and linking its raw URL
does *not* work on private repos: GitHub proxies every image through its anonymous fetcher (camo),
which has no login and gets denied, so the reader sees a broken icon. So we drive a logged-in browser
to do exactly what a person would: open the PR, attach the images, submit the comment.

## Step 1 — Decide the proof kind

Read the diff. UI is touched if changed paths include front-end files — `.tsx/.jsx/.vue/.svelte`,
`components/`, `pages/`, `app/`, `routes/`, template or style files. If UI is touched **and** the app
can be started locally → **screenshots** (Section A). Otherwise → **diagram** (Section B).

## Section A — Screenshot proof (UI changes)

### A1. Start the app locally

Reuse the [`run`](../run/SKILL.md) skill to find and run the start command — it already knows the
patterns (a project skill, `package.json` scripts, `Procfile`, `docker-compose`, `Makefile`, the
README). Launch it in the background; wait for the port to answer before capturing.

### A2. Capture the changed screens (app browser session)

Use `agent-browser` in a throwaway session pointed at the local app:

- `agent_browser_open` the route(s) the diff changed; `agent_browser_snapshot` to get stable refs,
  drive any state the change needs (log in, open the dialog, toggle the feature).
- `agent_browser_screenshot` each changed screen; save the PNGs to the session scratchpad. Name each
  file after what it shows (`save-card-button.png`), so the caption writes itself.
- Capture only what the diff changed — one to three shots, not a tour.

### A3. Upload through the logged-in GitHub browser

A **separate** `agent-browser` session that carries a saved GitHub login:

1. **Session:** `agent_browser_state_load` a saved `github` state. If none exists, this is the
   one-time setup — `agent_browser_auth_login` to GitHub interactively, then `agent_browser_state_save`
   as `github` so every later run is unattended.
2. `agent_browser_open` the PR URL (you just created it — you have it). Scroll to the **comment box**
   at the bottom.
3. **Attach the files:** `agent_browser_upload` the saved PNGs onto the comment box's file input
   (`input[type=file]` behind the toolbar's attach control). If the input is not targetable, fall back
   to a drag/paste onto the textarea. **Wait** until each upload finishes — GitHub inserts a
   `![name](https://github.com/user-attachments/assets/…)` line into the textarea for each file
   (`agent_browser_wait_for_text` on `user-attachments`).
4. Type one plain caption line per shot above its image (what it shows, e.g. "new Save button on the
   card").
5. Submit the comment (click **Comment**). Confirm it posted (`agent_browser_wait_for_selector` on the
   new comment, or re-read the PR).

### A4. Stop the app

Tear down the local app process started in A1.

## Section B — Diagram proof (no UI, or launch failed)

Build the **smallest** mermaid that shows how the code's behavior changed, following the figure rules
in [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md) and the code-review
explainer's approach:

- a `sequenceDiagram` for a call/request/message flow that changed,
- a `stateDiagram-v2` for a state machine or lifecycle that changed,
- a shape-matched `flowchart` for control flow.

Read it off the diff — the functions added/changed and how they call each other. Post it with
`gh pr comment <n> --body-file <diagram.md>`. Mermaid renders inline in comments, so **no upload is
needed** — this path always works, public or private.

## Rules

- **Proof every call.** The default is on for every `/to-pr`. A UI change gets screenshots; everything
  else gets a diagram — but a proof comment always goes up. `--no-proof` is the only escape hatch.
- **Comment, never body.** The body stays lean (blast-radius banner + summary). Proof is a follow-up
  comment so it never bloats the description.
- **Never fake a shot.** If the app won't start or capture fails, fall back to a diagram and say so in
  the comment ("app didn't start locally — flow shown as a diagram instead"). A described screenshot
  that doesn't exist is worse than an honest diagram.
- **After-only by default.** One set of "after" screenshots. Before/after needs running the base
  branch too — skip it unless the user asks.
- **The upload browser must be logged in.** First run needs a one-time GitHub login saved as a
  session; after that it's unattended. If no login is available, fall back to a diagram rather than
  blocking the PR.
- **Posting is the one outward action.** Creating the comment writes to GitHub. It's on the user's own
  PR and they've opted every call in — but it is the only thing here that leaves the machine.
