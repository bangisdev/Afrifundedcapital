#!/usr/bin/env bash
#
# check-secrets.sh — fails CI if payment/email gateway secrets are committed.
#
# The check deliberately matches secret *values*, not env-var names: references
# like `process.env.FLW_SECRET_KEY` and `process.env.RESEND_API_KEY` appear
# all over the codebase legitimately, but a real Flutterwave secret starts with
# `FLWSECK`, and a real Resend API key starts with `re_` followed by 20+
# characters. We also flag hardcoded assignments of the secret env vars
# (`FLW_SECRET_KEY=…`) to catch real values pasted into config/example files
# even when they lack the usual key prefix.
#
# Deliberately skipped: `__tests__` directories — unit tests carry intentional
# MOCK credentials (e.g. payments.test.ts sets `FLW_SECRET_KEY =
# "FLWSECK_TEST-def456"`) precisely to verify that secrets are scrubbed from
# the DB and never rendered. Those are fake by design; GitHub's own secret
# scanning still covers test files for real keys.
#
# Run locally:  bun run check:secrets   (or: bash scripts/check-secrets.sh)
# Usage:        scripts/check-secrets.sh [dir]   (default: repo root)
#
# Exit codes:   0 = clean · 1 = secrets detected

set -u

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Vendored/build/runtime dirs, lockfiles, and intentional test mocks.
EXCLUDE_DIRS=(node_modules dist .git .e2e test-results playwright-report .vite __tests__)
EXCLUDE_FILES=(bun.lock package-lock.json)

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
# 3. Hardcoded secret env-var assignments: the value must start with an
#    alphanumeric/underscore and run 8+ non-space chars. This skips empty
#    assignments, `$VAR` indirections, quoted values, and `(placeholder)`
#    forms while still catching real-looking tokens (e.g. `FLW_SECRET_KEY=
#    8f3a9c2b7d1e4f5a6b7c8d9e0f1a2b3c`). Real keys are caught by patterns 1-2
#    even when quoted.
PATTERNS=(
  'FLWSECK[-_](TEST[-_])?[A-Za-z0-9]{8,}'
  're_[A-Za-z0-9]{24,}'
  '(FLW_SECRET_KEY|FLW_SECRET_HASH|RESEND_API_KEY|PAYSTACK_SECRET_KEY)[[:space:]]*=[[:space:]]*[[:alnum:]_][^[:space:]]{7,}'
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
exit 0
