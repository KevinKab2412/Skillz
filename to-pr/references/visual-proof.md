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

An image reaches a **private** repo's comment only through GitHub's own upload door in a signed-in
browser: there is no comment-image API, and a committed raw URL breaks behind GitHub's camo proxy (an
anonymous fetcher with no login). So uploads go through one dedicated `agent-browser` session named
`github`, whose GitHub login is saved to disk and restored on every run. The user signs in once; after
that no switch, profile or password is needed.

**Send identical launch options on every call.** The daemon compares launch options on each command.
Any difference restarts the browser and drops the page it was on (the call reports
`restartedBackground: true`). Use one interface per run, with the same options every time:

| Interface | On every call |
|---|---|
| CLI | `agent-browser --session github --restore github --restore-save auto --headed --idle-timeout 30m <command>` |
| MCP tools | `session: "github"`, `restore: "github"`, `restoreSave: "auto"`, `idleTimeout: "30m"`; plus `headed: true` on `open` and `extraArgs: ["--headed"]` on every other tool |

A call from the other interface without those options relaunches the session blank.

1. **Open the PR** (`open https://github.com/<owner>/<repo>/pull/<n>`) and check the login:
   `eval "document.querySelector('meta[name=user-login]')?.content"` returns the user's GitHub login.
2. **First run, or signed out** (no login, or the page lands on `github.com/login`): open
   `https://github.com/login?return_to=<PR path>` in that headed session and ask the user to sign in
   in the window it shows, two-factor code included, and to say when they're done. Never type their
   GitHub password. Restore saves the login to `~/.agent-browser/sessions/github-github.json`; run
   `chmod 700 ~/.agent-browser/sessions` so only they can read it. GitHub's login cookie lasts two
   weeks. Each run re-saves it, and when it lapses, repeat this step. The user can revoke it any time at
   github.com/settings/sessions.
3. **Upload** the PNGs onto the comment box's file input: `upload "#fc-new_comment_field" <png>…`.
   Then wait until `#new_comment_field` holds one `user-attachments/assets` link per file and no
   "Uploading" (`wait --fn "…"`).
4. **Take the links, leave the box empty.** Read the textarea (`get value "#new_comment_field"`): it
   holds one `<img … src="https://github.com/user-attachments/assets/…">` tag per file. Clear it (set
   `value = ''` and dispatch an `input` event) so no half-written draft is left on the PR.
5. **Post** the approved captions with those `<img>` tags as a plain PR comment,
   `gh pr comment <n> --body-file <file>`, **only if the user said to post this draft as-is**. If they
   want to review first, put the text in the comment box instead, leave it unsubmitted, and tell them
   it's staged.
6. **Verify and close.** Open the new comment's anchor and check every image loaded
   (`img.complete && img.naturalWidth > 0`). Then `state save ~/.agent-browser/sessions/github-github.json`
   and `close`. The saved login survives the close.

Never launch with `--profile`. Copying a Chrome profile makes macOS ask for keychain access to
Chrome's cookie key, and the copy may not be signed in anyway.

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
- **One saved GitHub session, identical options.** Uploads use the `github` session with the same
  launch options on every call (A5). The user signs in once, never per run.
- **After-only by default.** One set of "after" shots. Before/after needs running the base branch too —
  skip unless the user asks.
