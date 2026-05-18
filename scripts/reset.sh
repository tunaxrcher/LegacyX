#!/usr/bin/env bash
# =============================================================================
# LegacyX — production DB reset wrapper (DESTRUCTIVE)
#
# DROPs every table in the configured DATABASE_URL, re-runs all migrations,
# then re-seeds. Use this when you want a truly empty starting state during
# the staging / pre-launch phase. NEVER run this on a DB that holds real
# patient data — it is unrecoverable.
#
# Usage (from /srv/legacyx):
#   bash scripts/reset.sh           # prompts for confirmation
#   bash scripts/reset.sh --yes     # skip confirmation
# =============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/legacyx}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.do.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
CA_CERT_PATH="${CA_CERT_PATH:-infra/docker/secrets/db-ca.crt}"

ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        --yes|-y) ASSUME_YES=1 ;;
        *) echo "Unknown flag: $arg" >&2; exit 2 ;;
    esac
done

cd "$REPO_DIR"

[[ -f "$ENV_FILE"     ]] || { echo "✗ Missing $ENV_FILE";     exit 1; }
[[ -f "$CA_CERT_PATH" ]] || { echo "✗ Missing $CA_CERT_PATH"; exit 1; }
[[ -f "$COMPOSE_FILE" ]] || { echo "✗ Missing $COMPOSE_FILE"; exit 1; }
command -v docker >/dev/null || { echo "✗ docker not on PATH"; exit 1; }

if [[ "$ASSUME_YES" != "1" ]]; then
    DB_HOST="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed -E 's|.*@([^:/]+).*|\1|')"
    echo "⚠️  This will DROP ALL TABLES in the database on host: ${DB_HOST:-<unknown>}"
    echo "    Every patient, appointment, payment, and audit log will be erased."
    read -rp "Type 'RESET' to continue: " CONFIRM
    [[ "$CONFIRM" == "RESET" ]] || { echo "Aborted."; exit 1; }
fi

echo "==> [1/4] Stopping app containers"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    stop api-server backoffice-web patient-app worker-engine ai-service \
    >/dev/null 2>&1 || true

echo "==> [2/4] Dropping + re-creating schema (prisma migrate reset)"
docker run --rm \
    --env-file "$ENV_FILE" \
    -v "$(pwd)/packages/db:/db" \
    -v "$(pwd)/$CA_CERT_PATH:/run/secrets/db-ca.crt:ro" \
    -w /db \
    node:20-alpine sh -c '
        apk add --no-cache openssl >/dev/null 2>&1 &&
        npx --yes prisma@5.22.0 migrate reset --force --skip-seed
    '

echo "==> [3/4] Seeding fresh data"
bash scripts/seed.sh

echo "==> [4/4] Starting app containers"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    up -d api-server backoffice-web patient-app worker-engine ai-service

sleep 5
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo
echo "✅ Reset complete — DB is back to seed-only state."
