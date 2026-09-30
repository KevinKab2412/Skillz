#!/usr/bin/env bash
# Deploy the skill-router as an always-warm LaunchAgent.
#
# The runtime lives in ~/.skill-router (NOT ~/Documents): macOS TCC blocks
# background launchd agents from reading ~/Documents/~/Desktop/~/Downloads
# without manual Full Disk Access. This repo stays the source of truth; deploy
# copies src there, builds a venv, regenerates data from local transcripts, and
# (re)loads the LaunchAgent so the daemon starts at login and stays warm.
#
#   ./deploy.sh            # install / update + start
#   ./deploy.sh --stop     # unload the agent (stop auto-start)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME="$HOME/.skill-router"
LABEL="com.kevinkabeya.skillrouter"
RLABEL="com.kevinkabeya.skillrouter.refresh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RPLIST="$HOME/Library/LaunchAgents/$RLABEL.plist"
UID_="$(id -u)"

if [[ "${1:-}" == "--stop" ]]; then
  for L in "$PLIST" "$RPLIST"; do
    launchctl bootout "gui/$UID_" "$L" 2>/dev/null || launchctl unload "$L" 2>/dev/null || true
  done
  echo "stopped daemon + weekly refresh (plists left in ~/Library/LaunchAgents)"
  exit 0
fi

echo "==> syncing source to $RUNTIME"
mkdir -p "$RUNTIME"
cp -R "$REPO_DIR/src" "$RUNTIME/"
cp "$REPO_DIR/requirements.txt" "$REPO_DIR/README.md" "$RUNTIME/" 2>/dev/null || true
cp "$REPO_DIR/refresh.sh" "$RUNTIME/" && chmod +x "$RUNTIME/refresh.sh"

echo "==> venv + deps"
[[ -d "$RUNTIME/.venv" ]] || python3 -m venv "$RUNTIME/.venv"
"$RUNTIME/.venv/bin/pip" install -q --upgrade pip >/dev/null
"$RUNTIME/.venv/bin/pip" install -q -r "$RUNTIME/requirements.txt"

echo "==> building ground truth from ~/.claude transcripts"
"$RUNTIME/.venv/bin/python" "$RUNTIME/src/extract.py"

echo "==> writing LaunchAgent -> $PLIST"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$RUNTIME/.venv/bin/python</string>
        <string>$RUNTIME/src/routerd.py</string>
    </array>
    <key>WorkingDirectory</key><string>$RUNTIME</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>30</integer>
    <key>StandardOutPath</key><string>$RUNTIME/routerd.log</string>
    <key>StandardErrorPath</key><string>$RUNTIME/routerd.log</string>
</dict>
</plist>
PLISTEOF

echo "==> (re)loading agent"
launchctl bootout "gui/$UID_" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$UID_" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

echo "==> waiting for socket"
"$RUNTIME/.venv/bin/python" - "$RUNTIME/routerd.sock" <<'PY' || true
import os, sys, time
for _ in range(120):
    if os.path.exists(sys.argv[1]):
        break
    time.sleep(0.1)
PY
if [[ -S "$RUNTIME/routerd.sock" ]]; then
  echo "OK: daemon warm at $RUNTIME/routerd.sock"
  launchctl list | grep "$LABEL" || true
else
  echo "FAILED to come up; last log lines:"; tail -8 "$RUNTIME/routerd.log" 2>/dev/null || true
  exit 1
fi

echo "==> installing weekly refresh (Mon 09:00) -> $RPLIST"
cat > "$RPLIST" <<RPLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$RLABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$RUNTIME/refresh.sh</string>
    </array>
    <key>WorkingDirectory</key><string>$RUNTIME</string>
    <key>StartCalendarInterval</key>
    <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <key>StandardOutPath</key><string>$RUNTIME/refresh.log</string>
    <key>StandardErrorPath</key><string>$RUNTIME/refresh.log</string>
</dict>
</plist>
RPLISTEOF
launchctl bootout "gui/$UID_" "$RPLIST" 2>/dev/null || true
launchctl bootstrap "gui/$UID_" "$RPLIST" 2>/dev/null || launchctl load -w "$RPLIST"
echo "OK: weekly refresh scheduled ($(launchctl list | grep "$RLABEL" | awk '{print $3}'))"
