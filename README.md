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
$env:MATCHING_BFF_BASE_URL = "http://localhost:3000"
$env:MATCHING_BFF_INTERNAL_TOKEN = "your-internal-token"
bun run dev:ws
```

全駒定義をサーバー側でも揃えるには `MATCHING_BFF_BASE_URL`（app と同じ BFF）の利用を推奨します。未設定時は内蔵の標準駒＋霧・刀など限定カタログになります。

`APP_SHOGI_ROOT` 設定時は、マッチ作成時の `ruleSnapshot` も app.shogi の `preparePieceCatalogForBattleAndDisplay`（ガチャ駒の移動範囲・スキル正典）で正規化されます。エンジン変更後は `app.shogi` で `bun run build:online-validator` を実行してください。

## 環境変数

| 変数 | 説明 |
|------|------|
| `PORT` | WebSocket ポート（既定 3010） |
| `APP_SHOGI_ROOT` | app.shogi ルート（設定時フルエンジン検証） |
| `MATCHING_BFF_BASE_URL` | 駒マスタ取得・対戦結果通知用 BFF URL |
| `MATCHING_BFF_INTERNAL_TOKEN` | BFF 内部 API 呼び出し用共有トークン |
| `MATCHING_TICKET_SECRET` | BFF 発行 matchmaking ticket 検証用署名鍵 |
| `MATCHING_RATING_BUCKET_SIZE` | レート帯幅 |
| `MATCHING_RECONNECT_GRACE_SECONDS` | 切断猶予秒 |

## 起動

```powershell
bun run dev:ws
```

接続: `ws://<host>:3010/ws?userId=<id>`
