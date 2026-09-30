#!/usr/bin/env bash
# Rebuild the router's ground truth from the latest transcripts, then restart
# the daemon so it reloads with the new history. Run weekly by the
# com.kevinkabeya.skillrouter.refresh LaunchAgent; safe to run by hand too.
set -euo pipefail
RUNTIME="$HOME/.skill-router"
LABEL="com.kevinkabeya.skillrouter"
UID_="$(id -u)"

echo "[refresh $(date '+%Y-%m-%d %H:%M')] rebuilding data from ~/.claude transcripts"
"$RUNTIME/.venv/bin/python" "$RUNTIME/src/extract.py"

echo "[refresh $(date '+%Y-%m-%d %H:%M')] restarting daemon to load new data"
launchctl kickstart -k "gui/$UID_/$LABEL" 2>/dev/null || true
echo "[refresh $(date '+%Y-%m-%d %H:%M')] done"
