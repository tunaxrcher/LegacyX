#!/usr/bin/env bash
# =============================================================================
# LegacyX — one-command production deploy script (DigitalOcean Droplet)
#
# Idempotent: safe to re-run. Designed to be invoked from /srv/legacyx.
#
#   bash scripts/deploy.sh             # normal deploy
#   bash scripts/deploy.sh --no-build  # skip rebuild (e.g. config-only change)
#   bash scripts/deploy.sh --force-migrate  # force migrate even if no schema diff
#
# Steps:
#   1. git pull
#   2. detect schema changes → run `pnpm --filter @legacyx/db migrate:deploy`
#      inside a one-shot Node container that talks to DO Managed MySQL
#   3. docker compose build + up -d
#   4. smoke test /api/readyz over HTTPS
#
# Requirements on the droplet:
#   • /srv/legacyx clone of the repo with .env.prod next to it
#   • infra/docker/secrets/db-ca.crt downloaded from DO Managed MySQL console
#   • docker + docker compose v2
# =============================================================================
set -euo pipefail

# --- config ------------------------------------------------------------------
REPO_DIR="${REPO_DIR:-/srv/legacyx}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.do.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
CA_CERT_PATH="${CA_CERT_PATH:-infra/docker/secrets/db-ca.crt}"
API_HEALTHCHECK_URL="${API_HEALTHCHECK_URL:-https://api-legacyx.unityx.group/api/readyz}"

DO_BUILD=1
FORCE_MIGRATE=0
for arg in "$@"; do
    case "$arg" in
        --no-build)       DO_BUILD=0 ;;
        --force-migrate)  FORCE_MIGRATE=1 ;;
        *) echo "Unknown flag: $arg" >&2; exit 2 ;;
    esac
done

cd "$REPO_DIR"

# --- preflight ---------------------------------------------------------------
[[ -f "$ENV_FILE"      ]] || { echo "✗ Missing $ENV_FILE";      exit 1; }
[[ -f "$CA_CERT_PATH"  ]] || { echo "✗ Missing $CA_CERT_PATH";  exit 1; }
[[ -f "$COMPOSE_FILE"  ]] || { echo "✗ Missing $COMPOSE_FILE";  exit 1; }
command -v docker >/dev/null || { echo "✗ docker not on PATH"; exit 1; }

echo "==> [1/4] git pull"
OLD_HEAD="$(git rev-parse HEAD)"
git pull --ff-only origin main
NEW_HEAD="$(git rev-parse HEAD)"

if [[ "$OLD_HEAD" == "$NEW_HEAD" && "$FORCE_MIGRATE" == "0" && "$DO_BUILD" == "1" ]]; then
    echo "    ↳ Already up to date ($NEW_HEAD), continuing with rebuild anyway."
fi

# --- 2. migrations -----------------------------------------------------------
MIGRATE=0
if [[ "$FORCE_MIGRATE" == "1" ]]; then
    MIGRATE=1
elif [[ "$OLD_HEAD" != "$NEW_HEAD" ]] && \
     git diff --name-only "$OLD_HEAD" "$NEW_HEAD" | grep -q '^packages/db/prisma/migrations/'; then
    MIGRATE=1
fi

if [[ "$MIGRATE" == "1" ]]; then
    echo "==> [2/4] Running migrations against Managed MySQL"
    docker run --rm \
        --env-file "$ENV_FILE" \
        -v "$(pwd):/app" -w /app \
        -v "$(pwd)/$CA_CERT_PATH:/run/secrets/db-ca.crt:ro" \
        node:20-alpine sh -c '
            corepack enable >/dev/null 2>&1 &&
            corepack prepare pnpm@9.12.0 --activate >/dev/null 2>&1 &&
            pnpm install --frozen-lockfile --filter @legacyx/db... &&
            pnpm --filter @legacyx/db migrate:deploy
        '
else
    echo "==> [2/4] No schema changes — skipping migrations"
fi

# --- 3. build + up -----------------------------------------------------------
if [[ "$DO_BUILD" == "1" ]]; then
    echo "==> [3/4] Building images"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
else
    echo "==> [3/4] --no-build flag — skipping image build"
fi

echo "    ↳ Rolling out containers"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans

# --- 4. smoke ---------------------------------------------------------------
echo "==> [4/4] Smoke test (give the api-server time to warm up)"
sleep 10

ATTEMPTS=6
until curl -fsS --max-time 5 "$API_HEALTHCHECK_URL" >/dev/null; do
    ATTEMPTS=$((ATTEMPTS - 1))
    if [[ "$ATTEMPTS" -le 0 ]]; then
        echo "    ✗ $API_HEALTHCHECK_URL did NOT come back healthy"
        docker compose -f "$COMPOSE_FILE" ps
        docker compose -f "$COMPOSE_FILE" logs --tail=50 api-server
        exit 1
    fi
    echo "    … readyz not yet 200 (retries left: $ATTEMPTS)"
    sleep 5
done

echo "    ✓ $API_HEALTHCHECK_URL → 200 OK"
docker compose -f "$COMPOSE_FILE" ps

echo
echo "✅ Deploy complete — old HEAD: ${OLD_HEAD:0:7}  →  new HEAD: ${NEW_HEAD:0:7}"
