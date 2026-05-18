# Deployment Playbook — LegacyX on DigitalOcean

End-to-end deployment guide for the LegacyX Clinic Management System running on
**DigitalOcean Droplet + DO Managed MySQL + DO Spaces**, orchestrated with
Docker Compose.

Production domains:

| Component | Domain | Local port |
|---|---|---|
| API server | `api-legacyx.unityx.group` | `127.0.0.1:3001` |
| Backoffice (staff UI) | `app-legacyx.unityx.group` | `127.0.0.1:3003` |
| Patient app (LIFF/PWA) | `m-legacyx.unityx.group` | `127.0.0.1:3004` |

Related docs:
- [`docs/PRODUCTION_HARDENING.md`](./PRODUCTION_HARDENING.md) — pre-deploy checklist
- [`docs/RUNBOOK.md`](./RUNBOOK.md) — on-call procedures
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — system design
- [`AGENTS.md`](../AGENTS.md) — conventions

---

## 1. Provision DigitalOcean resources (once)

| Resource | Spec | Notes |
|---|---|---|
| Droplet | 4 vCPU / 8 GB RAM / 80 GB SSD, Ubuntu 22.04, SGP1 | Will run 5 app containers + Redis + Nginx |
| Managed MySQL | MySQL 8, ≥ 2 GB RAM, SGP1 | Add Droplet IP to **Trusted Sources**; download the CA certificate |
| Spaces | bucket `legacyx-prod`, SGP1, **private** | Generate a Spaces access key / secret pair |
| DNS A records | `api-legacyx`, `app-legacyx`, `m-legacyx` on `unityx.group` | All point to the Droplet's public IP |

Verify DNS with `dig +short api-legacyx.unityx.group` from any machine.

---

## 2. Prepare the Droplet (once)

SSH in as `root`, then:

```bash
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

apt update && apt -y install ca-certificates curl gnupg nginx
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu jammy stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker deploy
snap install --classic certbot && ln -sf /snap/bin/certbot /usr/bin/certbot
```

Log out, then SSH back in as `deploy` (so the docker group takes effect).

---

## 3. Clone the repo + install the CA cert (once)

```bash
sudo mkdir -p /srv && sudo chown deploy:deploy /srv
cd /srv
git clone https://github.com/tunaxrcher/LegacyX.git legacyx
cd legacyx

mkdir -p infra/docker/secrets
# Upload the CA certificate (downloaded from DO MySQL → Connection Details) to:
#   infra/docker/secrets/db-ca.crt
# e.g. from your laptop:
#   scp ca-certificate.crt deploy@<droplet-ip>:/srv/legacyx/infra/docker/secrets/db-ca.crt
chmod 644 infra/docker/secrets/db-ca.crt
```

> **Why 644, not 600**: the cert is mounted into the api-server / worker-engine /
> ai-service containers which run as a non-root `app` user (UID ≠ host UID).
> 600 (owner-only) makes the file unreadable inside the container, and Prisma
> reports the resulting TLS failure as a generic "Can't reach database server" —
> hard to diagnose. 644 is safe because the file only contains the *public* CA
> certificate (no private key).

The secret is referenced by the api-server, worker-engine, and ai-service
containers through [`infra/docker/docker-compose.do.yml`](../infra/docker/docker-compose.do.yml)
and mounted read-only at `/run/secrets/db-ca.crt`.

---

## 4. Create `.env.prod` (once)

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

Fill in the values below. Generate every secret marked **`(rand)`** with
`openssl rand -base64 32`.

