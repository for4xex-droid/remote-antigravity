---
description: 外出モードへの移行 - リモート接続環境を立ち上げ、常駐監視モードに入る
---

# Remote Bridge Mode

このワークフローは、外出先からのリモート操作を受け付けるためのサーバー群を起動し、Antigravityを待機モードへ移行させます。

## 前提条件
- Bridge Server と Mobile Client がセットアップ済みであること
- Cloudflare (`cloudflared`) がインストール済みであること

---

## 手順 1: システム起動

以下のPowerShellスクリプトを実行して、バックグラウンドサーバー群を一括起動してください。

```powershell
.\scripts\start-remote.ps1
```

このスクリプトは以下を実行します：
1. 既存のゾンビプロセスを終了（ポート3000, 3001を解放）
2. Bridge Server を起動 (Port 3001)
3. UI Server を起動 (Port 3000)
4. Cloudflare Tunnel を2本起動（Frontend/Backend）

---

## 手順 2: トンネルURLの確認

起動後、トンネルURLを確認してください。

```powershell
Get-Content .\logs\tunnel-frontend-error.log | Select-String "trycloudflare.com"
Get-Content .\logs\tunnel-backend-error.log | Select-String "trycloudflare.com"
```

**Frontend URL** をユーザーに伝えてください（スマホでアクセスするURL）。

---

## 手順 2.5: Backend URLの設定（初回のみ）

`hooks/useAgentSocket.ts` の `BRIDGE_URL` を Backend のトンネルURLに更新してください。

---

## 手順 3: 監視ループ (The Loop)

ここからは以下の手順を**無限に繰り返してください**。

### 3-1. 待機
以下のコマンドを実行し、スマホからの指示を待ちます。

```bash
node wait-for-change.js
```

※このコマンドは、`mobile-chat.md` が更新されるまで終了しません（最大30秒でタイムアウト）。

### 3-2. 実行
コマンドが終了したら、`mobile-chat.md` の内容を読み取り、ユーザーの指示に従って作業を行ってください。

### 3-3. 報告
作業結果を `mobile-chat.md` に追記してください。フォーマット:
```
[Agent] (HH:MM:SS): 作業結果や応答内容
```

### 3-4. 再開
**必ず手順3-1に戻り、再び待機コマンドを実行してください。**

---

## 手順 4: 終了（帰宅時）

リモートモードを終了する場合：

```powershell
.\scripts\stop-remote.ps1
```

---

## トラブルシューティング

### ポートが既に使用中
```powershell
.\scripts\stop-remote.ps1
.\scripts\start-remote.ps1
```

### トンネルURLが表示されない
ログファイルを確認:
```powershell
Get-Content .\logs\tunnel-frontend-error.log -Tail 20
```

### スマホから接続できない
1. PCがスリープしていないか確認
2. Cloudflareトンネルが起動しているか確認
3. Bridge Serverのログを確認: `Get-Content .\logs\bridge-error.log`
