# clawleash desktop

A small **menubar companion** for [clawleash](../). Two modes, one daemon:

- **At your computer** — a clean white, always-on-top **Allow / Deny toast** slides
  into the bottom-right corner whenever Claude Code asks for a permission. It
  floats over the Dock, every Space, and **even other apps' full-screen windows**.
  Destructive operations (`rm -rf`, `sudo`, `--force`, `reset --hard`, `DROP` …)
  are flagged red.
- **Heading out** — the tray menu's **Show QR code** (scan with your phone) or
  **Copy phone link** (Tailscale-first URL) hands the session off to the phone, so
  you can keep approving remotely via the existing PWA.

It is a thin **client of the local clawleash daemon** (`http://127.0.0.1:4271`): it
reads your token from clawleash's `config.json`, polls `GET /api/status` for pending
requests, and answers via `POST /api/permission`. The daemon owns all the logic;
clawleash core needs no changes to use this. Built with [Tauri](https://tauri.app)
(no Electron) so the app stays small.

## Requirements

- A running clawleash daemon (`npx clawleash` in the repo root).
- Rust toolchain (`rustup`) — Tauri compiles a native binary.
- macOS: Xcode Command Line Tools. (Linux/Windows build targets are possible but
  only macOS is exercised today.)

## Install

```bash
cd desktop
./scripts/install.sh   # builds + copies clawleash.app to /Applications
open -a clawleash      # launch (look for the crab 🦀 in the menu bar)
```

The build is **unsigned** (a personal/open-source build), so the installer clears
the Gatekeeper quarantine flag for you. To launch on login: **System Settings →
General → Login Items → +** and add `/Applications/clawleash.app`.

## Develop

```bash
npm install     # fetches the Tauri CLI
npm run dev     # compile + launch with hot reload
npm run build   # bundle target/release/bundle/macos/clawleash.app
```

## Test the toast without Claude Code

With the daemon running, inject a fake permission request (it blocks until you
answer on the toast or phone):

```bash
./scripts/fake-permission.sh                       # Bash: rm -rf build/ (flagged red)
./scripts/fake-permission.sh Bash "npm publish"    # custom command
./scripts/fake-permission.sh Write src/app.ts      # a Write request
```

## How it works (macOS specifics)

- **Float over everything, incl. other apps' full-screen Spaces** — the public
  `NSWindow` level + collection-behavior aren't enough for *other* apps'
  full-screen. We use the private **SkyLight** framework (loaded at runtime via
  `libloading`, since it's not on disk on modern macOS) to create one
  absolute-level system Space and move the toast window into it — mirroring
  clawd-on-desk's approach.
- **Window level is re-asserted every poll tick** because Tauri otherwise resets
  it back below the Dock after window events.
- **The poller lives in Rust, not JS**, so the toast still appears when the hidden
  webview's timers are suspended by macOS.
- **Clean white card** — it fills the whole rounded, transparent window (no
  margin) so there's no backing panel or vibrancy tint.
- SkyLight is a **private API**: undocumented and may break on future macOS
  releases (the code degrades gracefully if it fails to load).

## Notes

- Not published to npm — `npx clawleash` stays tiny; build this separately.
