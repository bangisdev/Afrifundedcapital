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
├── RESEND_API_KEY
├── JWT_PRIVATE_KEY
└── SMTP_PASSWORD

Production Environment Secrets:
├── DEPLOY_SSH_HOST = 203.0.113.50
├── DEPLOY_PATH = /opt/afrifundedcapital
├── FLW_SECRET_KEY = (production key)
└── MT5_GATEWAY_API_KEY = (production gateway key)

Staging Environment Secrets:
├── DEPLOY_SSH_HOST = 198.51.100.25
├── DEPLOY_PATH = /opt/afrifundedcapital-staging
├── FLW_SECRET_KEY = (test key)
└── MT5_GATEWAY_API_KEY = (test gateway key)
```

### Additional Secrets Reference

| Secret | Notes |
| --- | --- |
| `JWT_PRIVATE_KEY` | Signing key consumed by the auth layer via the Convex environment. For platform-managed deployments this is set automatically; provide it here only if you self-host the auth layer. |
| `APP_SECRETS_KEY` | Master key for the **runtime secret override store** (Admin → Settings → gateway keys). Encrypts admin-updated keys (`FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `RESEND_API_KEY`) at rest with AES-256-GCM. Optional — falls back to `JWT_PRIVATE_KEY`; without either, overrides are encrypted with an ephemeral key and lost on restart (the settings page warns). |
| `SMTP_PASSWORD` (or `SMTP_PASS`) | Reserved for SMTP relay should you add one for transactional email (email currently goes through Resend — see `RESEND_API_KEY`). `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` are connection metadata, not secrets, and may be set as plain variables. |
| `MT5_GATEWAY_API_KEY` (or `MT5_API_KEY`) | The runtime MT5 gateway credentials (base URLs, API key, manager login/password) are entered in **Admin → MT5** and stored encrypted in the settings table — no env var is read at runtime. These env names exist for the CI secrets scan: committing a hardcoded value here (or anywhere) fails the `check:secrets` job. Keep them empty/unset unless you intentionally use env-driven provisioning. |

> **Runtime-managed secrets (Admin → Settings):** gateway keys (`FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `RESEND_API_KEY`) can be updated in-app from **Admin → Settings** — stored encrypted at rest under `secret_override:*` in the settings table and taking precedence over the env vars above until cleared (`DELETE` falls back to env). Admin-only, audit-logged (`secrets.updated` / `secrets.cleared`, values never written to the trail), with other admins alerted. Set `APP_SECRETS_KEY` to make updates permanent across restarts.
>
> **Placeholder convention:** always use `(production key)` / `(test key)` style placeholders in documentation — a real-looking value anywhere in the repo fails CI. The `check:secrets` scan (`.github/workflows/e2e.yml` and `e2e-matrix.yml` → `secrets-scan` job, `scripts/check-secrets.sh`) fails the build if committed values match Flutterwave `FLWSECK-*`, Resend `re_*`, Paystack/Stripe `sk_*`, hardcoded SMTP/JWT/MT5 assignments (`JWT_PRIVATE_KEY`, `SMTP_PASS`/`SMTP_PASSWORD`, `MT5_API_KEY`/`MT5_GATEWAY_API_KEY`, MT5 `apiKey` fields), or PEM private keys.
>
> **gitleaks alignment:** the same patterns are enforced pre-commit by gitleaks (`.gitleaks.toml`, run in `.github/workflows/secret-scan.yml`) — keep the two configs in sync when adding a rule. gitleaks is deliberately the stricter superset: it additionally flags public keys (`FLWPUBK-*`, `pk_live_*`) and generic `api_key` / `secret_key` assignments, so the `(placeholder)` convention applies to code comments and docs as well.
>
> **One-command gate:** `bun run check:secrets` (or `bash scripts/check-secrets.sh`) is the single local command — stage 1 scans the working tree and, when scanning the repo itself (no target dir), stage 2 verifies `.gitleaks.toml` ↔ `scripts/check-secrets.sh` are still aligned. Exit `0` means clean *and* aligned. Two companion checks complete the picture:
>
> - `bun run test:secrets-fixture` — generates a temp fixture covering every shape both gates must catch and asserts `check:secrets` trips on the secrets while ignoring placeholders; with gitleaks installed (or `GITLEAKS_BIN` set) it also asserts all nine custom gitleaks rules fire.
> - `bun run test:secrets-alignment` — the static sync check on its own (identical env-var names, byte-identical shared regexes, matching thresholds and exclusions).
>
> CI runs these automatically: the `secrets-scan` job (`e2e.yml` / `e2e-matrix.yml`) runs `check:secrets` plus the fixture, and the `Secret Scan` workflow (`secret-scan.yml`) runs gitleaks on the repo plus the fixture against the real binary. Run the one-command gate after touching `scripts/check-secrets.sh` or `.gitleaks.toml`.


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
