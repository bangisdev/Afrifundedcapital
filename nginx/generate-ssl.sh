#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — SSL Certificate Generator
# ═══════════════════════════════════════════════════════════════
#
# Generates SSL certificates for development or production.
#
# Usage:
#   ./nginx/generate-ssl.sh                         # Self-signed for localhost
#   ./nginx/generate-ssl.sh your-domain.com         # Self-signed for domain
#   ./nginx/generate-ssl.sh --letsencrypt domain.com # Let's Encrypt (production)
#   ./nginx/generate-ssl.sh --letsencrypt-status    # Check Let's Encrypt status
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Let's Encrypt Mode ─────────────────────────────────────
if [ "$1" = "--letsencrypt" ]; then
  DOMAIN="${2:?Usage: $0 --letsencrypt your-domain.com}"
  EMAIL="${3:-admin@${DOMAIN}}"
  WEBROOT="/var/www/certbot"

  echo "🔐 Requesting Let's Encrypt certificate for: ${DOMAIN}"
  echo "📧 Email: ${EMAIL}"
  echo "🌐 Webroot: ${WEBROOT}"
  echo ""

  # Ensure webroot exists
  mkdir -p "${WEBROOT}/.well-known/acme-challenge"

  # Request certificate
  docker compose exec nginx sh -c "
    certbot certonly \
      --webroot \
      --webroot-path=${WEBROOT} \
      --email ${EMAIL} \
      --agree-tos \
      --no-eff-email \
      -d ${DOMAIN} \
      -d www.${DOMAIN} \
      --non-interactive
  "

  echo ""
  echo "✅ Let's Encrypt certificate obtained!"
  echo ""
  echo "📁 Certificates stored in: /etc/letsencrypt/live/${DOMAIN}/"
  echo ""
  echo "🔄 Auto-renewal is configured via certbot service cron."
  echo ""
  echo "🚀 Restart nginx to use the new certificates:"
  echo "   docker compose exec nginx nginx -s reload"

  exit 0
fi

# ─── Check Let's Encrypt Status ─────────────────────────────
if [ "$1" = "--letsencrypt-status" ]; then
  echo "🔐 Let's Encrypt Certificate Status:"
  echo ""
  docker compose exec certbot certbot certificates 2>/dev/null || \
    echo "No certificates found. Run: $0 --letsencrypt your-domain.com"
  exit 0
fi

# ─── Self-Signed Mode (Development) ─────────────────────────
DOMAIN="${1:-localhost}"
SSL_DIR="$(cd "$(dirname "$0")" && pwd)/ssl"
DAYS=365

echo "🔐 Generating self-signed SSL certificates for: ${DOMAIN}"
echo "📁 Output directory: ${SSL_DIR}"

# Create SSL directory
mkdir -p "$SSL_DIR"

# Generate self-signed certificate
openssl req -x509 -nodes -days "$DAYS" \
  -newkey rsa:2048 \
  -keyout "$SSL_DIR/key.pem" \
  -out "$SSL_DIR/cert.pem" \
  -subj "/C=NG/ST=Lagos/L=Ng/O=AfriFundedCapital/CN=${DOMAIN}" \
  -addext "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN},DNS:localhost,IP:127.0.0.1"

# Generate Diffie-Hellman parameters for extra security
if [ ! -f "$SSL_DIR/dhparam.pem" ]; then
  echo "🔑 Generating Diffie-Hellman parameters (this may take a moment)..."
  openssl dhparam -out "$SSL_DIR/dhparam.pem" 2048
fi

# Set permissions
chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"
chmod 600 "$SSL_DIR/dhparam.pem" 2>/dev/null || true

echo ""
echo "✅ SSL certificates generated successfully!"
echo ""
echo "📁 Files created:"
echo "   • ${SSL_DIR}/cert.pem   (certificate)"
echo "   • ${SSL_DIR}/key.pem    (private key)"
echo "   • ${SSL_DIR}/dhparam.pem (DH parameters)"
echo ""
echo "🚀 To start with Nginx:"
echo "   docker compose --profile prod --profile nginx up --build"
echo ""
echo "⚠️  Self-signed certs will show browser warnings."
echo "   For production, use Let's Encrypt:"
echo "   ./nginx/generate-ssl.sh --letsencrypt your-domain.com"
echo ""