```env
NODE_ENV=production
LOG_LEVEL=info
IMAGE_TAG=latest

# DigitalOcean Managed MySQL — get the host/user from the DO console.
DATABASE_URL="mysql://doadmin:STRONG_PASS@db-mysql-sgp1-XXXX.b.db.ondigitalocean.com:25060/legacyx?sslaccept=strict&sslcert=/run/secrets/db-ca.crt"

# Redis lives inside the docker network.
REDIS_URL=redis://redis:6379

# DigitalOcean Spaces (S3-compatible — virtual-host style).
S3_ENDPOINT=https://sgp1.digitaloceanspaces.com
S3_REGION=sgp1
S3_ACCESS_KEY=<spaces-access-key>
S3_SECRET_KEY=<spaces-secret-key>
S3_BUCKET=legacyx-prod
S3_FORCE_PATH_STYLE=false                # DO Spaces requires virtual-host style

# Secrets — generate fresh.
JWT_SECRET=<rand>
ENCRYPTION_MASTER_KEY=<rand>             # ⚠️ Never change after first deploy
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
METRICS_BEARER_TOKEN=<rand>
INTERNAL_API_SECRET=<rand>
DEV_OTP=                                 # MUST be empty in production

# Public URLs.
API_BASE_URL=https://api-legacyx.unityx.group
API_INTERNAL_URL=http://api-server:3001
NEXT_PUBLIC_API_URL=https://api-legacyx.unityx.group
PATIENT_APP_BASE_URL=https://m-legacyx.unityx.group
SERVER_ACTIONS_ALLOWED_ORIGINS=https://app-legacyx.unityx.group,https://m-legacyx.unityx.group
PATIENT_APP_TENANT_SLUG=legacyx
NEXT_PUBLIC_TENANT_SLUG=legacyx

# LINE Messaging + LINE Login (set the callback URL on LINE Developers Console
# to https://m-legacyx.unityx.group/api/v1/patient/me/line/link/callback).
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_LIFF_ID=
NEXT_PUBLIC_LIFF_ID=
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL=

# Notification provider selection.
NOTIFICATION_LINE_PROVIDER=line-messaging-api
NOTIFICATION_SMS_PROVIDER=console        # twilio when ready
NOTIFICATION_EMAIL_PROVIDER=console      # sendgrid when ready

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
SENDGRID_API_KEY=
EMAIL_FROM=no-reply@unityx.group

# Gemini (optional — heuristic fallback runs if blank).
GEMINI_API_KEY=
GEMINI_MODEL_TEXT=gemini-1.5-flash
GEMINI_MODEL_VISION=gemini-1.5-flash
AI_SERVICE_URL=http://ai-service:3002
```

> **Critical — `ENCRYPTION_MASTER_KEY`** is the seed for `searchableHash()` and
> AES-GCM PII encryption. **If lost, every encrypted column (`Patient.phoneEnc`,
> `emailEnc`, `nidEnc`, etc.) becomes unreadable and patients cannot log in.**
> Back it up to a password manager *before* you run the first migration.

> **Critical — no double quotes in `.env.prod`**. `docker run --env-file` does
> NOT interpret quotes; they are taken as literal characters in the value.
> The Prisma migrate step will fail with
> `Error validating datasource ... the URL must start with the protocol mysql://`
> if you wrap `DATABASE_URL` in quotes. Write `KEY=value` not `KEY="value"`.

---

## 5. Run database migrations + seed (once)

> **Why this is split into two different invocations**: `migrate deploy` only
> needs `prisma` + the schema/migrations folder, so we call it through `npx`
> directly. `db:seed` runs custom TypeScript that imports from the wider
> workspace (events, identity helpers), so it does need pnpm install +
> devDependencies. The `NODE_ENV=development` override on the seed step
> forces pnpm to install devDeps (`tsx`, `dotenv-cli`, `prisma`) even though
> `.env.prod` carries `NODE_ENV=production`.

```bash
cd /srv/legacyx

# 5.1 Apply schema — calls prisma directly, no pnpm/workspace install needed.
docker run --rm --env-file .env.prod \
  -v $(pwd)/packages/db:/db \
  -v $(pwd)/infra/docker/secrets/db-ca.crt:/run/secrets/db-ca.crt:ro \
  -w /db \
  node:20-alpine sh -c '
    apk add --no-cache openssl &&
    npx --yes prisma@5.22.0 migrate deploy
  '

# 5.2 Seed roles + demo tenant (DO NOT re-run on a DB with real patient data —
#     it upserts demo users back in).
#
# Notes:
#   • We bypass `pnpm db:seed` (which would invoke dotenv-cli looking for .env)
#     and call `tsx prisma/seed.ts` directly so the env from `--env-file
#     .env.prod` is what the script sees.
#   • We run `prisma generate` explicitly because filter-installs don't trigger
#     the package's postinstall hook in a deterministic way.
docker run --rm --env-file .env.prod \
  -e NODE_ENV=development \
  -v "$(pwd):/app" -w /app \
  -v "$(pwd)/infra/docker/secrets/db-ca.crt:/run/secrets/db-ca.crt:ro" \
  node:20-alpine sh -c '
    apk add --no-cache openssl &&
    corepack enable && corepack prepare pnpm@9.12.0 --activate &&
    pnpm install --frozen-lockfile --filter @legacyx/db... --prod=false &&
    cd packages/db && npx --yes prisma@5.22.0 generate && cd /app &&
    pnpm --filter @legacyx/db exec tsx prisma/seed.ts
  '
