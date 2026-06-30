# Setup guide

A step-by-step walkthrough for getting clawleash on your phone — same Wi-Fi
(quickest), Tailscale (anywhere), and ntfy push notifications.

## 1. Install & run

On the machine where you run Claude Code:

```bash
npx clawleash
```

On first run this installs the Claude Code hooks and prints your **phone URL(s)**
(Tailscale first, then LAN). Keep the process running (e.g. in tmux). Re-print
the URLs any time with `npx clawleash url`.

## 2. Open it on your phone

You reach the page two ways. Pick based on where you are.

### Option A — same Wi‑Fi (quickest, no VPN)

While your phone and Mac are on the **same Wi‑Fi**, just open the **LAN URL**
(the `192.168.x…` / `10.x…` one) in your phone browser:

```
http://192.168.x.x:4271/?k=YOUR_TOKEN
```

Works only on that network. To use it **on the go**, set up Tailscale (Option B).

### Option B — anywhere, via Tailscale

[Tailscale](https://tailscale.com) is a free, zero-config private network
(WireGuard). It gives every device a stable `100.x` IP reachable from anywhere.
Free for personal use.

1. **Sign up** at [tailscale.com](https://tailscale.com) — Google / GitHub /
   email / Apple. **Remember which identity you used.**
2. **Install on the Mac** (`brew install --cask tailscale`, or the website) and
   log in with that identity.
3. **Install Tailscale on the phone** (App Store / Google Play) and log in with
   the **same identity**.
4. Confirm both show **Connected** and appear in each other's device list.
5. Open the **Tailscale URL** (`100.x…`) on the phone, then **Add to Home
   Screen** so it launches full-screen like an app.

> **Gotcha — same tailnet:** one identity (especially a GitHub/Google account
> that belongs to an organization) can be a member of **several tailnets**
> (your personal one + each org). If your Mac and phone end up on **different**
> tailnets they can't see each other. Make both use the **same tailnet** — a
> fresh personal account does this automatically; otherwise switch tailnets via
> the Tailscale app's account switcher. Run `npx clawleash url` to get the
> current `100.x` URL.

## 3. Push notifications (optional) — ntfy

Get a push the moment a permission prompt needs you, via the free, open-source
[ntfy](https://ntfy.sh).

1. **Pick a topic** and set it in clawleash's config (Linux:
   `~/.config/clawleash/config.json`, macOS:
   `~/Library/Application Support/clawleash/config.json`):
   ```json
   { "ntfyTopic": "your-unique-topic" }
   ```
   Use **letters, numbers, `-`, `_` only** (no spaces or punctuation), and make
   it **hard to guess** — on the public `ntfy.sh` a topic is the *only* secret,
   so anyone who learns it can read your prompts (and spam you). Restart
   clawleash after editing.
2. **Install the ntfy app** on your phone (App Store / Google Play — search
   `ntfy`).
3. Open it and **allow notifications** when prompted.
4. Tap **+ (Subscribe to topic)** → **Topic** = `your-unique-topic` → leave
   **Server** as the default **`ntfy.sh`** → **Subscribe**.

You'll now get a banner whenever a prompt is waiting for you.

### Hardening (optional) — access token / self-hosted server

A topic on the public `ntfy.sh` is protected only by being hard to guess. To make
the channel **access-controlled** instead, add an ntfy **access token** (and,
if you run your own ntfy, a custom server):

```json
{
  "ntfyTopic": "your-unique-topic",
  "ntfyToken": "tk_xxxxxxxxxxxxxxxxxxxx",
  "ntfyServer": "ntfy.sh"
}
```

- `ntfyToken` — sent as `Authorization: Bearer <token>`. Create one in the ntfy
  app/web (**Account → Access tokens**) or via `ntfy token add`. On a server with
  access control, reading and publishing the topic then require the token.
- `ntfyServer` — hostname of a self-hosted ntfy (defaults to `ntfy.sh`). A scheme
  and path are accepted and trimmed (`https://ntfy.example.com/` → `ntfy.example.com`).
- Subscribe on the phone with the **same token** (the ntfy app stores it per
  server under **Settings → Manage users / Default server**). Restart clawleash
  after editing. `npx clawleash url`-style status shows `(auth)` next to the topic
  when a token is set.

## 4. Push notifications (optional) — Bark (recommended on iPhone)

On iOS, ntfy push can be unreliable (messages arrive in the app, but no banner).
[Bark](https://bark.day.app) is a dedicated iOS push app that's far more reliable.

1. **Install Bark** from the App Store and **allow notifications**.
2. Bark's home screen shows your personal URL — copy the **device key** from it
   (`https://api.day.app/<DEVICE_KEY>/`).
3. Set it in clawleash's config:
   ```json
   { "barkKey": "<DEVICE_KEY>" }
   ```
   Restart clawleash. Notifications show the clawleash crab icon.
4. (Optional) `barkServer` for a self-hosted Bark (default `api.day.app`), and
   `barkIcon` for a custom **public** icon URL (Bark's server fetches it; iOS 15+).

You can enable ntfy and Bark at the same time — both fire when a prompt is waiting.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Phone page shows **forbidden** | The URL is missing `?k=TOKEN`, or your Home Screen icon is stale — open the full URL fresh in the browser and re-add to Home Screen. |
| Phone can't reach the Mac **on the go** | Mac and phone aren't on the **same tailnet** (see the Tailscale gotcha). Run `npx clawleash url` for the current `100.x` URL. |
| **ntfy push never arrives** | The topic must be URL-safe (`-_A-Za-z0-9`); make sure the app is subscribed to the **exact same topic** on server `ntfy.sh`; check your OS notification permission for ntfy. |
| Same Wi‑Fi works, off-network doesn't | That's expected for the LAN URL — use Tailscale for anywhere access. |
| Agent isn't pausing for approval | Make sure clawleash is running and hooks are installed (`npx clawleash`). Headless `claude -p` sessions auto-deny by design — use an interactive `claude` session. |
| Want to remove it | `npx clawleash uninstall` strips the hooks from `~/.claude/settings.json`. |
