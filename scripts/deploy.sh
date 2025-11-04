#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

cd "$PROJECT_ROOT"

: "${REGISTRY:=localhost}"
: "${TAG:=latest}"

if ! docker buildx inspect multiarch-builder >/dev/null 2>&1; then
  docker buildx create --name multiarch-builder --use >/dev/null
fi

docker buildx use multiarch-builder >/dev/null

EXTRA_ARGS=("--platform" "linux/amd64,linux/arm64")
if [[ "${PUSH:-0}" == "1" ]]; then
  EXTRA_ARGS+=("--push")
else
  EXTRA_ARGS+=("--load")
fi

docker buildx build "${EXTRA_ARGS[@]}" \
  -t "${REGISTRY}/nim-benchmark-backend:${TAG}" \
  -f benchmark/backend/Dockerfile \
  benchmark/backend

docker buildx build "${EXTRA_ARGS[@]}" \
  -t "${REGISTRY}/nim-benchmark-frontend:${TAG}" \
  -f benchmark/frontend/Dockerfile \
  benchmark/frontend
