#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ENTRYPOINT="$ROOT_DIR/src/lambda/index.ts"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

bun build "$ENTRYPOINT" \
  --target=node \
  --format=cjs \
  --outfile="$DIST_DIR/index.js"

(
  cd "$DIST_DIR"
  zip -q lambda.zip index.js
)

echo "[build:lambda] wrote $DIST_DIR/lambda.zip"
