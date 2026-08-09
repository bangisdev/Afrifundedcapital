#!/usr/bin/env bash
#
# gitleaks-fixture.sh — smoke-test BOTH secret gates against a seeded fixture.
#
# Creates a temporary file containing realistic-looking secret values for every
# pattern that scripts/check-secrets.sh and .gitleaks.toml are supposed to
# catch, then asserts that:
#   1. `check-secrets` FAILS (exit 1) and its output contains the secret shapes
#   2. placeholders / metadata (e.g. `(production key)`, `SMTP_HOST =`) are NOT
#      flagged by either gate
#   3. gitleaks (if available) FAILS and fires ALL custom rules
#      (resend-api-key, afc-flutterwave-*, stripe-*, paystack-secret,
#      env-secret-assignment, afc-generic-api-key, private-key-block) — the
#      same shapes, so the two gates stay aligned.
#
# The fixture is generated at runtime from shell fragments (${hex}, ${tok}…)
# so this file itself never contains a value that would trip the gates — that
# is verified by the secrets-scan CI job scanning the whole repo. The fixture
# is written to `mktemp -d` and removed on exit.
#
# Usage:
#   bash scripts/gitleaks-fixture.sh            # run both gates
#   bash scripts/gitleaks-fixture.sh --keep     # keep the fixture dir (prints path)
#   bash scripts/gitleaks-fixture.sh --verbose  # print fixture + gate output
#   GITLEAKS_BIN=/path/to/gitleaks bash scripts/gitleaks-fixture.sh
#
# Exit codes:
#   0 = check-secrets asserted OK (gitleaks OK, or skipped if not installed)
#   1 = an assertion failed
#   2 = usage error

set -u

KEEP=0
VERBOSE=0
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    --verbose) VERBOSE=1 ;;
    -h|--help) sed -n '1,34p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg (see --help)" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITLEAKS_BIN="${GITLEAKS_BIN:-$(command -v gitleaks 2>/dev/null || true)}"

FIXTURE_DIR="$(mktemp -d)"
if [ "$KEEP" -eq 0 ]; then
  trap 'rm -rf "$FIXTURE_DIR"' EXIT
fi

fail=0

# ── Build the fixture (fragments only — this file must never self-trip) ────
hex1="8f3a9c2b7d1e4f5a6b7c8d9e0f1a2b3c"
hex2="2f3a9c2b7d1e4f5a6b7c8d9e0f1a2b3c4d5e6f"
tok1="aB3xQ9zL5mN7vR2tW8yK4cD6eF1hJ0gS"
tok2="m1t5-gateway-token-1234567890abcd"
sk="51H3xYz9qW4rT7yU1iP5oA8sD3fG6hJ0kL9zN2mQ"
pw="s3cr3t-mail-pass-2026"
hash="webhook-hash-token-2026-abcdef"
pem_type="RSA "

cat > "$FIXTURE_DIR/secrets.txt" <<EOF
re_${hex1}
FLWSECK-${hex1}
FLWSECK_TEST-${hex1}
JWT_PRIVATE_KEY=${hex1}9a8f7e6d
SMTP_PASSWORD=${pw}
"FLW_SECRET_HASH": "${hash}"
MT5_GATEWAY_API_KEY=${tok2}
"apiKey": "${tok1}"
sk_test_${tok1}
sk_live_${sk}
-----BEGIN ${pem_type}PRIVATE KEY-----
MIIEowIBAAKCAQEA7dGdXfZxQyV3kXpZmJmZqW4rT7yU1iP5oA8sD3fG6hJ0kL9zN2mQ==
-----END RSA PRIVATE KEY-----
FLWPUBK_TEST-${hex2}
FLWPUBK-${hex2}
pk_live_${hex2}
FLW_SECRET_KEY = (production key)
SMTP_HOST = smtp.example.com
EOF

if [ "$VERBOSE" -eq 1 ]; then
  echo "── fixture ($FIXTURE_DIR/secrets.txt) ──"
  cat -n "$FIXTURE_DIR/secrets.txt"
