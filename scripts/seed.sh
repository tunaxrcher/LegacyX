#!/usr/bin/env bash
# =============================================================================
# LegacyX — production seed wrapper
#
# Re-runs the workspace seed against the DO Managed MySQL. Seed uses `upsert`
# so it is safe to run on a populated DB — it refreshes roles, permissions,
# branches, products, services, etc. but DOES NOT delete operational data
# (patients, appointments, payments). If you want a clean slate, use
# `scripts/reset.sh` instead.
#
# Usage (from /srv/legacyx):
#   bash scripts/seed.sh
# =============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/legacyx}"
ENV_FILE="${ENV_FILE:-.env.prod}"
CA_CERT_PATH="${CA_CERT_PATH:-infra/docker/secrets/db-ca.crt}"

cd "$REPO_DIR"

[[ -f "$ENV_FILE"     ]] || { echo "✗ Missing $ENV_FILE";     exit 1; }
[[ -f "$CA_CERT_PATH" ]] || { echo "✗ Missing $CA_CERT_PATH"; exit 1; }
command -v docker >/dev/null || { echo "✗ docker not on PATH"; exit 1; }

echo "==> Seeding database via throwaway node:20-alpine container"

# NODE_ENV=development is intentional — pnpm needs to install devDeps
# (tsx, dotenv-cli, prisma) which `.env.prod` would otherwise skip.
docker run --rm \
    --env-file "$ENV_FILE" \
    -e NODE_ENV=development \
    -v "$(pwd):/app" -w /app \
    -v "$(pwd)/$CA_CERT_PATH:/run/secrets/db-ca.crt:ro" \
    node:20-alpine sh -c '
        apk add --no-cache openssl >/dev/null 2>&1 &&
        corepack enable && corepack prepare pnpm@9.12.0 --activate &&
        pnpm install --frozen-lockfile --filter @legacyx/db... --prod=false &&
        cd packages/db && npx --yes prisma@5.22.0 generate && cd /app &&
        pnpm --filter @legacyx/db exec tsx prisma/seed.ts
    '

echo
echo "✅ Seed complete."
