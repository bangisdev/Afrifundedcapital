#!/usr/bin/env bash
#
# check-secrets.sh — fails CI if payment/email/gateway secrets are committed.
#
# The check deliberately matches secret *values*, not env-var names: references
# like `process.env.FLW_SECRET_KEY` and `process.env.RESEND_API_KEY` appear
# all over the codebase legitimately, but a real Flutterwave secret starts with
# `FLWSECK`, and a real Resend API key starts with `re_` followed by 24+
# characters. We also flag hardcoded assignments of secret env vars
# (`FLW_SECRET_KEY=…`, `SMTP_PASSWORD=…`, `JWT_PRIVATE_KEY=…`,
# `MT5_GATEWAY_API_KEY=…`) and hardcoded MT5 gateway `apiKey` fields to catch
# real values pasted into config/example files. Assignment patterns accept
# `.env` (`KEY=value`), YAML (`key: value`) and JSON (`"KEY": "value"`)
# quoting forms.
#
# Kept in sync with .gitleaks.toml (the pre-commit gate run by
# .github/workflows/secret-scan.yml): same value thresholds, assignment names
# and exclusions. gitleaks is deliberately the stricter superset — it also
# flags public keys (FLWPUBK, pk_live_) and generic api/secret-key
# assignments; this script intentionally ignores those to stay deterministic.
# When adding a pattern here, mirror it in .gitleaks.toml (and vice versa),
# then update the README Security section.
#
# What is deliberately NOT flagged:
#   - SMTP_HOST / SMTP_PORT / SMTP_USER — connection metadata, not secrets.
#   - Public keys (FLWPUBK-*, pk_live_*) — not secrets; gitleaks flags them
#     for completeness but this gate deliberately does not.
#   - `__tests__` directories — unit tests carry intentional MOCK credentials
#     (e.g. payments.test.ts sets `FLW_SECRET_KEY = "<your-key>"`) precisely
#     to verify that secrets are scrubbed from the DB and never rendered.
#     Those are fake by design; GitHub's own secret scanning still covers
#     test files for real keys.
#
# Run locally:  bun run check:secrets   (or: bash scripts/check-secrets.sh)
# Usage:        scripts/check-secrets.sh [dir]   (default: repo root)
#
# When scanning the repo itself (no [dir] argument), stage 2 also runs
# scripts/check-alignment.sh so one command verifies both the working tree
# and that .gitleaks.toml / this script haven't drifted apart.
#
# Exit codes:   0 = clean (and, for the repo scan, configs aligned)
#               1 = secrets detected · config drift (repo scan only)

set -u

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Vendored/build/runtime dirs, lockfiles, and intentional test mocks.
EXCLUDE_DIRS=(node_modules dist .git .e2e test-results playwright-report .vite __tests__)
EXCLUDE_FILES=(bun.lock package-lock.json afrifundedcapital.db*)

exclude_args=()
for d in "${EXCLUDE_DIRS[@]}"; do
  exclude_args+=(--exclude-dir="$d")
done
for f in "${EXCLUDE_FILES[@]}"; do
  exclude_args+=(--exclude="$f")
done

# ── Patterns ─────────────────────────────────────────────────────────────
# Values only — docs/comments that merely *name* the env vars or describe the
# key formats (e.g. "FLWSECK-*", "re_* keys", "FLW_SECRET_KEY = (production
# key)") must not trip the gate.
# 1. Flutterwave secret keys — FLWSECK-<token> (live) or FLWSECK_TEST-<token>
#    (test). The public key prefix FLWPUBK is safe and deliberately not
#    matched.
# 2. Resend API keys — `re_` + 24+ alphanumeric characters.
# 3. Hardcoded secret env-var assignments: optional quotes around the name
#    (JSON/YAML), a `=` or `:` separator, an optional opening quote, then a
#    value starting with an alphanumeric/underscore and running 8+ non-space
#    chars. This skips empty assignments, `$VAR` indirections,
#    `(placeholder)` forms and quoted values like `""` while still catching
#    real-looking tokens (e.g. `JWT_PRIVATE_KEY=<your-token>`,
#    `"SMTP_PASSWORD": "<your-token>"`). Real Flutterwave/Resend keys are
#    caught by patterns 1-2 even when quoted.
# 4. MT5 gateway `apiKey` field — a hardcoded token (16+ alnum / `-` / `_`,
#    optionally quoted, with optional quotes around the field name for JSON)
#    assigned via `:` or `=`. The 16+ token rule skips code expressions
#    (`apiKey: typeof body.apiKey === "string" ? …`, `cfg.apiKey`,
#    `apiKey: e.target.value`), type declarations (`apiKey: string;`), empty
#    defaults, and derived fields like `apiKeyLast4` / `hasApiKey`.
# 5. Private-key PEM blocks — `-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE
#    KEY-----` (mirrors the gitleaks `private-key-block` rule). A committed
#    private key is a credential no matter which service it belongs to.
# 6. Paystack / Stripe secret values — `sk_live_…` / `sk_test_…` + 16+ chars
#    (mirrors the gitleaks `paystack-secret` / `stripe-live-secret` rules).
#    Public keys (`pk_live_`, `FLWPUBK`) are deliberately not matched.
PATTERNS=(
  'FLWSECK[-_](TEST[-_])?[A-Za-z0-9]{8,}'
  're_[A-Za-z0-9]{24,}'
  '["'"'"']?(FLW_SECRET_KEY|FLW_SECRET_HASH|RESEND_API_KEY|PAYSTACK_SECRET_KEY|JWT_PRIVATE_KEY|SMTP_PASS|SMTP_PASSWORD|MT5_API_KEY|MT5_GATEWAY_API_KEY)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?[[:alnum:]_][^[:space:]]{7,}'
  '["'"'"']?apiKey["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_-]{16,}'
  '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'
  'sk_(live|test)_[A-Za-z0-9]{16,}'
)

# Build explicit `-e pattern` pairs — `"${ARRAY[@]/#/-e }"` would glue the
# `-e ` prefix onto the same argv token, making every pattern start with a
# space and silently missing values at the start of a line.
grep_args=()
for p in "${PATTERNS[@]}"; do
  grep_args+=(-e "$p")
done

matches=$(grep -rnIE -I "${exclude_args[@]}" "${grep_args[@]}" "$ROOT" 2>/dev/null) || true

if [[ -n "$matches" ]]; then
  echo "❌ Gateway secrets detected in the working tree:" >&2
  echo >&2
  echo "$matches" >&2
  echo >&2
  echo "Remove the secret values and use environment variables instead" >&2
  echo "(see README → Environment Variables; set keys in the Keys/API keys tab)." >&2
  exit 1
fi

echo "✅ No gateway secrets found in the working tree."

# Stage 2 — config alignment: only when scanning the repo itself (no [dir]
# argument, i.e. the `bun run check:secrets` path and CI). Fixture runs pass
# a dir and are expected to trip stage 1, so alignment is skipped there.
if [[ $# -eq 0 ]]; then
  if ! bash "$(dirname "${BASH_SOURCE[0]}")/check-alignment.sh"; then
    exit 1
  fi
fi
exit 0
