# Portable Pi setup

Portable configuration synced from the live global setup on 2026-10-26, Pi **1.4.0**,
for macOS/Linux. Restore the same preferences, extensions, prompts, model limits,
skills, instructions, and MCP server definitions on a new machine. Credentials,
project trust, conversation history, and external services are handled separately.

## Restore on another system

Install Git, Bash, Python 3, and Node.js **22.19+**, then:

```bash
git clone https://github.com/KevinKab2412/Skillz.git
cd Skillz
npm install -g --ignore-scripts "@earendil-works/pi-coding-agent@$(< pi/version)"
bash pi/setup.sh
pi --version
pi
```

Run `/login` for the providers you use. The startup model is the model used when this
snapshot was taken: `openai-codex/gpt-6.1-sol`, medium thinking. If your account does
not offer it, choose an available model with `/model` and save with Ctrl+S.
All saved portable settings match the live setup. Unspecified preferences use the
pinned Pi runtime's defaults.

Optional local worker: install [Ollama](https://ollama.com), run its service, then:

```bash
ollama pull qwen3.8:27b
```

The configured endpoint is `http://127.0.0.1:11434/v1`, with a 16,384-token context
and 8,192-token output limit. The `ollama` key is a dummy local-server key.
Model availability and suitable hardware are required; model weights are not in Git.

## Included

- Portable settings and Ollama model configuration.
- `/local-batch <task-brief-path>` prompt and `templates/local-batch-brief.md`.
- All current Skillz skills, shared policies, and instruction modules through `install.sh`.
- Inline short-name skill completion and explicit loading via `extensions/inline-skills.ts`.
- Automatic local session naming via `extensions/auto-session-name.ts`.
- Slack, Linear, Sentry, PostHog, and local Experts MCP definitions in `mcp.json`.
- Runtime version pin. npm resolves runtime dependencies; this is not a binary or
  transitive-dependency archive, and hosted model catalogs can change.

There are no custom themes or keybindings in the captured setup. Unrelated files
already present on a destination remain unmanaged.
The redundant Pi-only standup symlink is unnecessary: Pi discovers `~/.agents/skills`.
The stale skill-creator exclusion referenced a machine-specific synced path and is omitted;
Skillz already retires that global skill.

## MCP prerequisites and sign-in

The setup restores server definitions, but does not copy login tokens or contact the
servers during installation. For the remote servers, sign in on the new machine:

```bash
pi mcp login linear
pi mcp login sentry
pi mcp login posthog
pi mcp login slack
pi mcp list
```

Slack uses the same registered OAuth application's public client ID, callback URL,
and scopes as the live setup. Supply its client secret through `SLACK_CLIENT_SECRET`
in the environment whenever you run Pi (for example through your password manager).
Obtain that secret securely from your Slack app configuration or existing machine;
it is intentionally absent from Git. Set it before the Slack login command. When
rerunning setup on an existing machine, its locally stored Slack secret is retained
if the server URL and OAuth client ID still match. Other remote servers use their
normal browser OAuth flow.

The Experts server needs [uv](https://docs.astral.sh/uv/) and a separate repository:

```bash
mkdir -p ~/Documents
git clone https://github.com/KevinKab2412/Experts.git ~/Documents/Experts
uv sync --directory ~/Documents/Experts
```

Follow that repository's setup instructions for any data or service dependencies.
By default, setup uses `~/Documents/Experts` and the `uv` executable on `PATH`
(falling back to `~/.local/bin/uv`). To use other locations:

```bash
EXPERTS_DIR=/path/to/Experts UV_BIN=/path/to/uv bash pi/setup.sh
```

Setup resolves those paths for the destination machine. It prints a reminder if the
Experts checkout or Slack secret is missing. Model access, Slack workspace approval,
external server availability, Experts data, and Ollama model weights must be available
to reproduce the same working capabilities; configuration restore alone cannot supply them.

## Inline skill names

After setup, restart Pi or run `/reload`. Type `hey /pa` to see the suggestion menu
with skill descriptions, then use Tab to complete `hey /pair`. The menu opens while
typing, including on later lines; short names also work at the beginning of a prompt. On submission,
the extension loads each mentioned skill once and keeps your original request intact:

```text
/pair --auto fix the failing test
Can you use /explain to walk me through this?
```

Only skills already discovered by Pi are eligible. Built-in commands, extension commands,
and prompt templates keep their names when there is a collision; use `/skill:name` for
an explicitly named skill in that case. Native `/skill:name` commands keep working.
Inline commands such as `hey /model` do not execute commands. Requests beginning with
a native command or prompt template retain Pi's own argument handling and expansion.

Mentions must be standalone whitespace-delimited names (trailing punctuation is allowed).
Paths, URLs, escaped slashes, and Markdown code examples are ignored. Multiple mentions
load multiple skills; repeated mentions load one copy. Loading applies only to interactive
user input, not extension-generated requests. A skill read failure reports an error and
returns the request to the editor instead of silently sending it without instructions.

To install only the extension without restoring your preferences:

```bash
mkdir -p ~/.pi/agent/extensions
cp -f pi/extensions/inline-skills.ts ~/.pi/agent/extensions/
```

Then run `/reload`. Remove that file and reload to disable it.

The extension installs a thin `CustomEditor` subclass that preserves Pi's controls and
uses its existing suggestion menu. Pi 1.4.0 excludes `/` from provider trigger characters,
so the adapter makes one isolated call to the editor's private `requestAutocomplete`
method. Recheck the installed-runtime tests when upgrading Pi. Because Pi has one
custom editor slot, this extension does not compose with other editor-replacement
extensions; whichever installs its editor last wins.

Tests (Node.js 22.19+ and Python 3):

```bash
node --experimental-strip-types --test tests/test_pi_inline_skills.mjs tests/test_pi_session_name.mjs
python3 -m unittest discover -s tests -p test_pi_setup.py
```

Set `PI_TEST_NODE_MODULES` to the pinned runtime's `node_modules` directory when running
the Node tests to also exercise Pi's real loader, autocomplete provider, and Jiti loading.
Without it, the installed-runtime integration case is skipped.

## Restore behavior and privacy

`bash pi/setup.sh` runs the skill installer and **replaces** the captured Pi settings,
models, prompt, template, both bundled extensions, and the five managed MCP definitions. Existing copies are backed up under
`~/.pi/agent/backups/skillz-<timestamp>/`. It preserves an existing device ID and
changelog marker. Unrelated prompts, templates, extensions, and MCP servers remain untouched.
MCP tokens in `mcp-auth.json` are never copied or modified. Normal
`bash install.sh` does not replace Pi settings. `PI_HOME` and `AGENTS_HOME` overrides
work as with the skill installer.

Never commit `auth.json`, `mcp-auth.json`, OAuth client secrets, device identifiers,
trust decisions, sessions, caches,
provider model catalogs, backups, or downloaded binaries. Sign in and approve project
trust separately on each machine. Private visual concept overlays are also excluded;
transfer any you need separately and securely. The repository's generated global
instructions are restored by `install.sh`; unrelated personal dotfiles are not managed.

When changing the setup, edit these allowlisted files after checking for secrets,
then rerun `bash pi/setup.sh`. Do not recursively copy `~/.pi/agent` into Git.