```

You should see `Seeded …` lines followed by `✅ Seed complete.`

---

## 6. First boot

```bash
docker compose -f infra/docker/docker-compose.do.yml --env-file .env.prod build
docker compose -f infra/docker/docker-compose.do.yml --env-file .env.prod up -d
docker compose -f infra/docker/docker-compose.do.yml ps
```

Containers run with port bindings restricted to `127.0.0.1` — only Nginx can
reach them.

| Container | Bind |
|---|---|
| `legacyx-api` | `127.0.0.1:3001` |
| `legacyx-backoffice` | `127.0.0.1:3003` |
| `legacyx-patient` | `127.0.0.1:3004` |
| `legacyx-ai` | `127.0.0.1:3002` |
| `legacyx-worker` | `127.0.0.1:9464` (metrics only) |
| `legacyx-redis` | docker-internal only |

---

## 7. Nginx + TLS (once)

> **Why this is sequenced this way**: `infra/nginx/legacyx.conf` ships with
> `listen 443 ssl` blocks that reference `/etc/letsencrypt/live/.../fullchain.pem`.
> If you `cp` it into place before the certificates exist, `nginx -t` fails and
> nothing reloads. The order below issues the certificates **first** in
> standalone mode (with nginx stopped so port 80 is free), then installs the
> finished config.

### 7.1 Verify DNS resolves to the droplet first

```bash
DROPLET_IP=$(curl -s ifconfig.me)
for d in app-legacyx.unityx.group api-legacyx.unityx.group m-legacyx.unityx.group; do
  printf '%-40s %s (droplet=%s)\n' "$d" "$(dig +short $d | tail -1)" "$DROPLET_IP"
done
# All three must resolve to the droplet IP. If not, wait for DNS propagation
# before continuing — certbot will fail otherwise.
```

### 7.2 Issue certificates (standalone, no config yet)

```bash
sudo systemctl stop nginx          # free port 80 for ACME http-01 challenge

sudo certbot certonly --standalone \
  -d app-legacyx.unityx.group \
  -d api-legacyx.unityx.group \
  -d m-legacyx.unityx.group \
  --agree-tos -m admin@unityx.group --no-eff-email --non-interactive

sudo ls /etc/letsencrypt/live/     # should list one of the three domains
```

### 7.3 Install the nginx config + reload

```bash
sudo cp infra/nginx/legacyx.conf /etc/nginx/sites-available/legacyx
sudo ln -sf /etc/nginx/sites-available/legacyx /etc/nginx/sites-enabled/legacyx
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t                      # must print "syntax is ok" + "test is successful"
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx --no-pager | head -10
```

### 7.4 Confirm auto-renewal works

The snap timer `snap.certbot.renew.timer` is enabled automatically. Verify
once that the renewal hook can reload nginx:

```bash
sudo systemctl status snap.certbot.renew.timer --no-pager | head -5
sudo certbot renew --dry-run
```

---

## 8. Smoke test

```bash
curl https://api-legacyx.unityx.group/api/healthz   # → {"status":"ok"}
curl https://api-legacyx.unityx.group/api/readyz    # → {"status":"ready","db":"ok"}

curl -H "Authorization: Bearer $(grep ^METRICS_BEARER_TOKEN= .env.prod | cut -d= -f2)" \
  https://api-legacyx.unityx.group/api/metrics | head
```

In the browser:
1. `https://app-legacyx.unityx.group` → log in as MANAGER (phone + real OTP) → `/manager/dashboard` loads.
2. `https://m-legacyx.unityx.group` on a phone → patient login → profile renders.
3. End-to-end: booking → confirm → check-in → diagnose → invoice → pay → close shift.
4. `/manager/notifications` shows real LINE / SMS dispatch.

---

## 9. Subsequent deploys

```bash
cd /srv/legacyx
bash scripts/deploy.sh
```

[`scripts/deploy.sh`](../scripts/deploy.sh) handles:

1. `git pull --ff-only origin main`
2. Detect new files under `packages/db/prisma/migrations/` → run
   `pnpm --filter @legacyx/db migrate:deploy` inside a throwaway Node container
3. `docker compose build && up -d --remove-orphans`
4. Poll `https://api-legacyx.unityx.group/api/readyz` until healthy

Flags:
- `--no-build` — skip image rebuild (config-only change)
- `--force-migrate` — run migrations even if no schema diff (e.g. after hot-fix)

