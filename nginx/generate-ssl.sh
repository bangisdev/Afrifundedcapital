#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AfriFundedCapital — SSL Certificate Generator
# ═══════════════════════════════════════════════════════════════
#
# Generates self-signed certificates for development.
# For production, use Let's Encrypt or your CA's certificates.
#
# Usage:
#   ./nginx/generate-ssl.sh                    # Generate self-signed cert
#   ./nginx/generate-ssl.sh your-domain.com    # Generate for specific domain
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

DOMAIN="${1:-localhost}"
SSL_DIR="$(cd "$(dirname "$0")" && pwd)/ssl"
DAYS=365

echo "🔐 Generating SSL certificates for: ${DOMAIN}"
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
echo "   For production, use Let's Encrypt or your CA's certificates."
echo ""
