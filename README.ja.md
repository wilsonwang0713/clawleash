<p align="right"><a href="./README.md">English</a> · <a href="./README.zh-TW.md">繁體中文</a> · <strong>日本語</strong></p>

# 🦀 clawleash — Claude Code をスマホから承認

[![npm](https://img.shields.io/npm/v/clawleash.svg)](https://www.npmjs.com/package/clawleash)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Tailscale ready](https://img.shields.io/badge/Tailscale-ready-7b61ff.svg)](#接続方法)

> **clawleash は、Claude Code の権限プロンプトをスマホから許可・拒否できるオープンソース CLI です。これにより、デスクを離れている間も長時間の自律実行が止まりません。** セルフホストかつトークンで保護され、Tailscale または同じ Wi‑Fi 経由で Mac に接続します。クラウド中継なし、アカウント不要、サブスク不要。

```bash
npx clawleash
```

これだけ。表示された URL をスマホで読み取り、**Allow**(許可)か **Deny**(拒否)をタップすれば、エージェントは動き続けます。

---

## 課題

大きなリファクタリングを開始してコーヒーを取りに行き、10 分後に戻ると——Claude Code はずっとアイドル状態で、**`mkdir` の実行許可を待ったまま固まっていた**。キーボードを離れた瞬間、長時間の自律実行はたった 1 つのプロンプトで止まってしまいます。

`clawleash` は、その Allow/Deny ボタンをあなたのポケットに入れます。

## クイックスタート

```bash
# Claude Code を実行しているマシンの任意のターミナルで:
npx clawleash
```

初回実行時には:

1. Claude Code のフックを `~/.claude/settings.json` に追加します(冪等・削除可能)。
2. 小さなローカルサーバーを起動し、**スマホ用 URL** を表示します(Tailscale を優先、次に LAN)。

その URL をスマホで開き →「**ホーム画面に追加**」→ 完了。次にデスクを離れている間に Claude Code が権限を求めると、プロンプトが **Allow / Deny** ボタン付きでスマホに表示されます。

```bash
npx clawleash url        # スマホ用 URL を再表示
npx clawleash uninstall  # フックを削除
```

## 仕組み

```
Claude Code (CLI)
  │  PermissionRequest フック(http、最大 600 秒ブロック)  ─────────────┐
  │  SessionStart / PreToolUse / Stop …(状態)              ──────────┐  │
  ▼                                                                  ▼  ▼
                                    clawleash デーモン(ローカル、0.0.0.0:4271)
                                      ├─ 回答するまでリクエストを保持
                                      ├─ トークン保護のスマホページ(インストール可能な PWA)
                                      └─ 任意の ntfy プッシュ
  スマホ ◀──── Tailscale / 同じ Wi-Fi ────┘   Allow / Deny をタップ
```

`PermissionRequest` フックは、clawleash が HTTP リクエストを保持している間**ブロック**します。スマホでのタップが決定(`allow` / `deny`)を Claude Code に返し、ツールを実行またはブロックします。タイムアウトまでに誰も応答しなければ、**通常のターミナルプロンプトにフォールバック**します。スマホがオフラインでもセッションが詰まることはありません。

## 接続方法

| 場所 | 使うもの | 設定 |
| --- | --- | --- |
| 同じ Wi‑Fi(自宅・オフィス) | LAN の URL(`192.168.x…`) | 不要・すぐ使える |
| 外出先 | Tailscale の URL(`100.x…`) | Mac **と**スマホに [Tailscale](https://tailscale.com) を入れ、同一アカウント・同一 tailnet |

**プッシュ通知(任意):** [ntfy](https://ntfy.sh) のトピックを設定し、ntfy アプリで購読すると、プロンプトが必要になった瞬間に通知が届きます。

📖 **手順詳細:** Tailscale と ntfy の完全な手順(同一 tailnet の落とし穴あり)とトラブルシューティングは **[docs/SETUP.md](docs/SETUP.md)** を参照。

## clawleash と他の選択肢の比較

| | **clawleash** | ntfy だけのフック | Anthropic Remote Control | clawd-on-desk |
| --- | :---: | :---: | :---: | :---: |
| スマホで許可/拒否 | ✅ | ❌(通知のみ) | ✅ | ✅ |
| スマホでエージェントの状態を確認 | ✅ | ❌ | 一部 | ✅ |
| セルフホスト・クラウド中継なし | ✅ | ✅ | ❌ | ✅ |
| Tailscale / LAN(外部公開なし) | ✅ | n/a | ❌ | ✅ |
| ワンコマンド `npx` インストール | ✅ | 手動 | n/a | ❌(デスクトップアプリ) |
| ヘッドレス / GUI 不要 | ✅ | ✅ | ✅ | ❌ |
| Claude のサブスク/プランが必要 | ❌ | ❌ | 場合による | ❌ |

## 設定

設定は `~/.config/clawleash/config.json`(または OS 相当のパス)にあります:

| キー | 既定値 | 意味 |
| --- | --- | --- |
| `token` | ランダム | スマホ URL 内のシークレット(`?k=…`) |
| `port` | `4271` | デーモンのポート(`CLAWLEASH_PORT` 環境変数で上書き可) |
| `approvals` | `true` | 権限プロンプトをスマホへミラー |
| `ntfyTopic` | `""` | プッシュ用 ntfy トピック(空 = 無効) |

## セキュリティと脅威モデル

- **外部に対しては既定で無効。** スマホ向けの各ルートはシークレットトークンで保護され、`?k=<token>` がなければ `403` を返します。
- **フックの入口は loopback のみ。** `/hook/*` は `127.0.0.1` 以外からのリクエストを拒否します。
- **既存のプロンプトに答えるだけ。** スマホは Claude Code がすでに出したプロンプトに Allow/Deny できるだけで、任意のコマンドを注入することは**できません**。
- **ヘッドレスセッション**(`claude -p`)は対象外で、**応答なし → フォールバック**します。オフラインのスマホがブロックすることはありません。
- **tailnet 内に留める。** ポートを公開するより Tailscale(プライベートメッシュ)を推奨します。

## FAQ

### スマホから Claude Code の権限リクエストを承認するには?
Claude Code を実行しているマシンで `npx clawleash` を実行し、表示された URL をスマホで開いて、プロンプトが出たら Allow/Deny をタップします。

### スマホから Claude Code を遠隔操作できますか?
はい——clawleash は権限プロンプトとエージェントの状態を、あなた自身の Tailscale ネットワークまたは LAN 経由でスマホの Web ページにミラーします。

### Claude のサブスクや Anthropic の Remote Control は必要ですか?
不要です。clawleash はセルフホストで、ローカルの Claude Code CLI と動作します。クラウドで動くものはありません。

### スマホから Claude Code の権限を承認しても安全ですか?
ページはトークンで保護され、フックの入口は loopback のみ、許可/拒否できるのは Claude Code がすでに出したプロンプトだけです。公開インターネットではなく Tailscale 上で実行してください。

### ntfy 通知とは何が違いますか?
ntfy は Claude があなたを必要としていることを*知らせる*だけ。clawleash は*答え*られます——デスクに戻らずスマホから直接 Allow/Deny。

### スマホがオフラインだとどうなりますか?
タイムアウト後、権限フックは Claude Code の通常のターミナルプロンプトにフォールバックするので、セッションが止まることはありません。

## ロードマップ

- オンボーディングウィザード(1 画面のローカル設定 UI:インストール/接続/QR)。
- 任意の**ホスト型中継**で、どのネットワークからもゼロ設定アクセス(フリーミアム)。
- Claude Code 以外への、プロバイダー非依存のサポート。

## Claude Code スキル

軽量な Claude Code スキル([`skill/SKILL.md`](./skill/SKILL.md))が CLI をラップしているので、Claude に *「Claude Code のスマホ承認をセットアップして」* と頼むだけで `npx clawleash` を実行し、手順を案内します。

## 必要要件

- Node.js ≥ 18
- フック対応の Claude Code(最近のバージョンは既定で対応)
- 外出先からのアクセス:Mac とスマホに Tailscale

## コントリビュート

Issue・PR 歓迎。ユニットテストは `npm test` で実行します。

## ライセンスと商標

コード:[Apache-2.0](./LICENSE)。**clawleash** の名称/ロゴはコードライセンスの対象外です——[TRADEMARK.md](./TRADEMARK.md) を参照。clawleash は Claude Code 向けの独立したコミュニティツールで、**Anthropic とは無関係**です。「Claude」「Claude Code」は Anthropic の商標で、ここでは説明的に使用しています。
