# 🦀 clawleash — approve Claude Code from your phone

[![npm](https://img.shields.io/npm/v/clawleash.svg)](https://www.npmjs.com/package/clawleash)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Tailscale ready](https://img.shields.io/badge/Tailscale-ready-7b61ff.svg)](#connectivity)

> **clawleash is an open-source CLI that lets you approve or deny Claude Code permission prompts from your phone — so long autonomous runs never stall while you're away from the desk.** Self-hosted and token-gated, it reaches your Mac over Tailscale or the same Wi‑Fi. No cloud relay, no account, no subscription.

```bash
npx clawleash
```

That's it. Scan the printed URL on your phone, tap **Allow** or **Deny**, and your agent keeps moving.

---

## The problem

You kick off a big refactor, grab a coffee, come back ten minutes later — and Claude Code has been sitting idle the whole time, **stuck waiting for permission to run `mkdir`**. Long autonomous runs stall on a single prompt the moment you step away from the keyboard.

`clawleash` puts that Allow/Deny button in your pocket.

## Quick start

```bash
# In any terminal on the machine where you run Claude Code:
npx clawleash
```

On first run it:

1. Installs Claude Code hooks into `~/.claude/settings.json` (idempotent, removable).
2. Starts a tiny local server and prints a **phone URL** (Tailscale first, then LAN).

Open that URL on your phone → **Add to Home Screen** → done. Next time Claude Code asks for permission while you're away, the prompt shows up on your phone with **Allow / Deny** buttons.

```bash
npx clawleash url        # print the phone URL(s) again
npx clawleash uninstall  # remove the hooks
```

## How it works

```
Claude Code (CLI)
  │  PermissionRequest hook (http, blocks up to 600s)   ─────────────┐
  │  SessionStart / PreToolUse / Stop … (status)        ──────────┐  │
  ▼                                                               ▼  ▼
                                    clawleash daemon (local, 0.0.0.0:4271)
                                      ├─ holds the request open until you answer
                                      ├─ token-gated phone page (installable PWA)
                                      └─ optional ntfy push
  phone ◀──── Tailscale / same Wi-Fi ────┘   tap Allow / Deny
```

The `PermissionRequest` hook **blocks** while clawleash holds the HTTP request open. Your phone tap returns the decision (`allow` / `deny`) to Claude Code, which then proceeds or blocks the tool. If nobody answers before the timeout, it **falls back to the normal terminal prompt** — so an offline phone never wedges your session.

## Connectivity

| Where you are | What to use | Setup |
| --- | --- | --- |
| Same Wi‑Fi (at home/office) | the LAN URL (`192.168.x…`) | none — works immediately |
| Out and about | the Tailscale URL (`100.x…`) | install [Tailscale](https://tailscale.com) on your Mac **and** phone, same account, same tailnet |

**Push notifications (optional):** set an [ntfy](https://ntfy.sh) topic and subscribe to it in the ntfy app to get pinged the moment a prompt needs you.

📖 **Step-by-step:** see **[docs/SETUP.md](docs/SETUP.md)** for the full Tailscale and ntfy walkthrough (with the same-tailnet gotcha) and troubleshooting.

## clawleash vs the alternatives

| | **clawleash** | ntfy-only hook | Anthropic Remote Control | clawd-on-desk |
| --- | :---: | :---: | :---: | :---: |
| Approve/Deny from phone | ✅ | ❌ (notify only) | ✅ | ✅ |
| Live agent status on phone | ✅ | ❌ | partial | ✅ |
| Self-hosted, no cloud relay | ✅ | ✅ | ❌ | ✅ |
| Tailscale / LAN (no public exposure) | ✅ | n/a | ❌ | ✅ |
| One-command `npx` install | ✅ | manual | n/a | ❌ (desktop app) |
| Headless / GUI-free | ✅ | ✅ | ✅ | ❌ |
| Needs a Claude subscription/tier | ❌ | ❌ | varies | ❌ |

## Configuration

Config lives in `~/.config/clawleash/config.json` (or the OS equivalent):

| Key | Default | Meaning |
| --- | --- | --- |
| `token` | random | secret in the phone URL (`?k=…`) |
| `port` | `4271` | daemon port (`CLAWLEASH_PORT` env overrides) |
| `approvals` | `true` | mirror permission prompts to the phone |
| `ntfyTopic` | `""` | ntfy topic for push (empty = off) |

## Security & threat model

- **Off by default for outsiders.** Every phone-facing route is gated by a secret token; without `?k=<token>` you get a `403`.
- **Hook ingress is loopback-only.** `/hook/*` rejects any request that isn't from `127.0.0.1`.
- **You only resolve existing prompts.** The phone can tap Allow/Deny on a prompt Claude Code already raised — it cannot inject arbitrary commands.
- **Headless sessions** (`claude -p`) are not eligible, and **no response → fall back** to the terminal prompt. An offline phone never blocks you.
- **Keep it on your tailnet.** Prefer Tailscale (private mesh) over exposing the port publicly.

## FAQ

### How do I approve Claude Code permission requests from my phone?
Run `npx clawleash` on the machine running Claude Code, open the printed URL on your phone, and tap Allow/Deny when a prompt appears.

### Can I control Claude Code remotely from my phone?
Yes — clawleash mirrors permission prompts and live agent status to a phone web page over your own Tailscale network or LAN.

### Do I need a Claude subscription or Anthropic's Remote Control?
No. clawleash is self-hosted and works with your local Claude Code CLI; nothing runs in the cloud.

### Is it safe to approve Claude Code permissions from my phone?
The page is token-gated, hook ingress is loopback-only, and you can only Allow/Deny prompts Claude Code already raised. Run it over Tailscale rather than the public internet.

### How is this different from ntfy notifications?
ntfy can *tell* you Claude needs you; clawleash lets you *answer* — Allow/Deny right from the phone — without walking back to the desk.

### What happens if my phone is offline?
After a timeout the permission hook falls back to Claude Code's normal terminal prompt, so your session never gets stuck.

## Roadmap

- Onboarding wizard (one-screen local settings UI: install/connection/QR).
- Optional **hosted relay** for zero-config access from any network (freemium).
- Provider-agnostic support beyond Claude Code.

## Claude Code skill

A thin Claude Code skill ([`skill/SKILL.md`](./skill/SKILL.md)) wraps the CLI so you can just ask Claude *"set up phone approval for Claude Code"* and it runs `npx clawleash` and walks you through it.

## Requirements

- Node.js ≥ 18
- Claude Code with hooks (default in recent versions)
- For on-the-go access: Tailscale on your Mac and phone

## Contributing

Issues and PRs welcome. Run `npm test` for the unit tests.

## License & trademark

Code: [Apache-2.0](./LICENSE). The **clawleash** name/logo are not covered by the
code license — see [TRADEMARK.md](./TRADEMARK.md). clawleash is an independent
community companion for Claude Code and is **not affiliated with Anthropic**;
"Claude" and "Claude Code" are trademarks of Anthropic, used here descriptively.
