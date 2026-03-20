#!/usr/bin/env bash
# =============================================================================
# init-letsencrypt.sh — One-time Let's Encrypt certificate acquisition
#
# Run this ONCE on your server before starting the full stack.
# It starts Nginx on port 80 to serve the ACME webroot challenge, then
# calls certbot to issue the initial certificate.
#
# Usage:
#   chmod +x docker/init-letsencrypt.sh
#   ./docker/init-letsencrypt.sh
#
# Prerequisites:
#   - Replace DOMAIN and EMAIL below with real values before running.
#   - DNS for DOMAIN must already point to this server.
#   - Ports 80 and 443 must be open on the firewall.
# =============================================================================

set -euo pipefail

# ── Configuration — replace before deploying ──────────────────────────────────
DOMAIN="yourdomain.com"
EMAIL="admin@yourdomain.com"   # Used for expiry notifications by Let's Encrypt
# ──────────────────────────────────────────────────────────────────────────────

COMPOSE="docker compose"

echo "==> [1/4] Creating certbot volume directories (first-run stub cert for Nginx)"
# Nginx won't start with missing cert paths; create a temporary self-signed cert
# so the container can boot and serve the ACME challenge on port 80.
$COMPOSE run --rm --entrypoint "" certbot \
  certbot certonly \
    --staging \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    2>/dev/null || true   # ignore error — volume dirs are now created

echo "==> [2/4] Starting Nginx (HTTP only) to answer the ACME challenge"
# Start just the frontend container.  Nginx will serve port 80; SSL directives
# will log an error about missing certs, but non-fatal — port 80 still works.
$COMPOSE up -d frontend

# Give Nginx a moment to start
sleep 3

echo "==> [3/4] Obtaining production certificate for $DOMAIN"
$COMPOSE run --rm --entrypoint "" certbot \
  certbot certonly \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN"

echo "==> [4/4] Reloading Nginx to pick up the new certificate"
$COMPOSE exec frontend nginx -s reload

echo ""
echo "Certificate issued successfully."
echo "You can now start the full stack with:"
echo "  docker compose up -d"
