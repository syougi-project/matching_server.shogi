# matching_server.shogi Implementation Phases

## Phase 0: Planning
- 役割分離を確定する
- DynamoDB の責務を確定する
- WebSocket メッセージ契約の初版を決める
- `bff.shogi` 連携イベントを決める
- 将棋ロジック共有方針を決める

Deliverables:
- `docs/architecture-overview.md`
- `docs/data-model-plan.md`
- `docs/message-flow-plan.md`
- 本ドキュメント

## Phase 1: Application Skeleton
- TypeScript プロジェクト初期化
- `src/` のモジュール境界作成
- 設定ロード、ログ、エラー基盤作成
- WebSocket handler の入口を作る
- 共有将棋ロジック package の置き場所を決める

## Phase 2: Queue and Matchmaking Core
- queue entry 作成
- queue cancel 作成
- 重複入隊防止
- 非同期 matchmaking worker 作成
- レート帯バケット探索
- `TransactWriteItems` または条件付き更新による仮確保
- match session 作成

Exit criteria:
- 単体テストで二重マッチングが抑止される
- 同時入隊時の競合ケースを再現テストできる
- `enter_queue` の応答がマッチング成否と独立している

## Phase 3: Authoritative Game State
- 対局状態モデル作成
- 初期局面生成
- 着手妥当性検証
- 着手適用
- `version` ベースの順序制御
- 勝敗確定
- 投了処理
- 再接続中の state resync

Exit criteria:
- 不正手が reject される
- 正常手で state version が進む
- 古い `expectedVersion` の着手が reject される

## Phase 4: WebSocket Eventing
- 接続時ハンドラ
- 切断時ハンドラ
- 対局イベントの push
- エラー応答統一
- 再送・冪等の方針整理
- 再接続猶予とセッション再バインド

## Phase 5: BFF Integration
- `match.started` 非同期通知
- `match.finished` 非同期通知
- `match.aborted` 非同期通知
- outbox / queue ベースの再試行方針
- 冪等キー設計

Exit criteria:
- BFF 一時障害時でも対局開始・終了の主処理が止まらない
- BFF 側に started / finished / aborted が最終的に反映される

## Phase 6: Operational Hardening
- タイムアウト設計
- stale queue cleanup
- reconnect deadline cleanup
- 監査ログ
- メトリクス
- アラート

## Phase 7: Terraform
- API Gateway WebSocket
- Lambda
- DynamoDB
- IAM
- CloudWatch
- Secrets / env vars

## Testing Plan
- unit
  - matchmaking バケット探索
  - matchmaking 条件判定
  - legal move 判定
  - state transition
- integration
  - queue -> async match -> start
  - move -> state update -> finish
  - disconnect -> reconnect -> resume
  - start / finish BFF async notification
- concurrency
  - 同一候補を複数 worker が同時取得するケース
  - 二重開始防止
  - 古い version の着手競合

## Risks to Resolve Before Implementation
- WebSocket 認証方式
- 切断と再接続の扱い
- レート帯バケット幅と探索拡張ルール
- 将棋ロジック共有 package の切り出し方法
- BFF 非同期通知の配送基盤
