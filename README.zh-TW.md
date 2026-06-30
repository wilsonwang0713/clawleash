<p align="right"><a href="./README.md">English</a> · <strong>繁體中文</strong> · <a href="./README.ja.md">日本語</a></p>

# 🦀 clawleash — 用手機批准 Claude Code

[![npm](https://img.shields.io/npm/v/clawleash.svg)](https://www.npmjs.com/package/clawleash)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Tailscale ready](https://img.shields.io/badge/Tailscale-ready-7b61ff.svg)](#連線方式)

> **clawleash 是一個開源 CLI,讓你用手機批准或拒絕 Claude Code 的權限提問——這樣長時間的自動化任務,就不會在你離開座位時卡住停擺。** 自架、token 保護,透過 Tailscale 或同一個 Wi‑Fi 連到你的 Mac。沒有雲端中繼、不用帳號、不用訂閱。

```bash
npx clawleash
```

就這樣。用手機掃描印出來的網址,點 **Allow**(允許)或 **Deny**(拒絕),你的 agent 就能繼續跑。

---

## 痛點

你啟動一個大型重構、去倒杯咖啡,十分鐘後回來——結果 Claude Code 整段時間都閒著,**卡在等你批准跑 `mkdir`**。只要你一離開鍵盤,長時間自動化任務就會被單一一個提問卡死。

`clawleash` 把那顆 Allow/Deny 按鈕放進你口袋。

## 快速開始

```bash
# 在你跑 Claude Code 的那台機器上,任意終端機:
npx clawleash
```

第一次執行時它會:

1. 把 Claude Code hooks 裝進 `~/.claude/settings.json`(冪等、可移除)。
2. 啟動一個小型本機伺服器,並印出**手機網址**(Tailscale 優先,再來 LAN)。

用手機開那個網址 →「**加入主畫面**」→ 完成。下次你不在電腦前、Claude Code 要權限時,提問就會出現在手機上,附 **Allow / Deny** 按鈕。

```bash
npx clawleash url        # 再次印出手機網址
npx clawleash uninstall  # 移除 hooks
```

## 運作原理

```
Claude Code (CLI)
  │  PermissionRequest hook(http,最多阻塞 600 秒)  ─────────────┐
  │  SessionStart / PreToolUse / Stop …(狀態)       ──────────┐  │
  ▼                                                            ▼  ▼
                                  clawleash daemon(本機,0.0.0.0:4271)
                                    ├─ 把請求掛住,直到你回答
                                    ├─ token 保護的手機頁面(可安裝 PWA)
                                    └─ 選配 ntfy 推播
  手機 ◀──── Tailscale / 同 Wi-Fi ────┘   點 Allow / Deny
```

`PermissionRequest` hook 在 clawleash 把 HTTP 請求掛住時會**阻塞**。你手機上點的決定(`allow` / `deny`)會回傳給 Claude Code,然後它就放行或擋下該工具。如果逾時前沒人回答,就**退回正常的終端機提問**——所以手機離線也不會卡死你的 session。

## 連線方式

| 你人在哪 | 用什麼 | 設定 |
| --- | --- | --- |
| 同一個 Wi‑Fi(在家/辦公室) | LAN 網址(`192.168.x…`) | 免設定,馬上可用 |
| 在外面 | Tailscale 網址(`100.x…`) | 在 Mac **和**手機裝 [Tailscale](https://tailscale.com),同帳號、同 tailnet |

**推播通知(選配):** 設定一個 [ntfy](https://ntfy.sh) topic,並在 ntfy app 訂閱它,就能在提問需要你時立刻收到通知。

📖 **逐步教學:** 完整的 Tailscale 與 ntfy 操作(含同 tailnet 的雷)與疑難排解,見 **[docs/SETUP.md](docs/SETUP.md)**。

## clawleash 與其他方案比較

| | **clawleash** | 只有 ntfy 的 hook | Anthropic Remote Control | clawd-on-desk |
| --- | :---: | :---: | :---: | :---: |
| 手機批准/拒絕 | ✅ | ❌(只通知) | ✅ | ✅ |
| 手機看即時 agent 狀態 | ✅ | ❌ | 部分 | ✅ |
| 自架、無雲端中繼 | ✅ | ✅ | ❌ | ✅ |
| Tailscale / LAN(不公開曝露) | ✅ | n/a | ❌ | ✅ |
| 一行 `npx` 安裝 | ✅ | 手動 | n/a | ❌(桌面 app) |
| 無頭 / 免 GUI | ✅ | ✅ | ✅ | ❌ |
| 需要 Claude 訂閱/方案 | ❌ | ❌ | 視情況 | ❌ |

## 設定

設定檔在 `~/.config/clawleash/config.json`(或對應的 OS 路徑):

| 鍵 | 預設 | 意義 |
| --- | --- | --- |
| `token` | 隨機 | 手機網址裡的密鑰(`?k=…`) |
| `port` | `4271` | daemon 連接埠(`CLAWLEASH_PORT` 環境變數可覆蓋) |
| `approvals` | `true` | 把權限提問鏡射到手機 |
| `ntfyTopic` | `""` | ntfy 推播 topic(空 = 關閉) |

## 安全性與威脅模型

- **對外人預設關閉。** 每個面向手機的路由都被密鑰保護;沒有 `?k=<token>` 就回 `403`。
- **Hook 入口只收 loopback。** `/hook/*` 拒絕任何非來自 `127.0.0.1` 的請求。
- **你只能回答既有的提問。** 手機只能對 Claude Code 已經發出的提問點 Allow/Deny,**無法**注入任意指令。
- **無頭 session**(`claude -p`)不適用,而且**沒回應 → 退回**終端機提問。手機離線不會擋你。
- **留在你的 tailnet 內。** 優先用 Tailscale(私有網路),不要把連接埠公開曝露。

## 常見問題

### 我要怎麼用手機批准 Claude Code 的權限請求?
在跑 Claude Code 的機器上執行 `npx clawleash`,用手機開印出來的網址,提問出現時點 Allow/Deny。

### 我可以用手機遠端控制 Claude Code 嗎?
可以——clawleash 透過你自己的 Tailscale 網路或 LAN,把權限提問和即時 agent 狀態鏡射到手機網頁。

### 我需要 Claude 訂閱或 Anthropic 的 Remote Control 嗎?
不用。clawleash 是自架的,搭配你本機的 Claude Code CLI 運作;沒有東西在雲端跑。

### 用手機批准 Claude Code 權限安全嗎?
頁面有 token 保護、hook 入口只收 loopback,而且你只能對 Claude Code 已發出的提問點 Allow/Deny。請走 Tailscale 而非公開網際網路。

### 這跟 ntfy 通知有什麼不同?
ntfy 只能*告訴*你 Claude 需要你;clawleash 讓你*回答*——直接在手機點 Allow/Deny——不用走回座位。

### 手機離線會怎樣?
逾時後權限 hook 會退回 Claude Code 正常的終端機提問,所以你的 session 永遠不會卡住。

## 路線圖

- 上手精靈(單畫面本機設定 UI:安裝/連線/QR)。
- 選配**託管中繼**,任何網路都能零設定存取(freemium)。
- 支援 Claude Code 以外、與供應商無關的整合。

## Claude Code skill

一個輕量的 Claude Code skill([`skill/SKILL.md`](./skill/SKILL.md))包住這個 CLI,你只要叫 Claude *「幫我設定 Claude Code 的手機批准」*,它就會跑 `npx clawleash` 並帶你完成。

## 需求

- Node.js ≥ 18
- 有 hooks 的 Claude Code(近期版本預設就有)
- 在外存取:Mac 和手機都裝 Tailscale

## 貢獻

歡迎 Issue 與 PR。跑 `npm test` 執行單元測試。

## 授權與商標

程式碼:[Apache-2.0](./LICENSE)。**clawleash** 名稱/logo 不在程式碼授權範圍內——見 [TRADEMARK.md](./TRADEMARK.md)。clawleash 是給 Claude Code 用的獨立社群工具,**與 Anthropic 無關**;「Claude」與「Claude Code」是 Anthropic 的商標,此處僅作描述性使用。
