# matching_server.shogi

オンライン対戦用 WebSocket マッチングサーバー。

## 特殊駒・スキル

matching server は単体でビルド・デプロイできるよう、外部リポジトリのローカルパスには依存しません。着手検証とスキル処理はこのリポジトリ内の rule engine で実行します。

```powershell
$env:PORT = "3010"
$env:MATCHING_BFF_BASE_URL = "http://localhost:3000"
$env:MATCHING_BFF_INTERNAL_TOKEN = "your-internal-token"
bun run dev:ws
```

全駒定義をサーバー側でも揃えるには `MATCHING_BFF_BASE_URL`（BFF の駒マスタ API）の利用を推奨します。未設定時は内蔵の標準駒＋一部特殊駒の限定カタログになります。

## 環境変数

| 変数 | 説明 |
|------|------|
| `PORT` | WebSocket ポート（既定 3010） |
| `MATCHING_BFF_BASE_URL` | 駒マスタ取得・対戦結果通知用 BFF URL |
| `MATCHING_BFF_INTERNAL_TOKEN` | BFF 内部 API 呼び出し用共有トークン |
| `MATCHING_TICKET_SECRET` | BFF 発行 matchmaking ticket 検証用署名鍵 |
| `MATCHING_RATING_BUCKET_SIZE` | レート帯幅 |
| `MATCHING_EXPERIMENT_WIDE_RATING` | 実験用: `true`（既定）でレート帯を無視してマッチ（例: 0 と 1500）。本番前は `false` 推奨 |
| `MATCHING_RECONNECT_GRACE_SECONDS` | 切断猶予秒 |

## 起動

```powershell
bun run dev:ws
```

接続: `ws://<host>:3010/ws?userId=<id>`
