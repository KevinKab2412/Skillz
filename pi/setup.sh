#!/usr/bin/env bash
# Explicit opt-in restore; ordinary install.sh never overwrites Pi preferences.
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$SOURCE")"
DEST="${PI_HOME:-$HOME/.pi/agent}"
mkdir -p "$HOME/.claude"
bash "$REPO/install.sh"
python3 - "$SOURCE" "$DEST" <<'PY'
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sys

source, dest = map(Path, sys.argv[1:])
backup = dest / 'backups' / ('skillz-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
files = [Path('settings.json'), Path('models.json'), Path('mcp.json')]
for directory, pattern in (('prompts', '*.md'), ('templates', '*.md'), ('extensions', '*.ts')):
    files.extend(p.relative_to(source) for p in (source / directory).glob(pattern))

# Validate before replacing any preferences. Keep machine identity and credentials local.
settings_path = dest / 'settings.json'
old_settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
settings = json.loads((source / 'settings.json').read_text())
for key in ('deviceId', 'lastChangelogVersion'):
    if key in old_settings:
        settings[key] = old_settings[key]
json.loads((source / 'models.json').read_text())
mcp_path = dest / 'mcp.json'
old_mcp = json.loads(mcp_path.read_text()) if mcp_path.exists() else {}
mcp = json.loads((source / 'mcp.json').read_text())
experts_dir = Path(os.environ.get('EXPERTS_DIR', str(Path.home() / 'Documents/Experts'))).expanduser().resolve()
experts = mcp['mcpServers']['experts']
experts['command'] = os.environ.get('UV_BIN') or shutil.which('uv') or str(Path.home() / '.local/bin/uv')
experts['args'] = [value.replace('${EXPERTS_DIR}', str(experts_dir)) for value in experts['args']]
experts['env']['PYTHONPATH'] = str(experts_dir / 'src')
# Preserve a locally stored Slack secret only for the same registered OAuth client.
slack = mcp['mcpServers']['slack']
old_slack = old_mcp.get('mcpServers', {}).get('slack', {})
old_oauth = old_slack.get('oauth', {})
if old_slack.get('url') == slack['url'] and old_oauth.get('clientId') == slack['oauth']['clientId']:
    if old_oauth.get('clientSecret'):
        slack['oauth']['clientSecret'] = old_oauth['clientSecret']
mcp = {**old_mcp, **mcp, 'mcpServers': {**old_mcp.get('mcpServers', {}), **mcp['mcpServers']}}
for relative in files:
    target = dest / relative
    if target.exists():
        saved = backup / relative
        saved.parent.mkdir(parents=True, exist_ok=True)
        backup.chmod(0o700)
        shutil.copy2(target, saved)
        saved.chmod(0o600)
    target.parent.mkdir(parents=True, exist_ok=True)
    if relative == Path('settings.json'):
        target.write_text(json.dumps(settings, indent=2) + '\n')
    elif relative == Path('mcp.json'):
        target.write_text(json.dumps(mcp, indent=2) + '\n')
        target.chmod(0o600)
    else:
        shutil.copy2(source / relative, target)
print(f'Pi setup restored to {dest}')
print('MCP: run pi mcp login for Slack, Linear, Sentry and PostHog on a new machine.')
if slack['oauth']['clientSecret'] == '${SLACK_CLIENT_SECRET}' and not os.environ.get('SLACK_CLIENT_SECRET'):
    print('Slack requires SLACK_CLIENT_SECRET in the environment when running Pi; no secret was copied.')
if not (experts_dir / 'pyproject.toml').exists():
    print(f'Experts requires its repository and dependencies at {experts_dir}; see pi/README.md.')
if backup.exists():
    print(f'Previous configuration backed up to {backup}')
PY
printf '\nExpected Pi version: %s\n' "$(< "$SOURCE/version")"
echo 'Restart Pi, then /login on a new machine. See pi/README.md for runtime and Ollama setup.'
