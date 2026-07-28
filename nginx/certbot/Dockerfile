# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — Certbot Docker Image
# ═══════════════════════════════════════════════════════════════
#
# Lightweight certbot image with:
#   • Automatic certificate renewal via cron
#   • Nginx reload hook after renewal
#   • HTTP-01 challenge support
#
# ═══════════════════════════════════════════════════════════════

FROM certbot/certbot:latest

# Install curl for health checks and hook scripts
RUN apk add --no-cache curl bash

# Create directories for certificates and challenges
RUN mkdir -p /etc/letsencrypt /var/www/certbot /var/log/letsencrypt

# Copy renewal hook script
COPY nginx/certbot/renewal-hook.sh /etc/certbot/renewal-hook.sh
RUN chmod +x /etc/certbot/renewal-hook.sh

# Copy renewal script
COPY nginx/certbot/renew.sh /etc/certbot/renew.sh
RUN chmod +x /etc/certbot/renew.sh

# Copy crontab for auto-renewal
COPY nginx/certbot/crontab /etc/crontabs/root

# Create log directory
RUN mkdir -p /var/log/certbot

# Expose ports (certbot doesn't serve, but keeps container alive)
# The actual ACME challenges are served by nginx

# Default command: run crond in foreground
CMD ["crond", "-f", "-l", "2"]
