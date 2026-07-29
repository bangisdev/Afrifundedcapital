# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — GitHub Environments Setup Guide
# ═══════════════════════════════════════════════════════════════
#
# This guide explains how to configure GitHub Environments with
# protection rules for secure deployments.
#
# Quick Setup (GitHub CLI):
#   ./deploy/setup-github-environments.sh
#
# Manual Setup:
#   Follow the steps below in your GitHub repository settings.
#
# ═══════════════════════════════════════════════════════════════

## Overview

GitHub Environments allow you to:
- Require manual approval before deploying to production
- Limit which branches can deploy to each environment
- Set deployment timeouts
- Track deployment history
- Use environment-specific secrets

## Recommended Environment Configuration

### 1. Production Environment

**Purpose:** Live production server

| Setting | Value |
|---------|-------|
| **Deployment branches** | `main` only |
| **Required reviewers** | 1+ team members |
| **Wait timer** | 5 minutes (optional) |
| **Branches allowed** | `main` |

**Protection Rules:**
- ✅ Required reviewers (at least 1)
- ✅ Wait timer: 5 minutes
- ✅ Restrict to `main` branch

### 2. Staging Environment

**Purpose:** Pre-production testing

| Setting | Value |
|---------|-------|
| **Deployment branches** | `main`, `develop` |
| **Required reviewers** | None (auto-deploy) |
| **Wait timer** | None |
| **Branches allowed** | `main`, `develop` |

**Protection Rules:**
- ✅ Restrict to `main` and `develop` branches
- ❌ No required reviewers (faster iteration)

## Step-by-Step Manual Setup

### Step 1: Create Production Environment

1. Go to your repository on GitHub
2. Click **Settings** → **Environments**
3. Click **New environment**
4. Name it: `production`
5. Click **Configure environment**

### Step 2: Configure Production Protection Rules

1. Under **Protection rules**, click **Add rule**
2. Set:
   - **Deployment branches**: Add rule → "Selected branches" → Add `main`
   - **Required reviewers**: Add yourself and any team members
   - **Wait timer**: 5 minutes (gives time to cancel if needed)
3. Click **Save protection rules**

### Step 3: Add Environment Secrets (Optional)

Under **Environment secrets**, add production-specific secrets:
- `DEPLOY_SSH_HOST` — Production server IP
- `DEPLOY_SSH_USER` — SSH username
- `DEPLOY_SSH_PRIVATE_KEY` — SSH private key
- `DEPLOY_PATH` — Path to docker-compose.yml on server

> **Note:** Environment secrets override repository secrets for the same name.

### Step 4: Create Staging Environment

1. Click **New environment** again
2. Name it: `staging`
3. Configure:
   - **Deployment branches**: `main`, `develop`
   - **Required reviewers**: None (or add for extra safety)
4. Click **Save protection rules**

## GitHub CLI Setup (Automated)

If you have the GitHub CLI installed, run:

```bash
# Install GitHub CLI (if not installed)
# macOS: brew install gh
# Linux: sudo apt install gh

# Authenticate
gh auth login

# Run the setup script
./deploy/setup-github-environments.sh
```

The script will:
1. Create the `production` environment with protection rules
2. Create the `staging` environment
3. Add required reviewers (your GitHub username)
4. Configure deployment branch restrictions

## How Protection Rules Work

### Approval Flow

```
1. Developer pushes to main
2. Docker Publish workflow builds image
3. Deploy workflow triggers
4. GitHub shows "Waiting for review" ⏳
5. Reviewer approves ✅ (or rejects ❌)
6. Deployment proceeds (or stops)
```

### Branch Restrictions

| Environment | Allowed Branches | Auto-deploy |
|-------------|------------------|-------------|
| production | `main` only | After approval |
| staging | `main`, `develop` | Auto or manual |
| development | All branches | Manual only |

### Deployment History

Each environment maintains a deployment history:
- Who triggered it
- When it was approved
- Which commit was deployed
- Rollback capability

## Environment-Specific Secrets

You can use different secrets for each environment:

```
Repository Secrets (shared):
├── DEPLOY_SSH_PRIVATE_KEY
├── FLW_PUBLIC_KEY
└── RESEND_API_KEY

Production Environment Secrets:
├── DEPLOY_SSH_HOST = 203.0.113.50
├── DEPLOY_PATH = /opt/afrifundedcapital
└── FLW_SECRET_KEY = (production key)

Staging Environment Secrets:
├── DEPLOY_SSH_HOST = 198.51.100.25
├── DEPLOY_PATH = /opt/afrifundedcapital-staging
└── FLW_SECRET_KEY = (test key)
```

## Best Practices

1. **Always require reviewers for production**
   - At least 1 reviewer
   - Use a different person than the deployer

2. **Use wait timers for production**
   - 5 minutes gives time to cancel accidental deploys
   - Use 0 for staging (faster iteration)

3. **Restrict branches**
   - Production: `main` only
   - Staging: `main`, `develop`
   - Development: All branches

4. **Use environment secrets**
   - Keep production secrets separate
   - Use test keys for staging

5. **Monitor deployment history**
   - Check the Environments tab regularly
   - Review who deployed what and when

## Troubleshooting

### "Waiting for review" but no reviewers configured

**Solution:** Add yourself as a required reviewer in the environment settings.

### Deployment blocked on branch protection

**Solution:** Ensure the deployment branch matches the environment's allowed branches.

### Secrets not available in deployment

**Solution:** Check that secrets are added to the correct environment, not just the repository.

### Approval not working

**Solution:** Ensure the reviewer has at least "Triage" permission on the repository.

## Resources

- [GitHub Environments Documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [Deployment Protection Rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#deployment-protection-rules)
- [Environment Secrets](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#using-environments-for-protection-rules)

---

**Questions?** Check the GitHub Actions logs or open an issue in the repository.
