---
name: clawleash
description: Set up phone approval for Claude Code — let the user approve/deny Claude Code permission prompts and see live agent status from their phone, so long autonomous runs don't stall while they're away. Use when the user asks to control Claude Code remotely, approve prompts from their phone, get mobile notifications when Claude needs permission, or set up clawleash.
---

# clawleash — phone approval for Claude Code

clawleash is a tiny self-hosted CLI: it installs Claude Code hooks, holds each
permission prompt open, and serves a token-gated phone page where the user taps
**Allow / Deny**. The phone reaches the Mac over Tailscale or the same Wi-Fi.

## Steps

1. **Start it** (installs hooks on first run, prints the phone URL):
   ```
   npx clawleash
   ```
   It runs in the foreground. Tell the user to keep it running (or run it under
   tmux / a process manager). Re-print the URL anytime with `npx clawleash url`.

2. **Read the printed phone URL(s).** Tailscale (`100.x…`) works on the go; LAN
   (`192.168.x…`) works on the same Wi-Fi only.

3. **Guide the phone:** open the URL in the phone browser → **Add to Home
   Screen**. When Claude Code next needs permission while the user is away, the
   prompt appears on the phone with Allow/Deny buttons.

4. **On the go needs Tailscale:** if there is no `100.x` URL, have the user
   install Tailscale on both the Mac and the phone, signed into the **same
   account / same tailnet**. (A fresh personal account does this automatically.)

5. **Optional push:** set an ntfy topic in `~/.config/clawleash/config.json`
   (`ntfyTopic`) and subscribe to it in the ntfy app for a buzz when a prompt
   needs them.

To remove: `npx clawleash uninstall` (strips clawleash hooks from
`~/.claude/settings.json`).

## Notes

- Off by default for outsiders: the page is token-gated (403 without `?k=`),
  hook ingress is loopback-only, headless sessions are not eligible, and a
  no-response prompt falls back to the terminal — an offline phone never wedges
  the session. Prefer Tailscale over exposing the port publicly.
