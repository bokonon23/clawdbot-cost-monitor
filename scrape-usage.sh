#!/bin/bash
# Scrapes Claude Code /usage via expect-style interaction
# Writes parsed JSON to data/plan-usage.json

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
USAGE_FILE="$DATA_DIR/plan-usage.json"
RAW_FILE="$DATA_DIR/raw-usage.txt"

mkdir -p "$DATA_DIR"

# Use expect to drive Claude Code interactively
if ! command -v expect &>/dev/null; then
  echo "ERROR: expect not found. Install with: brew install expect"
  exit 1
fi

# Run expect script to get /usage output
expect -c '
  set timeout 45
  log_user 0
  spawn claude
  
  # Handle trust prompt if it appears
  expect {
    "trust this folder" {
      send "\r"
      exp_continue
    }
    "Welcome back" {
      # Ready
    }
    timeout {
      puts "ERROR: Timeout waiting for Claude Code"
      exit 1
    }
  }
  
  sleep 2
  send "/usage\r"
  
  # Wait for usage data to load
  expect {
    "Esc to cancel" {
      # Got the data
    }
    timeout {
      puts "ERROR: Timeout waiting for /usage"
      exit 1
    }
  }
  
  # Capture the buffer
  sleep 2
  set output $expect_out(buffer)
  puts $output
  
  # Exit cleanly
  send "\x1b"
  sleep 1
  send "/exit\r"
  
  expect {
    "Bye" { }
    eof { }
    timeout { }
  }
  
  exit 0
' 2>/dev/null | tee "$RAW_FILE"

# Parse the raw output
SESSION_PCT=$(grep -oE '[0-9]+%\s*used' "$RAW_FILE" | head -1 | grep -oE '[0-9]+')
WEEKLY_ALL_PCT=$(grep -oE '[0-9]+%\s*used' "$RAW_FILE" | sed -n '2p' | grep -oE '[0-9]+')
WEEKLY_SONNET_PCT=$(grep -oE '[0-9]+%\s*used' "$RAW_FILE" | sed -n '3p' | grep -oE '[0-9]+')

SESSION_RESETS=$(grep -A1 "Current session" "$RAW_FILE" | grep -oE 'Rese?ts?\s+.*' | sed 's/Rese\?ts\?\s*//' | head -1)
WEEKLY_ALL_RESETS=$(grep -A3 "all models" "$RAW_FILE" | grep -oE 'Resets?\s+.*' | sed 's/Resets\?\s*//' | head -1)
WEEKLY_SONNET_RESETS=$(grep -A3 "Sonnet only" "$RAW_FILE" | grep -oE 'Resets?\s+.*' | sed 's/Resets\?\s*//' | head -1)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build JSON
NEW_ENTRY=$(cat <<EOF
{
  "timestamp": "$TIMESTAMP",
  "session": $([ -n "$SESSION_PCT" ] && echo "{\"percentUsed\": $SESSION_PCT, \"resets\": \"$SESSION_RESETS\"}" || echo "null"),
  "weeklyAll": $([ -n "$WEEKLY_ALL_PCT" ] && echo "{\"percentUsed\": $WEEKLY_ALL_PCT, \"resets\": \"$WEEKLY_ALL_RESETS\"}" || echo "null"),
  "weeklySonnet": $([ -n "$WEEKLY_SONNET_PCT" ] && echo "{\"percentUsed\": $WEEKLY_SONNET_PCT, \"resets\": \"$WEEKLY_SONNET_RESETS\"}" || echo "null")
}
EOF
)

echo "$NEW_ENTRY"

# Append to history file
if [ -f "$USAGE_FILE" ]; then
  # Use node for safe JSON array append
  node -e "
    const fs = require('fs');
    let history = JSON.parse(fs.readFileSync('$USAGE_FILE', 'utf8'));
    history.push($NEW_ENTRY);
    // Keep last 90 days
    const cutoff = Date.now() - (90*24*60*60*1000);
    history = history.filter(h => new Date(h.timestamp).getTime() > cutoff);
    fs.writeFileSync('$USAGE_FILE', JSON.stringify(history, null, 2));
  "
else
  echo "[$NEW_ENTRY]" > "$USAGE_FILE"
fi

echo "Done. Usage data saved to $USAGE_FILE"