fi

# ── Gate 1: check-secrets must trip (exit 1) and flag the secret lines ─────
cs_out="$(bash "$ROOT/scripts/check-secrets.sh" "$FIXTURE_DIR" 2>&1)"
cs_rc=$?
if [ "$cs_rc" -eq 1 ]; then
  echo "✅ check-secrets tripped (exit 1)"
else
  echo "❌ check-secrets: expected exit 1, got $cs_rc" >&2
  fail=1
fi

for shape in 'FLWSECK' 'JWT_PRIVATE_KEY' 'SMTP_PASSWORD' 'apiKey' 'sk_live_' 'PRIVATE KEY' 're_'; do
  if echo "$cs_out" | grep -qF -- "$shape"; then
    :
  else
    echo "❌ check-secrets output missing shape: $shape" >&2
    fail=1
  fi
done

for clean in '(production key)' 'SMTP_HOST ='; do
  if echo "$cs_out" | grep -qF -- "$clean"; then
    echo "❌ check-secrets flagged a placeholder: $clean" >&2
    fail=1
  fi
done

if [ "$VERBOSE" -eq 1 ]; then echo "$cs_out"; fi

# ── Gate 2: gitleaks (if available) must trip and fire all custom rules ────
if [ -n "$GITLEAKS_BIN" ]; then
  gl_out="$("$GITLEAKS_BIN" dir "$FIXTURE_DIR" --config "$ROOT/.gitleaks.toml" \
    --report-format json --report-path "$FIXTURE_DIR/report.json" 2>&1)"
  gl_rc=$?
  if [ "$gl_rc" -eq 1 ]; then
    echo "✅ gitleaks tripped (exit 1)"
  else
    echo "❌ gitleaks: expected exit 1, got $gl_rc" >&2
    fail=1
  fi

  if command -v python3 >/dev/null 2>&1; then
    fired="$(python3 - "$FIXTURE_DIR/report.json" <<'PY'
import json, sys
print(" ".join(sorted({f["RuleID"] for f in json.load(open(sys.argv[1]))})))
PY
)"
    bad_lines="$(python3 - "$FIXTURE_DIR/report.json" <<'PY'
import json, sys
print(" ".join(str(f["StartLine"]) for f in json.load(open(sys.argv[1])) if f["StartLine"] in (17, 18)))
PY
)"
  else
    fired="$(grep -o '"RuleID":"[^"]*"' "$FIXTURE_DIR/report.json" | cut -d'"' -f4 | sort -u | tr '\n' ' ')"
    bad_lines="$(grep -o '"StartLine":[0-9]*' "$FIXTURE_DIR/report.json" | grep -E ':(17|18)$' | tr '\n' ' ')"
  fi

  expected="resend-api-key afc-flutterwave-secret-key afc-flutterwave-public-key stripe-live-secret stripe-live-public paystack-secret env-secret-assignment afc-generic-api-key private-key-block"
  missing=""
  for r in $expected; do
    case " $fired " in
      *" $r "*) ;;
      *) missing="$missing $r" ;;
    esac
  done
  if [ -n "$missing" ]; then
    echo "❌ gitleaks rules not fired:$missing" >&2
    fail=1
  else
    echo "✅ gitleaks fired all custom rules"
  fi

  if [ -n "$bad_lines" ]; then
    echo "❌ gitleaks flagged placeholder lines:$bad_lines" >&2
    fail=1
  else
    echo "✅ gitleaks ignored placeholders"
  fi

  if [ "$VERBOSE" -eq 1 ]; then echo "$gl_out"; fi
else
  echo "ℹ️  gitleaks not found — skipping gate 2 (install it or set GITLEAKS_BIN)"
fi

if [ "$KEEP" -eq 1 ]; then
  echo "ℹ️  fixture kept at $FIXTURE_DIR"
fi

if [ "$fail" -ne 0 ]; then
  echo "❌ fixture assertions failed" >&2
  exit 1
fi
echo "✅ fixture passed both gates"
exit 0
