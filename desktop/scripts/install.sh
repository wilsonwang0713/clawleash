#!/usr/bin/env bash
# Build the clawleash desktop app and install it into /Applications.
#
#   ./scripts/install.sh
#
# Requirements: Rust (rustup) + Node, and Xcode Command Line Tools (macOS).
set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DESKTOP_DIR"

echo "→ Installing dependencies…"
npm install --silent

echo "→ Building release app (this compiles a native binary; first run is slow)…"
npm run build

APP_SRC="$DESKTOP_DIR/src-tauri/target/release/bundle/macos/clawleash.app"
if [ ! -d "$APP_SRC" ]; then
  echo "✗ Build did not produce $APP_SRC" >&2
  exit 1
fi

DEST="/Applications/clawleash.app"
echo "→ Installing to $DEST"
rm -rf "$DEST"
cp -R "$APP_SRC" "$DEST"

# This is an unsigned local build; clear the quarantine flag so Gatekeeper
# doesn't block the first launch.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

echo
echo "✔ Installed clawleash.app to /Applications."
echo
echo "  Start it:           open -a clawleash"
echo "  It needs the daemon: npx clawleash   (run in the clawleash repo)"
echo "  Auto-start on login: System Settings → General → Login Items → +"
echo "                       (add /Applications/clawleash.app)"