---

## 10. Rollback

```bash
cd /srv/legacyx

# Option A — revert the commit and redeploy.
git revert HEAD --no-edit && git push origin main
bash scripts/deploy.sh

# Option B — pin to an older image tag (requires images pushed to a registry).
IMAGE_TAG=v1.2.3 docker compose -f infra/docker/docker-compose.do.yml \
  --env-file .env.prod up -d
```

If a migration is incompatible with the previous code revision, follow
**expand → contract**: deploy the rollback code first, then write a *new*
migration that undoes the breaking change. Never `prisma migrate reset` in
production.

---

## 11. Pre-launch checklist

Cross-check against [`docs/PRODUCTION_HARDENING.md`](./PRODUCTION_HARDENING.md):

- [ ] `JWT_SECRET`, `ENCRYPTION_MASTER_KEY`, `INTERNAL_API_SECRET`, `METRICS_BEARER_TOKEN` all freshly generated and **backed up in a password manager**
- [ ] `DEV_OTP=` empty
- [ ] `.env.prod` permissions = `600`, never committed
- [ ] CA cert present at `infra/docker/secrets/db-ca.crt`
- [ ] Managed MySQL Trusted Sources = Droplet IP only
- [ ] Spaces bucket ACL = private
- [ ] UFW: only `22 / 80 / 443` open (`sudo ufw status`)
- [ ] DNS A records resolve correctly for all three subdomains
- [ ] TLS certificates issued for all three domains
- [ ] LINE Login Callback URL on LINE Developers Console = `https://m-legacyx.unityx.group/api/v1/patient/me/line/link/callback`
- [ ] DO Managed MySQL automatic backups enabled
- [ ] `scripts/deploy.sh` executable on the droplet (`chmod +x scripts/deploy.sh`)

---

## 12. Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Prisma migrate errors `URL must start with the protocol mysql://` | `DATABASE_URL` wrapped in `"..."` in `.env.prod` | `docker --env-file` does not interpret quotes — write `KEY=value` (no quotes) |
| `api-server` crash-loops on startup | `DATABASE_URL` missing `?sslaccept=strict` | Managed MySQL requires TLS — add the flag and reference the CA cert |
| `/api/readyz` says `Can't reach database server` but `nc <host> 25060` succeeds from inside the container | CA cert at `infra/docker/secrets/db-ca.crt` is `chmod 600` — non-root `app` user inside the container cannot read it, TLS handshake silently fails | `chmod 644 infra/docker/secrets/db-ca.crt` and recycle the affected services |
| `ai-service` restart-loops with `Unable to require .../libquery_engine-linux-musl-openssl-3.0.x.so.node — No such file or directory` | A stale `PRISMA_QUERY_ENGINE_LIBRARY` env var (or a re-introduction of one) pointing at `/app/node_modules/.prisma/client/...` — that path only exists in the Next.js standalone build, not in the pnpm raw layout used by ai-service / worker-engine | Remove the env var for those services and let Prisma auto-resolve the engine from the pnpm store |
| Anyone can log in with OTP `123456` | `DEV_OTP=123456` left in `.env.prod` | Empty the value, recycle api-server |
| File uploads to Spaces silently fail | `S3_FORCE_PATH_STYLE=true` | DO Spaces requires virtual-host style — set to `false` |
| Every patient login fails after redeploy | `ENCRYPTION_MASTER_KEY` changed | Restore the original key from password manager (key change == data loss) |
| `/api/metrics` returns 503 | `METRICS_BEARER_TOKEN` empty | Set the token, recycle api-server |
| Migration never runs after schema change | Skipped step 5.1 / didn't call `scripts/deploy.sh` | Re-run deploy (the script detects new migrations and applies them) |
| LINE binding callback returns 404 | Callback URL mismatch on LINE Developers Console | Set it to the exact patient-app path above |

---

## 13. Why dev is unaffected

The dev stack uses [`infra/docker/docker-compose.yml`](../infra/docker/docker-compose.yml)
(MySQL on `:9251`, Redis on `:9152`, MinIO on `:9153`, MailHog on `:9155`).
The DO production stack uses
[`infra/docker/docker-compose.do.yml`](../infra/docker/docker-compose.do.yml)
which talks to **external** Managed MySQL and Spaces and only runs Redis + the
five app services locally. The two files share no state — `pnpm infra:up` and
`bash scripts/deploy.sh` cannot interfere with each other.
