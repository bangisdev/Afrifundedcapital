#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — Server Initial Setup Script
# ═══════════════════════════════════════════════════════════════
#
# Run this once on a fresh server to set up the deployment directory.
#
# Usage:
#   ssh root@server 'bash -s' < deploy/setup-server.sh
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

DEPLOY_PATH="${1:-/opt/afrifundedcapital}"
DEPLOY_USER="${2:-deploy}"

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  AfriFundedCapital — Server Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── 1. Install Docker ──────────────────────────────────────
log "1/7: Installing Docker..."

if command -v docker >/dev/null 2>&1; then
  ok "Docker already installed: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker installed: $(docker --version)"
fi

# ─── 2. Install Docker Compose plugin ───────────────────────
log "2/7: Installing Docker Compose..."

if docker compose version >/dev/null 2>&1; then
  ok "Docker Compose already installed: $(docker compose version --short)"
else
  apt-get update && apt-get install -y docker-compose-plugin
  ok "Docker Compose installed: $(docker compose version --short)"
fi

# ─── 3. Create deploy user ──────────────────────────────────
log "3/7: Creating deploy user..."

if id "${DEPLOY_USER}" >/dev/null 2>&1; then
  ok "User '${DEPLOY_USER}' already exists"
else
  useradd -m -s /bin/bash "${DEPLOY_USER}"
  usermod -aG docker "${DEPLOY_USER}"
  ok "User '${DEPLOY_USER}' created and added to docker group"
fi

# ─── 4. Create deploy directory ─────────────────────────────
log "4/7: Creating deploy directory..."

mkdir -p "${DEPLOY_PATH}"
mkdir -p "${DEPLOY_PATH}/data/backups"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_PATH}"
ok "Directory created: ${DEPLOY_PATH}"

# ─── 5. Copy docker-compose.yml ─────────────────────────────
log "5/7: Copying docker-compose.yml..."

if [ ! -f "${DEPLOY_PATH}/docker-compose.yml" ]; then
  # The deploy.sh will handle pulling the compose file from the repo
  log "docker-compose.yml not found — will be deployed automatically"
else
  ok "docker-compose.yml already exists"
fi

# ─── 6. Set up SSH key for GitHub Actions ───────────────────
log "6/7: Setting up SSH key..."

DEPLOY_SSH_DIR="/home/${DEPLOY_USER}/.ssh"
mkdir -p "${DEPLOY_SSH_DIR}"
touch "${DEPLOY_SSH_DIR}/authorized_keys"
chmod 700 "${DEPLOY_SSH_DIR}"
chmod 600 "${DEPLOY_SSH_DIR}/authorized_keys"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_SSH_DIR}"

echo ""
echo "  Add the GitHub Actions public key to:"
echo "  ${DEPLOY_SSH_DIR}/authorized_keys"
echo ""

# ─── 7. Firewall rules ──────────────────────────────────────
log "7/7: Configuring firewall..."

if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp    # SSH
  ufw allow 80/tcp    # HTTP
  ufw allow 443/tcp   # HTTPS
  ufw --force enable
  ok "Firewall configured (22, 80, 443)"
else
  log "ufw not installed — configure firewall manually"
fi

# ─── Done ───────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Server setup complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Generate an SSH key pair for GitHub Actions:"
echo "     ssh-keygen -t ed25519 -C 'github-actions@deploy' -f deploy_key -N ''"
echo ""
echo "  2. Add the PUBLIC key to this server:"
echo "     cat deploy_key.pub >> /home/${DEPLOY_USER}/.ssh/authorized_keys"
echo ""
echo "  3. Add the PRIVATE key as a GitHub secret:"
echo "     Repository → Settings → Secrets → Actions"
echo "     Name: DEPLOY_SSH_PRIVATE_KEY"
echo "     Value: (contents of deploy_key)"
echo ""
echo "  4. Add other required secrets:"
echo "     DEPLOY_SSH_HOST   = $(hostname -I | awk '{print $1}')"
echo "     DEPLOY_SSH_USER   = ${DEPLOY_USER}"
echo "     DEPLOY_PATH       = ${DEPLOY_PATH}"
echo ""
echo "═══════════════════════════════════════════════════════════"
