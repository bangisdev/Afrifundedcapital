#!/usr/bin/env bash
#
# check-alignment.sh — asserts .gitleaks.toml and scripts/check-secrets.sh stay
# aligned so the two secret gates cover the same shapes. Fails CI on drift.
#
# Alignment contract (see .gitleaks.toml header and README → Security):
#   1. The same 9 hardcoded env-var names are tracked by both gates.
#   2. Shared value-shape regexes (Flutterwave, Resend, Paystack/Stripe sk_,
#      PEM private keys) are byte-identical in both files.
#   3. Token thresholds match: 16+ for apiKey / sk_, 8+ env-var values.
#   4. Every check-secrets exclusion has a gitleaks allowlist counterpart
#      (.git is excluded by check-secrets and handled by gitleaks' built-in
#      default allowlist, so it is not asserted here).
#   5. Documented divergence: gitleaks flags public keys (FLWPUBK / pk_live_);
#      check-secrets deliberately does not.
#
# Usage:
#   bash scripts/check-alignment.sh                     # repo files
#   bash scripts/check-alignment.sh <cs.sh> <toml>      # explicit paths (tests)
#
# Exit codes: 0 = aligned · 1 = drift detected

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CS="${1:-$ROOT/scripts/check-secrets.sh}"
GL="${2:-$ROOT/.gitleaks.toml}"

fail=0

# Extract the regex of a gitleaks rule by id (the line `regex = '''...'''`).
rule_regex() { # $1 = file, $2 = rule id
  awk -v id="$2" 'index($0, "id = \"" id "\"") { seen=1 } seen && /^regex = / { print; exit }' "$1" \
    | sed -n "s/^regex = '''\(.*\)'''$/\1/p"
}

# ── 1. env-var name list parity ────────────────────────────────────────────
expected="FLW_SECRET_HASH
FLW_SECRET_KEY
JWT_PRIVATE_KEY
MT5_API_KEY
MT5_GATEWAY_API_KEY
PAYSTACK_SECRET_KEY
RESEND_API_KEY
SMTP_PASS
SMTP_PASSWORD"

cs_names="$(sed -n '/^PATTERNS=(/,/^)/p' "$CS" | grep -oE '\([^)]*FLW_SECRET_KEY[^)]*\)' | head -1 | tr -d '()' | tr '|' '\n' | sort)"
gl_names="$(rule_regex "$GL" "env-secret-assignment" | grep -oE '\([^)]*FLW_SECRET_KEY[^)]*\)' | tr -d '()' | tr '|' '\n' | sort)"

if [ "$cs_names" != "$expected" ]; then
  echo "❌ check-secrets env-var name list drifted:" >&2
  diff <(printf '%s\n' "$expected") <(printf '%s\n' "$cs_names") >&2 || true
  fail=1
fi
if [ "$gl_names" != "$expected" ]; then
  echo "❌ gitleaks env-secret-assignment name list drifted:" >&2
  diff <(printf '%s\n' "$expected") <(printf '%s\n' "$gl_names") >&2 || true
  fail=1
fi

# ── 2. shared value-shape regex parity ─────────────────────────────────────
while IFS=':' read -r cs_lit gl_id; do
  [ -n "$cs_lit" ] || continue
  cs_v="$(grep -oF -- "$cs_lit" "$CS" | head -1)"
  gl_v="$(rule_regex "$GL" "$gl_id")"
  if [ -z "$cs_v" ]; then
    echo "❌ check-secrets missing pattern: $cs_lit" >&2
    fail=1
  elif [ "$cs_v" != "$gl_v" ]; then
    echo "❌ pattern drift for $gl_id:" >&2
    echo "   check-secrets: $cs_v" >&2
    echo "   gitleaks:      $gl_v" >&2
    fail=1
  fi
done <<'PATTERNS'
FLWSECK[-_](TEST[-_])?[A-Za-z0-9]{8,}:afc-flutterwave-secret-key
re_[A-Za-z0-9]{24,}:resend-api-key
sk_(live|test)_[A-Za-z0-9]{16,}:paystack-secret
-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----:private-key-block
PATTERNS

# ── 3. apiKey / generic threshold parity (16+ token) ───────────────────────
if sed -n '/^PATTERNS=(/,/^)/p' "$CS" | grep -F 'apiKey' | grep -q '{16,}'; then
  :
else
  echo "❌ check-secrets apiKey pattern must require a 16+ token" >&2
  fail=1
fi
if rule_regex "$GL" "afc-generic-api-key" | grep -q '{16,}'; then
  :
else
  echo "❌ gitleaks afc-generic-api-key must require a 16+ token" >&2
  fail=1
fi

# ── 4. exclusion parity ────────────────────────────────────────────────────
gl_allow="$(sed -n '/^\[allowlist\]/,$p' "$GL")"
while IFS='|' read -r cs_tok gl_tok; do
  [ -n "$cs_tok" ] || continue
  if ! grep -qF -- "$cs_tok" "$CS"; then
    echo "❌ check-secrets missing exclusion: $cs_tok" >&2
    fail=1
  fi
  if ! printf '%s\n' "$gl_allow" | grep -qF -- "$gl_tok"; then
    echo "❌ gitleaks allowlist missing counterpart for: $gl_tok" >&2
    fail=1
  fi
done <<'EXCLUSIONS'
node_modules|node_modules/
dist|dist/
.e2e|\.e2e/
test-results|test-results/
playwright-report|playwright-report/
.vite|\.vite/
__tests__|__tests__/
bun.lock|bun\.lock
package-lock.json|package-lock\.json
EXCLUSIONS

# ── 5. documented divergence: public keys ──────────────────────────────────
if sed -n '/^PATTERNS=(/,/^)/p' "$CS" | grep -q 'FLWPUBK'; then
  echo "❌ check-secrets must NOT match public keys (FLWPUBK) — deliberate divergence" >&2
  fail=1
fi
if rule_regex "$GL" "afc-flutterwave-public-key" | grep -q 'FLWPUBK'; then
  :
else
  echo "❌ gitleaks missing public-key rule afc-flutterwave-public-key" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "❌ secret gates are out of sync — update .gitleaks.toml and scripts/check-secrets.sh together" >&2
  exit 1
fi
echo "✅ secret gates aligned (.gitleaks.toml ↔ scripts/check-secrets.sh)"
exit 0
