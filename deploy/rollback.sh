#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — Rollback Script
# ═══════════════════════════════════════════════════════════════
#
# Rolls back to the previous Docker image version.
#
# Usage:
#   ./deploy/rollback.sh              # Rollback to last known good
#   ./deploy/rollback.sh v1.0.0       # Rollback to specific tag
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────
TARGET_TAG="${1:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/afrifundedcapital}"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_NAME="${IMAGE_NAME:-afrifundedcapital/afrifundedcapital}"

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[rollback]${NC} $*"; }
ok()   { echo -e "${GREEN}[   ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[ warn]${NC} $*"; }
fail() { echo -e "${RED}[ FAIL]${NC} $*"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  AfriFundedCapital — Rollback"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── Determine rollback target ──────────────────────────────
if [ -n "${TARGET_TAG}" ]; then
  ROLLBACK_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TARGET_TAG}"
  log "Rolling back to specified tag: ${TARGET_TAG}"
else
  # Read the saved rollback point
  ROLLBACK_FILE="${DEPLOY_PATH}/.rollback-image"
  if [ ! -f "${ROLLBACK_FILE}" ]; then
    fail "No rollback point found. Use: $0 <tag>"
  fi

  ROLLBACK_IMAGE=$(cat "${ROLLBACK_FILE}")
  if [ -z "${ROLLBACK_IMAGE}" ]; then
    fail "Rollback file is empty. Use: $0 <tag>"
  fi
  log "Rolling back to saved image: ${ROLLBACK_IMAGE}"
fi

# ─── Show current state ─────────────────────────────────────
log "Current image:"
if docker inspect afc-prod >/dev/null 2>&1; then
  CURRENT=$(docker inspect afc-prod --format='{{.Config.Image}}' 2>/dev/null || echo "unknown")
  echo "  ${CURRENT}"
else
  echo "  (no running container)"
fi

log "Target image:"
echo "  ${ROLLBACK_IMAGE}"
echo ""

# ─── Confirm ────────────────────────────────────────────────
read -p "Proceed with rollback? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  log "Rollback cancelled."
  exit 0
fi

# ─── Pull the rollback image ────────────────────────────────
log "Pulling rollback image..."
if docker pull "${ROLLBACK_IMAGE}"; then
  ok "Image pulled: ${ROLLBACK_IMAGE}"
else
  fail "Failed to pull image: ${ROLLBACK_IMAGE}"
fi

# ─── Deploy the rollback ────────────────────────────────────
log "Deploying rollback..."

cd "${DEPLOY_PATH}"

# Extract tag from image
ROLLBACK_TAG=$(echo "${ROLLBACK_IMAGE}" | cut -d: -f2)
export AFC_TAG="${ROLLBACK_TAG}"

if docker compose --profile prod up -d --force-recreate --no-deps app-prod 2>&1; then
  ok "Rollback containers started"
else
  fail "Failed to start rollback containers"
fi

# ─── Health check ───────────────────────────────────────────
log "Running health checks..."

HEALTHY=false
for i in $(seq 1 10); do
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/api/health 2>/dev/null || echo "000")

  if [ "${HTTP_CODE}" = "200" ]; then
    HEALTHY=true
    ok "Health check passed"
    break
  fi

  log "  Attempt ${i}/10 — HTTP ${HTTP_CODE}"
  sleep 3
done

# ─── Result ─────────────────────────────────────────────────
echo ""
if [ "${HEALTHY}" = "true" ]; then
  ok "Rollback completed successfully!"
  echo ""
  echo "  Rolled back to: ${ROLLBACK_IMAGE}"
  echo ""
  docker compose --profile prod ps
else
  fail "Rollback FAILED — health check did not pass"
fi

echo "═══════════════════════════════════════════════════════════"
