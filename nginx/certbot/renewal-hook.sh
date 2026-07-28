#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — Certbot Renewal Hook
# ═══════════════════════════════════════════════════════════════
#
# This script is executed by certbot after successful certificate
# renewal. It reloads nginx to pick up the new certificates.
#
# ═══════════════════════════════════════════════════════════════

set -e

echo "[Certbot] Certificate renewed successfully"
echo "[Certbot] Reloading nginx..."

# Send SIGHUP to nginx to gracefully reload configuration
# This works with the nginx container's PID 1
nginx -s reload 2>/dev/null || {
    # If nginx command fails (running in separate container),
    # send signal to nginx master process
    if [ -f /var/run/nginx.pid ]; then
        kill -HUP $(cat /var/run/nginx.pid)
    fi
}

echo "[Certbot] Nginx reloaded successfully"
