# matching_server.shogi

オンライン対戦用 WebSocket マッチングサーバー。

## 特殊駒・スキル（app.shogi エンジン連携）

`APP_SHOGI_ROOT` に `app.shogi` のルートパスを指定すると、着手検証に app.shogi 本番エンジン（`scripts/online-move-validator.ts`）を subprocess で呼び出します。ステージ戦と同じ合法手・スキル状態（`canonicalState`）をクライアントへ配信します。

```powershell
# 1) app.shogi で検証用バンドルをビルド（初回・エンジン変更時）
cd ..\app.shogi
bun run build:online-validator

# 2) マッチングサーバー起動
cd ..\matching_server.shogi
$env:APP_SHOGI_ROOT = "C:\path\to\CodeBase\app.shogi"
$env:PORT = "3010"
bun run dev:ws
```

全駒定義をサーバー側でも揃えるには `MATCHING_BFF_BASE_URL`（app と同じ BFF）の利用を推奨します。未設定時は内蔵の標準駒＋霧・刀など限定カタログになります。

## 環境変数

| 変数 | 説明 |
|------|------|
| `PORT` | WebSocket ポート（既定 3010） |
| `APP_SHOGI_ROOT` | app.shogi ルート（設定時フルエンジン検証） |
| `MATCHING_BFF_BASE_URL` | 駒マスタ取得用 BFF URL |
| `MATCHING_RATING_BUCKET_SIZE` | レート帯幅 |
| `MATCHING_RECONNECT_GRACE_SECONDS` | 切断猶予秒 |

## 起動

```powershell
bun run dev:ws
```

接続: `ws://<host>:3010/ws?userId=<id>`
