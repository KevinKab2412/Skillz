# Portable Pi setup

Snapshot from 2026-10-22, Pi **1.3.0**, for macOS/Linux. This directory is an explicit
allowlist of portable configuration, not a copy of the agent directory.

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
The original settings had no saved startup model; this snapshot makes the session's
selection explicit. Other preferences retain Pi 1.3.0 defaults.

Optional local worker: install [Ollama](https://ollama.com), run its service, then:

```bash
ollama pull qwen3.8:27b
```

The configured endpoint is `http://127.0.0.1:11434/v1`, with a 32,768-token context
and 8,192-token output limit. The `ollama` key is a dummy local-server key.
Model availability and suitable hardware are required; model weights are not in Git.

## Included

- Portable settings and Ollama model configuration.
- `/local-batch <task-brief-path>` prompt and `templates/local-batch-brief.md`.
- All current Skillz skills, shared policies, and instruction modules through `install.sh`.
- Runtime version pin. npm resolves runtime dependencies; this is not a binary or
  transitive-dependency archive, and hosted model catalogs can change.

There were no custom extensions, themes, keybindings, or global MCP servers at capture.
The redundant Pi-only standup symlink is unnecessary: Pi discovers `~/.agents/skills`.
The stale skill-creator exclusion referenced a machine-specific synced path and is omitted;
Skillz already retires that global skill.

## Restore behavior and privacy

`bash pi/setup.sh` runs the skill installer and **replaces** the captured Pi settings,
models, prompt, and template. Existing copies are backed up under
`~/.pi/agent/backups/skillz-<timestamp>/`. It preserves an existing device ID and
changelog marker. Unrelated prompts and templates remain untouched. Normal
`bash install.sh` does not replace Pi settings. `PI_HOME` and `AGENTS_HOME` overrides
work as with the skill installer.

Never commit `auth.json`, device identifiers, trust decisions, sessions, caches,
provider model catalogs, backups, or downloaded binaries. Sign in and approve project
trust separately on each machine. Private visual concept overlays are also excluded;
transfer any you need separately and securely. The repository's generated global
instructions are restored by `install.sh`; unrelated personal dotfiles are not managed.

When changing the setup, edit these allowlisted files after checking for secrets,
then rerun `bash pi/setup.sh`. Do not recursively copy `~/.pi/agent` into Git.
