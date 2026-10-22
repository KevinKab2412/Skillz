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
from pathlib import Path
import shutil
import sys

source, dest = map(Path, sys.argv[1:])
backup = dest / 'backups' / ('skillz-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
files = [Path('settings.json'), Path('models.json')]
for directory in ('prompts', 'templates'):
    files.extend(p.relative_to(source) for p in (source / directory).glob('*.md'))

# Validate before replacing any preferences. Keep machine identity and credentials local.
settings_path = dest / 'settings.json'
old_settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
settings = json.loads((source / 'settings.json').read_text())
for key in ('deviceId', 'lastChangelogVersion'):
    if key in old_settings:
        settings[key] = old_settings[key]
json.loads((source / 'models.json').read_text())
for relative in files:
    target = dest / relative
    if target.exists():
        saved = backup / relative
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved)
    target.parent.mkdir(parents=True, exist_ok=True)
    if relative == Path('settings.json'):
        target.write_text(json.dumps(settings, indent=2) + '\n')
    else:
        shutil.copy2(source / relative, target)
print(f'Pi setup restored to {dest}')
if backup.exists():
    print(f'Previous configuration backed up to {backup}')
PY
printf '\nExpected Pi version: %s\n' "$(< "$SOURCE/version")"
echo 'Restart Pi, then /login on a new machine. See pi/README.md for runtime and Ollama setup.'
