# matching_server.shogi Message Flow Plan

## WebSocket Message Categories
- connection lifecycle
- queue control
- match lifecycle
- in-game commands
- server events

## Client -> Server Actions

### `enter_queue`
Purpose:
- オンライン対戦待機を開始する

Payload draft:
```json
{
  "action": "enter_queue",
  "requestId": "req_123",
  "userId": "user_1",
  "rating": 1520
}
```

Server behavior:
- 接続ユーザーの認証情報を確認する
- 既存の待機エントリがないか確認する
- `match_queue` に `waiting` として登録する
- `queue_entered` を返す
- この同期処理の中ではマッチ成立まで進めない

### `cancel_queue`
Purpose:
- 待機をやめる

Server behavior:
- `waiting` なら `cancelled` に更新する
- マッチング中ならキャンセル不可にするか、短時間保留にする

### `make_move`
Purpose:
- 着手要求

Payload draft:
```json
{
  "action": "make_move",
  "requestId": "req_124",
  "matchId": "match_1",
  "expectedVersion": 12,
  "move": {
    "from": "7g",
    "to": "7f",
    "piece": "FU",
    "promote": false
  }
}
```

Server behavior:
- 対局存在確認
- 手番確認
- 合法手確認
- `expectedVersion` と現在 `version` の一致確認
- 条件付き更新で状態更新
- 両者へ更新通知

### `resign`
Purpose:
- 投了

Server behavior:
- 対局を `finished` とする
- 勝者を相手に設定する
- 終了イベントを非同期配送キューへ積む

## Server -> Client Events

### `queue_entered`
```json
{
  "type": "queue_entered",
  "requestId": "req_123",
  "status": "waiting"
}
```

### `match_found`
```json
{
  "type": "match_found",
  "matchId": "match_1",
  "role": "black"
}
```

### `game_started`
```json
{
  "type": "game_started",
  "matchId": "match_1",
  "status": "started",
  "initialState": {
    "turn": "black",
    "board": {},
    "hands": {}
  }
}
```

### `game_state_updated`
```json
{
  "type": "game_state_updated",
  "matchId": "match_1",
  "version": 7,
  "turn": "white",
  "board": {},
  "hands": {},
  "lastMove": {}
}
```

### `state_resync_required`
```json
{
  "type": "state_resync_required",
  "matchId": "match_1",
  "code": "VERSION_MISMATCH",
  "currentVersion": 13
}
```

### `opponent_disconnected`
```json
{
  "type": "opponent_disconnected",
  "matchId": "match_1",
  "reconnectDeadlineAt": "2026-05-10T18:00:30Z"
}
```

### `opponent_reconnected`
```json
{
  "type": "opponent_reconnected",
  "matchId": "match_1"
}
```

### `game_finished`
```json
{
  "type": "game_finished",
  "matchId": "match_1",
  "status": "finished",
  "winnerUserId": "user_1",
  "reason": "resign"
}
```

### `error`
```json
{
  "type": "error",
  "requestId": "req_124",
  "code": "ILLEGAL_MOVE",
  "message": "Move is not legal in the current position"
}
```

## Matchmaking Flow
1. `enter_queue` を受信する
2. queue item を `waiting` で保存する
3. `queue_entered` を即返す
4. 非同期マッチング worker が `waiting` エントリ群から候補探索する
5. まず同一 `ratingBucket` を探索し、いなければ隣接バケットへ段階的に広げる
6. `TransactWriteItems` または条件付き更新で 2 人を `matching` に確保する
7. 対局セッションを作成する
8. queue status を `matched` に更新する
9. 両者に `match_found` と `game_started` を送る
10. 開始イベントを非同期で `bff.shogi` 通知キューへ積む

## Disconnect Handling
- 切断時は `ws_connections` を切断状態にする
- 待機中なら queue を `expired` または `cancelled` にする
- 対局中なら `opponent_disconnected` を通知し、再接続猶予を開始する
- 猶予内に同一 `userId` が新しい `connectionId` で戻ればセッションへ再バインドする
- 猶予経過後も戻らなければ `aborted` を確定する

## BFF Notification Flow

### On match start
- `matching_server.shogi` -> async event store / queue -> `bff.shogi`
- event: `match.started`
- payload:
  - `matchId`
  - players
  - startedAt
  - idempotencyKey

### On match finish
- `matching_server.shogi` -> async event store / queue -> `bff.shogi`
- event: `match.finished`
- payload:
  - `matchId`
  - winnerUserId
  - status
  - finishedAt
  - reason
  - idempotencyKey

### On match abort
- `matching_server.shogi` -> async event store / queue -> `bff.shogi`
- event: `match.aborted`
- payload:
  - `matchId`
  - status
  - finishedAt
  - reason
  - idempotencyKey

## Shared Rule Logic
- 将棋ルール判定はクライアント専用実装とサーバ専用実装に分けず、純粋 TypeScript の共有モジュール化を優先する
- `make_move` の最終判定はサーバーで行う
