#!/usr/bin/env bash
# Inject a fake permission request into the running clawleash daemon so you can
# see the desktop toast (or the phone) pop up and test Allow/Deny end-to-end.
# Blocks until you answer (or the daemon's ~9-min hook timeout).
#
#   ./fake-permission.sh                       # Bash: rm -rf build/
#   ./fake-permission.sh Bash "npm publish"    # custom Bash command
#   ./fake-permission.sh Write src/app.ts      # a Write request
set -euo pipefail
PORT="${CLAWLEASH_PORT:-4271}"
TOOL="${1:-Bash}"
ARG="${2:-rm -rf build/}"

if [ "$TOOL" = "Bash" ]; then
  INPUT="{\"command\":\"$ARG\"}"
else
  INPUT="{\"file_path\":\"$ARG\"}"
fi

echo "→ injecting $TOOL permission (Allow/Deny on the toast or phone)…"
RESP="$(curl -s -X POST "http://127.0.0.1:$PORT/hook/permission" \
  -H 'Content-Type: application/json' \
  -d "{\"tool_name\":\"$TOOL\",\"tool_input\":$INPUT,\"session_id\":\"faketest\"}" || true)"

if [ -z "$RESP" ]; then
  echo "← no decision (timed out, or approvals are off)"
else
  echo "← daemon replied: $RESP"
fi
