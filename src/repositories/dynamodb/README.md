# DynamoDB runtime repositories

This directory is the Lambda/API Gateway WebSocket target for runtime-only state.

Durable data remains in `bff.shogi`/Postgres. DynamoDB records must be safe to expire with TTL:

- connections
- queue entries and queue lookup rows
- active match snapshots
- move audit rows for active/recent matches
- request idempotency records
- outbox delivery state

Required conditional-write rules:

- queue reservation: `status = waiting`
- queue matched: `status = matching`
- move update: `version = expectedVersion and status = started`
- idempotency insert: `attribute_not_exists(idempotencyKey)`
- result/outbox: `attribute_not_exists(matchId:eventType)` or stored idempotency key

The concrete repository implementation should use AWS SDK v3 in the Lambda package. It is intentionally not imported in the local Bun dev path yet, so the current test suite can keep running without AWS credentials.
