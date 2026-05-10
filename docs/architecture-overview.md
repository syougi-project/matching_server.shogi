# matching_server.shogi Architecture Overview

## Goal
- `app.shogi` のオンライン対戦（ユーザー vs ユーザー）向けのサーバーを提供する
- 対戦中の状態はサーバー権威で管理する
- 通信は主に API Gateway WebSocket 経由で行う
- 永続化とマッチング待機列は AWS 上の DynamoDB を中心に扱う
- 対局の開始・終了などの結果は非同期イベントとして `bff.shogi` に通知し、RDB 側の対戦履歴に反映する

## Non-Goals
- この段階では Terraform 実装や AWS リソース定義は行わない
- 課金、観戦、リプレイ保存、チート検知高度化は初期スコープに含めない
- レーティング算出ロジックは初期スコープに含めない

## System Context
- `app.shogi`
  - クライアントアプリ
  - WebSocket 接続を張り、対戦開始要求・着手要求・投了要求などを送る
- `matching_server.shogi`
  - WebSocket のセッション管理
  - マッチングキュー管理
  - 対局状態の正本管理
  - 着手妥当性検証
  - 対局イベント配信
  - `bff.shogi` への開始・終了通知
- `bff.shogi`
  - 対戦メタデータの永続化
  - 対戦履歴・勝敗結果の管理
  - 将来的なプロフィールや戦績表示用の参照元

## High-Level Flow
1. クライアントが WebSocket 接続を確立する
2. クライアントが `enter_queue` を送る
3. `matching_server.shogi` が接続情報と待機要求を DynamoDB に記録し、即時に待機受付応答を返す
4. 別のマッチング処理がレート帯バケット単位で待機者を探索し、排他的に 2 名を確保する
5. 対戦 ID を発行し、対局状態を作成する
6. `matching_server.shogi` が対局開始を確定し、両クライアントへ `match_found` / `game_started` を配信する
7. 開始イベントを非同期で `bff.shogi` に通知し、RDB に対戦メタデータを反映する
8. 対局中は各操作を WebSocket メッセージとして受信し、`version` 条件付きで検証してから状態更新する
9. 切断時は即終了せず、再接続猶予内での復帰を許容する
10. 終局時に終了イベントを非同期で `bff.shogi` に通知する

## Authoritative State Policy
- 盤面、手番、持ち駒、消費時間、対局状態はサーバーが正本を持つ
- クライアントは表示と入力のみを担当し、状態確定はサーバー応答を待つ
- 各着手要求はサーバーで以下を検証する
  - 対局 ID が有効か
  - 送信者がその手番のプレイヤーか
  - 着手が合法手か
  - 対局が `started` 状態か
- 各着手要求は `expectedVersion` と現在 `version` の一致を前提に処理する
- 検証に通った更新だけを条件付き更新で DynamoDB に反映し、その結果を両者に配信する

## Proposed Runtime Shape
- API Gateway WebSocket
  - 接続管理
  - Route selection for message actions
- AWS Lambda
  - Connect / disconnect handler
  - Queue entry / cancel handler
  - Matchmaking worker
  - Game command handler
  - Reconnect timeout handler
  - BFF event dispatcher
- DynamoDB
  - Connections
  - Match queue
  - Match sessions
  - Optional game event log
- Optional async delivery layer
  - 開始・終了イベントの配送再試行キュー

## Initial Module Plan
- `src/ws`
  - WebSocket route handlers
- `src/matchmaking`
  - キュー投入、バケット探索、排他確保、対戦作成
- `src/game`
  - 対局状態モデル、着手適用、終局判定
- `src/persistence`
  - DynamoDB repository
- `src/integrations`
  - `bff.shogi` 通知クライアント
  - 非同期イベント配送
- `src/shared-shogi-core` or external shared package
  - `app.shogi` と共有する純粋な将棋ルールロジック候補
- `src/shared`
  - 型、エラー、ログ、設定

## Key Design Decisions
- 初期段階では WebSocket を主経路とし、対局操作はすべてサーバーで検証する
- `enter_queue` は待機登録だけを担当し、マッチング成立判定は非同期 worker に分離する
- マッチングキューは DynamoDB を使い、同時マッチング競合は条件付き更新または `TransactWriteItems` で抑止する
- ランク近傍探索は厳密ソートではなく、初期はレート帯バケット方式で実装する
- 対局更新は `version` を用いた条件付き更新で順序競合を抑止する
- 対局履歴の完全な参照系は `bff.shogi` に寄せるが、通知はクリティカルパスに置かず非同期再試行可能なイベントにする
- モバイル切断を前提に、即 `aborted` ではなく再接続猶予を設ける
- 将棋ルールロジックは `app.shogi` と共有可能な純粋ロジックとして切り出す方針を優先検討する
- インフラ定義は最後に Terraform で追加する

## Open Questions
- レート帯バケット幅を 50 / 100 / 200 のどれにするか
- 近傍探索の拡張順をどうするか
- 持ち時間を初期リリースで入れるか、無制限にするか
- 再接続猶予を 30 秒にするか 60 秒にするか
- `bff.shogi` 通知の非同期配送に何を使うか
- 将棋ロジック共有を monorepo package にするか、別 repo package にするか
