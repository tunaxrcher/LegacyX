# Operations Cheatsheet

> Quick reference for day-to-day deploys on the production droplet. See
> [`DEPLOYMENT.md`](./DEPLOYMENT.md) for initial setup, [`RUNBOOK.md`](./RUNBOOK.md)
> for incident response.

Droplet: `deploy@168.144.103.76` · Repo: `/srv/legacyx` · Compose file:
`infra/docker/docker-compose.do.yml` · Env file: `.env.prod`

---

## One-command deploy

```bash
ssh deploy@168.144.103.76
cd /srv/legacyx
bash scripts/deploy.sh
```

`scripts/deploy.sh` does:
1. `git pull --ff-only origin main`
2. Detects new files in `packages/db/prisma/migrations/` → runs
   `prisma migrate deploy` in a throwaway Node container
3. `docker compose build && up -d --remove-orphans`
4. Polls `https://api-legacyx.unityx.group/api/readyz` until 200 (or fails out)

Flags:
- `--no-build` — skip image rebuild, just recycle containers
- `--force-migrate` — run migrations even if no new files detected

---

## What to do for each change type

### Source code change (`apps/**` / `packages/**`)

```bash
# dev
git commit && git push

# droplet
bash scripts/deploy.sh
```

### Schema change (`packages/db/prisma/schema.prisma`)

⚠️ **Never edit schema and push without generating a migration first** — the
schema describes the *desired* state; the migration file is the *diff* that
the droplet applies. Without the migration, the database stays on the old
schema and Prisma blows up with "Unknown column".

```bash
# dev — Prisma generates the SQL file + updates the local DB
cd packages/db
pnpm prisma migrate dev --name add_xxx

# Commit BOTH the schema and the migrations folder
cd ../..
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): add xxx"
git push

# droplet — deploy.sh detects new migration and applies it
bash scripts/deploy.sh
```

### `.env.prod` change (secrets / URLs / API keys)

`.env.prod` lives **only on the droplet** — it's not in git.

```bash
# droplet
cd /srv/legacyx
nano .env.prod

# Recycle (force-recreate is required — without it Docker won't pick up
# env changes for containers whose image hash didn't change)
docker compose -f infra/docker/docker-compose.do.yml --env-file .env.prod \
  up -d --force-recreate
```

Recycle a single service only (faster):

```bash
docker compose -f infra/docker/docker-compose.do.yml --env-file .env.prod \
  up -d --force-recreate api-server
```

Verify env reached the container:

```bash
docker compose -f infra/docker/docker-compose.do.yml exec api-server env | grep -i FOO_BAR
```

### New / upgraded dependency (`package.json`)

```bash
# dev — pnpm updates BOTH package.json AND pnpm-lock.yaml
cd apps/api-server
pnpm add some-pkg
# or: pnpm add -D some-pkg     (devDep)
# or: pnpm up some-pkg          (upgrade)

# Commit BOTH the package.json AND the lockfile
cd ../..
git add apps/api-server/package.json pnpm-lock.yaml
git commit -m "feat: add some-pkg"
git push

# droplet — Dockerfile uses `--frozen-lockfile`, so the new lockfile is mandatory
bash scripts/deploy.sh
```

### Nginx config (`infra/nginx/legacyx.conf`)

```bash
# dev
git commit && git push

# droplet
cd /srv/legacyx
git pull
sudo cp infra/nginx/legacyx.conf /etc/nginx/sites-available/legacyx
sudo nginx -t                      # MUST be "syntax is ok"
sudo systemctl reload nginx
```

### Compose file (`infra/docker/docker-compose.do.yml`)

```bash
# dev
git commit && git push

# droplet
bash scripts/deploy.sh             # rebuilds and re-applies the compose
```

### TLS cert (CF Origin Cert renewal — only every 15 years 😄)

```bash
# droplet — replace cert files, then reload nginx
sudo cp /path/to/new-cert.crt /etc/ssl/cloudflare/cf-origin.crt
sudo cp /path/to/new-cert.key /etc/ssl/cloudflare/cf-origin.key
sudo chmod 644 /etc/ssl/cloudflare/cf-origin.crt
sudo chmod 600 /etc/ssl/cloudflare/cf-origin.key
sudo nginx -t && sudo systemctl reload nginx
```

---

## Status & logs

```bash
# Container status
docker compose -f infra/docker/docker-compose.do.yml ps

# Resource usage (CPU/RAM per container)
docker stats --no-stream

# Recent logs (last 50 lines)
docker compose -f infra/docker/docker-compose.do.yml logs --tail=50 api-server

# Follow logs (Ctrl+C to exit)
docker compose -f infra/docker/docker-compose.do.yml logs -f api-server worker-engine

# Smoke test
curl -s https://api-legacyx.unityx.group/api/healthz | jq .
curl -s https://api-legacyx.unityx.group/api/readyz  | jq .
```

---

## Rollback

### A. Revert the bad commit (preferred — keeps history)

```bash
cd /srv/legacyx
git log --oneline -10
git revert <bad-sha> --no-edit
git push origin main
bash scripts/deploy.sh
```

### B. Pin to an older image tag (requires registry — not enabled yet)

```bash
IMAGE_TAG=v1.2.3 \
  docker compose -f infra/docker/docker-compose.do.yml --env-file .env.prod up -d
```

### Migration rollback

Never `prisma migrate reset` in production. Follow **expand → contract**:
1. Deploy the rollback code first.
2. Write a *new* migration that undoes the breaking change.
3. Deploy + verify.

---

## Common gotchas (memorise these)

| Gotcha | Symptom | Fix |
|---|---|---|
| Edited `schema.prisma` without `prisma migrate dev` | App crash: `Table … doesn't exist` / `Unknown column` | Generate the migration on dev → commit → re-deploy |
| Forgot to commit `pnpm-lock.yaml` | Docker build fails: `lockfile is not up to date` | `git add pnpm-lock.yaml && git commit && git push` |
| Changed `.env.prod` but did `up -d` without `--force-recreate` | Container still uses old env | Add `--force-recreate` |
| Wrapped `DATABASE_URL` in `"..."` | Prisma error: `URL must start with mysql://` | Quotes are literal in `--env-file`. Write `KEY=value` not `KEY="value"` |
| CA cert chmod 600 | `Can't reach database server` even though `nc` works | `chmod 644 infra/docker/secrets/db-ca.crt` |
| Nginx 521 after deploy | Cloudflare can't reach origin | Check CF SSL mode (Flexible → HTTP origin / Full → HTTPS origin) matches what nginx listens on |
| `nginx -t` complains about duplicate `ssl_protocols` | Ubuntu's `/etc/nginx/nginx.conf` already sets it at http scope | Don't redeclare in `legacyx.conf` |
| New migration added but `deploy.sh` skipped it | `OLD_HEAD == NEW_HEAD` (already pulled) | `bash scripts/deploy.sh --force-migrate` |

---

## Cheat sheet (the only commands you need 90% of the time)

```bash
# Deploy everything
bash scripts/deploy.sh

# Restart after .env change
docker compose -f infra/docker/docker-compose.do.yml --env-file .env.prod up -d --force-recreate

# Check what's running
docker compose -f infra/docker/docker-compose.do.yml ps

# Tail logs
docker compose -f infra/docker/docker-compose.do.yml logs -f api-server

# Reload nginx after config change
sudo nginx -t && sudo systemctl reload nginx

# Smoke test
curl -s https://api-legacyx.unityx.group/api/readyz | jq .
```
