#!/bin/bash
set -euo pipefail

PLIST_LABEL="com.openclaw.cost-monitor"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

if [ -f "$PLIST_PATH" ]; then
  launchctl bootout "gui/${UID}" "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  echo "✅ Uninstalled ${PLIST_LABEL}"
else
  echo "ℹ️  ${PLIST_LABEL} is not installed."
fi
