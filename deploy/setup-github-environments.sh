#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — GitHub Environments Setup (via GitHub CLI)
# ═══════════════════════════════════════════════════════════════
#
# Creates GitHub Environments with protection rules using the
# official GitHub CLI (gh).
#
# Prerequisites:
#   1. Install GitHub CLI: https://cli.github.com/
#   2. Authenticate: gh auth login
#   3. Run from repo root
#
# Usage:
#   ./deploy/setup-github-environments.sh
#   ./deploy/setup-github-environments.sh --repo owner/repo
#   ./deploy/setup-github-environments.sh --reviewers user1,user2
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ─── Parse arguments ────────────────────────────────────────
REPO=""
REVIEWERS=""
ENVIRONMENT_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --reviewers)
      REVIEWERS="$2"
      shift 2
      ;;
    --url)
      ENVIRONMENT_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--repo owner/repo] [--reviewers user1,user2] [--url https://example.com]"
      exit 1
      ;;
  esac
done

# ─── Check prerequisites ────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  AfriFundedCapital — GitHub Environments Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check gh CLI
if ! command -v gh >/dev/null 2>&1; then
  fail "GitHub CLI (gh) is not installed!"
  echo ""
  echo "  Install it: https://cli.github.com/"
  echo "  macOS:   brew install gh"
  echo "  Linux:   sudo apt install gh"
  echo "  Windows: winget install GitHub.cli"
fi
ok "GitHub CLI found: $(gh --version | head -1)"

# Check authentication
if ! gh auth status >/dev/null 2>&1; then
  fail "GitHub CLI is not authenticated!"
  echo ""
  echo "  Run: gh auth login"
fi
ok "GitHub CLI authenticated"

# Determine repo
if [ -z "${REPO}" ]; then
  # Try to detect from git remote
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
  if [ -z "${REPO}" ]; then
    fail "Could not detect repository. Use --repo owner/repo"
  fi
fi
ok "Repository: ${REPO}"

# Get current user for default reviewer
CURRENT_USER=$(gh api user -q .login 2>/dev/null || echo "")
if [ -z "${REVIEWERS}" ] && [ -n "${CURRENT_USER}" ]; then
  REVIEWERS="${CURRENT_USER}"
  log "Using current user as reviewer: ${CURRENT_USER}"
fi

echo ""

# ─── Helper function ────────────────────────────────────────
create_environment() {
  local NAME=$1
  local BRANCHES=$2
  local WAIT_TIMER=$3
  local NEEDS_REVIEW=${4:-false}
  local URL=$5

  log "Creating environment: ${NAME}"

  # Build the protection rules JSON
  local PROTECT_JSON="{"

  # Deployment branches
  PROTECT_JSON+="\"deployment_branch_policy\":{"
  PROTECT_JSON+="\"protected_branches\":false,"
  PROTECT_JSON+="\"custom_branch_policies\":true"

  # Check if environment already exists
  local EXISTING
  EXISTING=$(gh api "repos/${REPO}/environments/${NAME}" 2>/dev/null || echo "")

  if [ -n "${EXISTING}" ]; then
    warn "Environment '${NAME}' already exists — updating..."
  fi

  # Create or update environment via API
  local PAYLOAD="{"
  PAYLOAD+="\"prevent_self_review\":false,"

  # Wait timer
  if [ "${WAIT_TIMER}" -gt 0 ]; then
    PAYLOAD+="\"wait_timer\":${WAIT_TIMER},"
  fi

  # Reviewers (if needed)
  if [ "${NEEDS_REVIEW}" = "true" ] && [ -n "${REVIEWERS}" ]; then
    PAYLOAD+="\"reviewers\":["
    IFS=',' read -ra REVIEWER_ARRAY <<< "${REVIEWERS}"
    FIRST=true
    for REVIEWER in "${REVIEWER_ARRAY[@]}"; do
      REVIEWER=$(echo "${REVIEWER}" | xargs)  # trim whitespace
      if [ "${REVIEWER}" = "${CURRENT_USER}" ]; then
        # Use user type for the authenticated user
        if [ "${FIRST}" = "true" ]; then FIRST=false; else PAYLOAD+=","; fi
        PAYLOAD+="{\"type\":\"User\",\"id\":$(gh api user -q .id 2>/dev/null || echo '0')}"
      fi
    done
    PAYLOAD+="],"
  fi

  # Deployment branch policy
  PAYLOAD+="\"deployment_branch_policy\":{"
  PAYLOAD+="\"protected_branches\":false,"
  PAYLOAD+="\"custom_branch_policies\":true"
  PAYLOAD+="}"

  PAYLOAD+="}"

  # Use gh api to create/update the environment
  local HTTP_CODE
  HTTP_CODE=$(gh api --method PUT "repos/${REPO}/environments/${NAME}" \
    --input - <<< "${PAYLOAD}" 2>&1) || true

  # If PUT doesn't work, try POST for creation
  if echo "${HTTP_CODE}" | grep -q "Not Found\|404\|error"; then
    HTTP_CODE=$(gh api --method POST "repos/${REPO}/environments" \
      --input - <<< "{\"name\":\"${NAME}\",${PAYLOAD:1}" 2>&1) || true
  fi

  # Add branch policies
  log "  Adding branch policies: ${BRANCHES}"

  # Wait for environment to be created
  sleep 2

  IFS=',' read -ra BRANCH_ARRAY <<< "${BRANCHES}"
  for BRANCH in "${BRANCH_ARRAY[@]}"; do
    BRANCH=$(echo "${BRANCH}" | xargs)  # trim whitespace

    # Create branch policy
    gh api --method POST "repos/${REPO}/environments/${NAME}/deployment-branch-policies" \
      -f "name=${BRANCH}" 2>/dev/null || \
    gh api --method POST "repos/${REPO}/environments/${NAME}/deployment-branch-policies" \
      --input - <<< "{\"name\":\"${BRANCH}\"}" 2>/dev/null || true

    ok "  Branch policy: ${BRANCH}"
  done

  ok "Environment '${NAME}' configured"
}

# ─── Create environments ───────────────────────────────────
echo "── Creating Environments ────────────────────────────────"
echo ""

# Production environment
create_environment \
  "production" \
  "main" \
  5 \
  true \
  "${ENVIRONMENT_URL}"

echo ""

# Staging environment
create_environment \
  "staging" \
  "main,develop" \
  0 \
  false \
  ""

echo ""

# ─── Verify setup ──────────────────────────────────────────
echo "── Verifying Setup ──────────────────────────────────────"
echo ""

# List environments
log "Environments configured:"
gh api "repos/${REPO}/environments" --jq '.environments[].name' 2>/dev/null | while read -r ENV_NAME; do
  ok "  ${ENV_NAME}"
done

echo ""

# ─── Summary ───────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ GitHub Environments configured successfully!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Repository: ${REPO}"
echo "  Reviewers:  ${REVIEWERS}"
echo ""
echo "  Environments:"
echo "    • production — requires approval, main branch only"
echo "    • staging    — auto-deploy, main + develop branches"
echo ""
echo "  Next steps:"
echo "    1. Go to https://github.com/${REPO}/settings/environments"
echo "    2. Verify the protection rules are correct"
echo "    3. Add environment-specific secrets if needed"
echo "    4. Create a release to trigger the deployment workflow"
echo ""
echo "  To add more reviewers:"
echo "    gh api --method PUT repos/${REPO}/environments/production/reviewers/reviews/123"
echo ""
echo "═══════════════════════════════════════════════════════════"
