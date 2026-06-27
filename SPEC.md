# clawleash — product spec

## One-liner
Approve or deny Claude Code permission prompts from your phone, so long
autonomous runs never stall while you're away from the desk.

## Who & why (ICP)
Claude Code CLI power users who run long / autonomous tasks and step away from
the desk. Pain: an agent silently stalls on a single permission prompt ("waiting
to run `mkdir`") for as long as you're gone. Existing options either only
*notify* (ntfy) or require the cloud (Anthropic Remote Control) or a desktop GUI
(clawd-on-desk). clawleash is the lightweight, headless, **answer-from-phone**
option.

## North-star metric
**Time-to-first-approval** — from `npx clawleash` to the first Allow tapped on a
phone. Target < 3 minutes.

## Onboarding (fewest steps)
1. `npx clawleash` — installs hooks, prints the phone URL.
2. Open the URL on the phone, Add to Home Screen.
3. Tap Allow/Deny when a prompt arrives.

## Architecture
- **Hooks** (`hooks-install.js`): idempotently write http hooks into
  `~/.claude/settings.json` — one blocking `PermissionRequest` hook plus status
  events. Tagged `?clawleash=1` for clean removal.
- **Daemon** (`daemon.js`): one HTTP server on `0.0.0.0`.
  - `/hook/permission` (loopback) holds the request, parks a resolver, settles on
    phone tap or timeout. `/hook/event` (loopback) feeds live status.
  - `/`, `/api/status`, `/api/permission` are token-gated for the phone.
  - `/manifest.webmanifest` is public (PWA).
- **permissions.js**: pending registry + Allow/Deny resolution.
- **status.js**: in-memory per-session + subagent state from hook events.
- **mobile.js**: installable PWA page (pending cards + session bubbles).
- **netinfo.js / notify.js / config.js**: URL discovery, ntfy push, token/config.

## Connectivity
Self-hosted only in v1: same Wi-Fi (LAN) for a quick test, Tailscale for
on-the-go. No cloud relay.

## Security
Off by default; token-gated (403 without `?k=`); hook ingress loopback-only;
resolve-only (no arbitrary input); headless auto-deny; timeout → terminal
fallback; prefer Tailscale over public exposure.

## Distribution
npm package run via `npx clawleash`, plus a thin Claude Code skill
(`skill/SKILL.md`). License Apache-2.0; name protected separately
(`TRADEMARK.md`).

## Roadmap
Onboarding wizard (local settings UI) · optional hosted relay (freemium,
zero-config anywhere) · provider-agnostic beyond Claude Code.
