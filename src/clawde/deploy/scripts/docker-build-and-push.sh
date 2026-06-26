#!/bin/bash
# Build the clawde image for linux/amd64 and push to Docker Hub
# under zjor/clawde:<git-short-sha>.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# deploy/scripts/ → ../.. → telegram-bot/ (Dockerfile context root)
CONTEXT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DOCKER_USER=zjor
IMAGE=clawde
VERSION=$(git rev-parse --short HEAD)
set -x

docker buildx build \
  --platform linux/amd64 \
  --push \
  -t "${DOCKER_USER}/${IMAGE}:${VERSION}" \
  "$CONTEXT"
