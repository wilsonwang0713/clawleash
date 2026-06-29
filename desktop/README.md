# clawleash desktop

A small **menubar companion** for [clawleash](../). Two modes, one daemon:

- **At your computer** — a borderless, always-on-top **Allow / Deny toast** slides
  into the bottom-right corner whenever Claude Code asks for a permission.
- **Heading out** — the tray menu's **Copy phone link** puts your (Tailscale-first)
  phone URL on the clipboard, so you can paste it to your phone and keep approving
  remotely via the existing PWA.

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

## Develop

```bash
cd desktop
npm install          # fetches the Tauri CLI
npm run dev          # compile + launch (look for the crab in the menubar)
```

## Build a .app

```bash
npm run build        # bundles target/release/bundle/macos/clawleash.app
```

## Test the toast without Claude Code

With the daemon running, inject a fake permission request (it blocks until you
answer on the toast or phone):

```bash
./scripts/fake-permission.sh                    # Bash: rm -rf build/
./scripts/fake-permission.sh Bash "npm publish" # custom command
```

## Notes

- The window is transparent + uses native macOS vibrancy (`macOSPrivateApi`).
- The poller lives in Rust, not JS, so the toast still appears when the hidden
  webview's timers are suspended by macOS.
- Not published to npm — `npx clawleash` stays tiny; build this separately.
