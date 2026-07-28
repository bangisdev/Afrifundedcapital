#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — Certbot Renewal Script
# ═══════════════════════════════════════════════════════════════
#
# Run this script daily via cron to auto-renew certificates.
# Let's Encrypt recommends running renewal twice daily.
#
# Usage:
#   docker compose exec certbot /etc/certbot/renew.sh
#
# Cron schedule (add to crontab):
#   0 0,12 * * * /etc/certbot/renew.sh >> /var/log/certbot-renew.log 2>&1
#
# ═══════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "Certbot Renewal Check — $(date)"
echo "═══════════════════════════════════════════════════════════════"

# Attempt renewal
# --quiet: suppress output unless there are errors
# --no-self-upgrade: don't upgrade certbot itself
# --preferred-challenges http: use HTTP-01 challenge
certbot renew \
    --quiet \
    --no-self-upgrade \
    --deploy-hook "/etc/certbot/renewal-hook.sh"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "[OK] Renewal check completed successfully"
else
    echo "[ERROR] Renewal check failed with exit code $EXIT_CODE"
fi

# Show certificate expiry info
echo ""
echo "Certificate status:"
certbot certificates 2>/dev/null || echo "No certificates found"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Renewal check completed — $(date)"
echo "═══════════════════════════════════════════════════════════════"

exit $EXIT_CODE
