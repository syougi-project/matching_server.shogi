#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ENTRYPOINT="$ROOT_DIR/src/lambda/index.ts"
APP_SHOGI_ROOT="${APP_SHOGI_ROOT:-}"
VALIDATOR_OUT="$DIST_DIR/online-move-validator.cjs"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

bun build "$ENTRYPOINT" \
  --target=node \
  --format=cjs \
  --outfile="$DIST_DIR/index.js"

ZIP_FILES=(index.js)

if [[ -n "$APP_SHOGI_ROOT" ]]; then
  VALIDATOR_ENTRYPOINT="$APP_SHOGI_ROOT/scripts/online-move-validator.ts"
  if [[ ! -f "$VALIDATOR_ENTRYPOINT" ]]; then
    echo "[build:lambda] APP_SHOGI_ROOT is set but validator was not found: $VALIDATOR_ENTRYPOINT" >&2
    exit 1
  fi

  bun build "$VALIDATOR_ENTRYPOINT" \
    --target=node \
    --format=cjs \
    --outfile="$VALIDATOR_OUT"

  ZIP_FILES+=(online-move-validator.cjs)
else
  echo "[build:lambda] APP_SHOGI_ROOT is not set; building matching server lambda without bundled app.shogi validator"
fi

(
  cd "$DIST_DIR"
  zip -q lambda.zip "${ZIP_FILES[@]}"
)

echo "[build:lambda] wrote $DIST_DIR/lambda.zip"
