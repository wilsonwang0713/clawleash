#!/usr/bin/env bash
# Inject a fake permission request into the running clawleash daemon so you can
# see the desktop toast (or the phone) pop up and test Allow/Deny end-to-end.
# Blocks until you answer (or the daemon's ~9-min hook timeout).
#
#   ./fake-permission.sh                       # Bash: rm -rf build/
#   ./fake-permission.sh Bash "npm publish"    # custom Bash command
#   ./fake-permission.sh Write src/app.ts      # a Write request
#   ./fake-permission.sh Bash "npm test" sug   # include permission_suggestions
#   ./fake-permission.sh ask                   # AskUserQuestion: renders option buttons
set -euo pipefail
PORT="${CLAWLEASH_PORT:-4271}"
TOOL="${1:-Bash}"
ARG="${2:-rm -rf build/}"
SUG="${3:-}"

# AskUserQuestion: a single-select "choose a direction" prompt so you can see the
# option buttons render (and tap one to answer remotely).
if [ "$TOOL" = "ask" ] || [ "$TOOL" = "AskUserQuestion" ]; then
  echo "→ injecting AskUserQuestion (tap an option on the toast or phone)…"
  RESP="$(curl -s -X POST "http://127.0.0.1:$PORT/hook/permission" \
    -H 'Content-Type: application/json' \
    -d '{"tool_name":"AskUserQuestion","session_id":"faketest","tool_input":{"questions":[{"header":"Approach","question":"Which approach should we take?","multiSelect":false,"options":[{"label":"MVP first","description":"Ship the smallest thing."},{"label":"Full build","description":"Do it all up front."},{"label":"Prototype","description":"Validate feasibility first."}]}]}}' || true)"
  if [ -z "$RESP" ]; then echo "← no decision (timed out, or approvals are off)"; else echo "← daemon replied: $RESP"; fi
  exit 0
fi

if [ "$TOOL" = "Bash" ]; then
  INPUT="{\"command\":\"$ARG\"}"
else
  INPUT="{\"file_path\":\"$ARG\"}"
fi

# Optional: attach sample permission_suggestions to exercise the multi-option UI.
SUGGESTIONS=""
if [ -n "$SUG" ]; then
  SUGGESTIONS=",\"permission_suggestions\":[{\"type\":\"addRules\",\"behavior\":\"allow\",\"destination\":\"localSettings\",\"rules\":[{\"toolName\":\"$TOOL\",\"ruleContent\":\"$ARG\"}]},{\"type\":\"addRules\",\"behavior\":\"allow\",\"destination\":\"localSettings\",\"rules\":[{\"toolName\":\"$TOOL\"}]}]"
fi

echo "→ injecting $TOOL permission (Allow/Deny on the toast or phone)…"
RESP="$(curl -s -X POST "http://127.0.0.1:$PORT/hook/permission" \
  -H 'Content-Type: application/json' \
  -d "{\"tool_name\":\"$TOOL\",\"tool_input\":$INPUT,\"session_id\":\"faketest\"$SUGGESTIONS}" || true)"

if [ -z "$RESP" ]; then
  echo "← no decision (timed out, or approvals are off)"
else
  echo "← daemon replied: $RESP"
fi
