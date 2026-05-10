# matching_server.shogi Data Model Plan

## Overview
初期案では DynamoDB に以下の責務を分ける。

- 接続管理
- マッチング待機管理
- 対局セッション管理
- 必要に応じたイベント監査

## Table Candidates

### 1. `ws_connections`
WebSocket 接続とユーザーの対応を保持する。

Primary attributes:
- `connectionId`
- `userId`
- `connectedAt`
- `lastSeenAt`
- `status`
- `currentMatchId` nullable
- `sessionToken` optional

Use cases:
- 接続時の登録
- 切断時の cleanup
- ユーザーへの push 送信先解決
- 再接続判定の補助

Notes:
- `connectionId` は一時的で、`userId` が恒久的な識別子
- 再接続時は新しい `connectionId` を同一 `userId` に再バインドする

### 2. `match_queue`
待機中プレイヤーを保持する。

Primary attributes:
- `queueEntryId`
- `userId`
- `rating`
- `ratingBucket`
- `status`
- `enqueuedAt`
- `matchingToken`
- `connectionId`
- `region` optional
- `matchedAt` nullable
- `matchId` nullable

Expected statuses:
- `waiting`
- `matching`
- `matched`
- `cancelled`
- `expired`

Notes:
- `waiting` のみがマッチ対象
- `matchingToken` は排他制御に使う
- TTL を使って取り残しを掃除できる形にする
- 初期の近傍探索は `ratingBucket` 単位で行う
- `enter_queue` は登録だけで完了し、探索は別 worker が担当する

### 3. `match_sessions`
対局状態の正本を保持する。

Primary attributes:
- `matchId`
- `status`
- `playerBlackUserId`
- `playerWhiteUserId`
- `playerBlackConnectionId`
- `playerWhiteConnectionId`
- `startedAt`
- `finishedAt` nullable
- `winnerUserId` nullable
- `endReason` nullable
- `disconnectedAtBlack` nullable
- `disconnectedAtWhite` nullable
- `reconnectDeadlineAt` nullable
- `boardState`
- `handsState`
- `turn`
- `moveCount`
- `version`

Expected statuses:
- `started`
- `finished`
- `aborted`

Notes:
- `boardState` と `handsState` はサーバーで正本更新する
- `version` は楽観ロック用途
- 対局復元を考慮し、スナップショット 1 件に集約してよい
- 切断復帰に備えて、接続状態と再接続期限を持つ

### 4. `match_events` optional
監査やデバッグ用イベントログ。

Primary attributes:
- `matchId`
- `sequence`
- `type`
- `payload`
- `createdAt`

Notes:
- 初期リリースでは必須ではない
- 問題調査やリプレイに使えるので後で追加価値が高い

### 5. `integration_events` optional
`bff.shogi` への非同期通知状態を保持する。

Primary attributes:
- `eventId`
- `aggregateType`
- `aggregateId`
- `eventType`
- `payload`
- `deliveryStatus`
- `attemptCount`
- `nextAttemptAt`
- `createdAt`

Notes:
- outbox 的に扱う
- `bff.shogi` 通知を対局のクリティカルパスから分離する
- 冪等キーは `aggregateId + eventType` ベースで扱う

## Index Ideas

### `match_queue`
- GSI on `status` + `ratingBucket`
  - `waiting` の中からバケット単位で探索する
- GSI on `userId`
  - 重複入隊防止に使う

### `match_sessions`
- GSI on `playerBlackUserId`
- GSI on `playerWhiteUserId`
- GSI on `status`

## Concurrency Strategy

### Queue ownership
- プレイヤーを拾う前に `waiting -> matching` へ条件付き更新する
- 条件は `status = waiting` を必須にする
- 成功したエントリだけを仮確保済みとして扱う
- `enter_queue` の同期処理では相手探索をしない

### Pair creation
- 候補 2 件を worker が探索し、両方を `waiting -> matching` に仮確保する
- 片方だけ確保に失敗したら、成功側を `waiting` に戻すか短時間で再試行する
- 初期方針として `TransactWriteItems` を優先する
  - 2 件の queue status 更新
  - 1 件の match session 作成
  - 必要なら 2 件の queue item への `matchId` 反映

### In-game mutation
- `match_sessions.version` を条件付き更新に使う
- クライアントからの操作には `expectedVersion` を含める
- サーバー側で不整合なら reject して最新 state を返す

### Reconnect handling
- 切断時は直ちに `aborted` へ遷移しない
- `reconnectDeadlineAt` までに同一 `userId` が復帰したら接続 ID を更新する
- 猶予経過後も復帰しなければ `aborted` へ遷移する

## BFF Side Record
`bff.shogi` 側の RDB は対局履歴メタデータに絞る。

Required fields:
- `match_id`
- `player_black_user_id`
- `player_white_user_id`
- `status`
- `winner_user_id` nullable
- `started_at`
- `finished_at` nullable
- `abort_reason` nullable

Expected statuses:
- `started`
- `finished`
- `aborted`

`matching_server.shogi` はリアルタイム状態を持ち、`bff.shogi` は履歴・参照系を持つ整理にする。

## Shared Shogi Logic Plan
- 合法手判定
- 着手適用
- 初期局面生成
- 終局判定

これらは `app.shogi` と `matching_server.shogi` の間で共有可能な純粋 TypeScript モジュールとして切り出す方針を第一候補にする。
