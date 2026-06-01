#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_SHOGI_ROOT="$(cd "$ROOT_DIR/../app.shogi" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ENTRYPOINT="$ROOT_DIR/src/lambda/index.ts"
VALIDATOR_ENTRYPOINT="$APP_SHOGI_ROOT/scripts/online-move-validator.ts"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

bun build "$ENTRYPOINT" \
  --target=node \
  --format=cjs \
  --outfile="$DIST_DIR/index.js"

bun build "$VALIDATOR_ENTRYPOINT" \
  --target=node \
  --format=cjs \
  --outfile="$DIST_DIR/online-move-validator.cjs"

(
  cd "$DIST_DIR"
  zip -q lambda.zip index.js online-move-validator.cjs
)

echo "[build:lambda] wrote $DIST_DIR/lambda.zip"
