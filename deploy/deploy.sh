#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — Server Deployment Script
# ═══════════════════════════════════════════════════════════════
#
# Run this on the target server to deploy a new version.
#
# Usage:
#   ./deploy/deploy.sh                  # Deploy latest
#   ./deploy/deploy.sh v1.2.3           # Deploy specific tag
#   ./deploy/deploy.sh latest staging   # Deploy to staging
#
# Environment variables:
#   DEPLOY_PATH     — Path to docker-compose.yml (default: /opt/afrifundedcapital)
#   REGISTRY        — Docker registry (default: ghcr.io)
#   IMAGE_NAME      — Image name (default: afrifundedcapital/afrifundedcapital)
#   COMPOSE_PROFILES — Comma-separated profiles (default: prod)
#   NO_BACKUP       — Set to "true" to skip database backup
#   HEALTH_RETRIES  — Max health check retries (default: 10)
#   HEALTH_INTERVAL — Seconds between health checks (default: 5)
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────
TAG="${1:-latest}"
ENV="${2:-production}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/afrifundedcapital}"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_NAME="${IMAGE_NAME:-afrifundedcapital/afrifundedcapital}"
COMPOSE_PROFILES="${COMPOSE_PROFILES:-prod}"
HEALTH_RETRIES="${HEALTH_RETRIES:-10}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"
NO_BACKUP="${NO_BACKUP:-false}"

IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── Helpers ─────────────────────────────────────────────────
log()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
START_TIME=$(date +%s)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  AfriFundedCapital — Deployment"
echo "═══════════════════════════════════════════════════════════"
echo ""
log "Tag:        ${TAG}"
log "Image:      ${IMAGE}"
log "Environment: ${ENV}"
log "Path:       ${DEPLOY_PATH}"
echo ""

# ─── Step 1: Pre-flight checks ─────────────────────────────
log "Step 1/6: Pre-flight checks..."

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
  fail "Docker is not running!"
fi
ok "Docker is running"

# Check docker-compose.yml exists
if [ ! -f "${DEPLOY_PATH}/docker-compose.yml" ]; then
  fail "docker-compose.yml not found at ${DEPLOY_PATH}"
fi
ok "docker-compose.yml found"

# Check image exists in registry
if ! docker manifest inspect "${IMAGE}" >/dev/null 2>&1; then
  warn "Could not verify image in registry (may not be pulled yet)"
fi

# ─── Step 2: Backup database ────────────────────────────────
log "Step 2/6: Backing up database..."

if [ "${NO_BACKUP}" = "true" ]; then
  warn "Backup skipped (NO_BACKUP=true)"
elif [ -f "${DEPLOY_PATH}/data/afrifundedcapital.db" ]; then
  mkdir -p "${DEPLOY_PATH}/data/backups"
  BACKUP_FILE="${DEPLOY_PATH}/data/backups/afrifundedcapital_${TIMESTAMP}.db"

  if cp "${DEPLOY_PATH}/data/afrifundedcapital.db" "${BACKUP_FILE}"; then
    ok "Database backed up to ${BACKUP_FILE}"
  else
    warn "Database backup failed — continuing anyway"
  fi

  # Keep only last 7 backups
  BACKUP_COUNT=$(ls -1 "${DEPLOY_PATH}/data/backups/"*.db 2>/dev/null | wc -l)
  if [ "$BACKUP_COUNT" -gt 7 ]; then
    ls -t "${DEPLOY_PATH}/data/backups/"*.db | tail -n +8 | xargs rm -f
    log "Cleaned up old backups (kept last 7)"
  fi
else
  log "No database file found (first deployment?)"
fi

# ─── Step 3: Pull new image ─────────────────────────────────
log "Step 3/6: Pulling new image..."

if docker pull "${IMAGE}"; then
  ok "Image pulled successfully: ${IMAGE}"
else
  fail "Failed to pull image: ${IMAGE}"
fi

# ─── Step 4: Record current state for rollback ──────────────
log "Step 4/6: Recording rollback point..."

PREV_IMAGE=""
if docker inspect afc-prod >/dev/null 2>&1; then
  PREV_IMAGE=$(docker inspect afc-prod --format='{{.Config.Image}}' 2>/dev/null || echo "")
  if [ -n "${PREV_IMAGE}" ]; then
    ok "Previous image recorded: ${PREV_IMAGE}"
    echo "${PREV_IMAGE}" > "${DEPLOY_PATH}/.rollback-image"
  fi
fi

# ─── Step 5: Deploy ─────────────────────────────────────────
log "Step 5/6: Starting containers..."

cd "${DEPLOY_PATH}"

# Export tag for docker-compose
export AFC_TAG="${TAG}"

# Use docker-compose profiles
if [ "${ENV}" = "production" ] || [ "${ENV}" = "prod" ]; then
  COMPOSE_PROFILES="prod"
fi

# Stop old containers and start new ones
if COMPOSE_PROFILES="${COMPOSE_PROFILES}" docker compose \
  --profile "${COMPOSE_PROFILES}" \
  up -d \
  --force-recreate \
  --no-deps \
  app-prod 2>&1; then
  ok "Containers started"
else
  fail "Failed to start containers"
fi

# ─── Step 6: Health check ───────────────────────────────────
log "Step 6/6: Running health checks..."

HEALTHY=false
for i in $(seq 1 "${HEALTH_RETRIES}"); do
  log "  Health check ${i}/${HEALTH_RETRIES}..."

  # Check if container is running
  CONTAINER_STATE=$(docker inspect afc-prod --format='{{.State.Status}}' 2>/dev/null || echo "not found")

  if [ "${CONTAINER_STATE}" = "running" ]; then
    # Check HTTP health endpoint
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/api/health 2>/dev/null || echo "000")

    if [ "${HTTP_CODE}" = "200" ]; then
      HEALTHY=true
      ok "Health check passed (HTTP ${HTTP_CODE})"
      break
    fi

    log "  HTTP status: ${HTTP_CODE} (waiting for 200...)"
  else
    warn "  Container state: ${CONTAINER_STATE}"
  fi

  sleep "${HEALTH_INTERVAL}"
done

# ─── Result ─────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "═══════════════════════════════════════════════════════════"

if [ "${HEALTHY}" = "true" ]; then
  ok "Deployment completed successfully in ${DURATION}s"
  echo ""
  echo "  Image:  ${IMAGE}"
  echo "  Tag:    ${TAG}"
  echo "  Time:   ${DURATION}s"
  echo ""

  # Show container status
  log "Container status:"
  docker compose --profile "${COMPOSE_PROFILES}" ps

  echo "═══════════════════════════════════════════════════════════"
  exit 0
else
  fail "Deployment FAILED — health check did not pass after ${HEALTH_RETRIES} attempts"
  echo ""
  echo "  Rollback: ./deploy/rollback.sh"
  echo "  Logs:     docker compose --profile ${COMPOSE_PROFILES} logs -f"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
