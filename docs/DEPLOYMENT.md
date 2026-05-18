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
- [`docs/OPERATIONS.md`](./OPERATIONS.md) — day-to-day deploy cheatsheet (after first-time setup)
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

Pick **one** of two TLS paths depending on whether the production domain
will run Cloudflare in **Full (strict)** or **Flexible** mode.

| Path | Cloudflare SSL mode | Cert on droplet | When to use |
|---|---|---|---|
| **7A** — Cloudflare Origin Cert | **Full (strict)** (zone, or per-hostname Config Rule) | CF Origin Cert (15 years) | Production with PII. End-to-end encrypted. |
| **7B** — HTTP-only behind Flexible | **Flexible** (zone default) | None | Staging / smoke testing only. Plaintext between CF and origin. |

Skip whichever path doesn't apply.

---

### Path 7A — Cloudflare Origin Cert (production, recommended)

> **TLS strategy** — DNS for `*-legacyx.unityx.group` is proxied through
> Cloudflare (orange-cloud). The zone-wide SSL mode stays on whatever the
> rest of `unityx.group` uses (e.g. Flexible for legacy subdomains); a
> **per-hostname Configuration Rule** elevates only LegacyX to **Full
> (strict)**. The origin presents a **Cloudflare Origin Certificate** (free,
> valid 15 years, ECC/RSA) so traffic is encrypted end-to-end without ever
> needing Let's Encrypt or ACME challenges.
>
> Why not Let's Encrypt? With Cloudflare proxy enabled, ACME http-01 (port 80)
> never reaches the droplet, and dns-01 requires an API token + dynamic
> propagation. Origin certs are simpler and last 15 years.

### 7.1 Cloudflare Dashboard — set SSL mode per hostname

1. `unityx.group` → **SSL/TLS → Overview**: leave zone mode at its current
   setting (no global change needed).
2. `unityx.group` → **Rules → Configuration Rules → Create rule**:
   - Name: `LegacyX Full TLS`
   - When incoming requests match: **Hostname** **is in**
     `app-legacyx.unityx.group`, `api-legacyx.unityx.group`,
     `m-legacyx.unityx.group`
   - Then: set **SSL** to **Full (strict)**
   - Save + Deploy
3. (Optional, Free plans only) If Configuration Rules is unavailable, use
   3 Page Rules with pattern `https://<hostname>/*` → "SSL: Full (strict)".

### 7.2 Cloudflare Dashboard — issue an Origin Certificate

1. `unityx.group` → **SSL/TLS → Origin Server → Create Certificate**
2. Hostnames: `*.unityx.group, unityx.group` (covers all three subdomains)
3. Private key type: **RSA (2048)**, Validity: **15 years**
4. Copy **both** the certificate and the private key — the private key is
   shown **only once**.

### 7.3 Install the origin certificate on the droplet

From your laptop, save the two PEM blobs into `~/cf-origin/cf-origin.crt`
and `~/cf-origin/cf-origin.key`, then:

```bash
scp ~/cf-origin/cf-origin.* deploy@<droplet-ip>:/tmp/
rm -rf ~/cf-origin                              # delete local copies
```

On the droplet:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo mv /tmp/cf-origin.crt /etc/ssl/cloudflare/cf-origin.crt
sudo mv /tmp/cf-origin.key /etc/ssl/cloudflare/cf-origin.key
sudo chown root:root /etc/ssl/cloudflare/*
sudo chmod 644 /etc/ssl/cloudflare/cf-origin.crt
sudo chmod 600 /etc/ssl/cloudflare/cf-origin.key
ls -la /etc/ssl/cloudflare/
```

### 7.4 Verify DNS resolves through Cloudflare (sanity check)

```bash
DROPLET_IP=$(curl -s ifconfig.me)
for d in app-legacyx.unityx.group api-legacyx.unityx.group m-legacyx.unityx.group; do
  resolved=$(dig +short $d | tail -1)
  printf '%-40s %s (droplet=%s)\n' "$d" "$resolved" "$DROPLET_IP"
done
# Expected: each hostname resolves to a Cloudflare IP (e.g. 104.21.x.x or
# 172.67.x.x), NOT the droplet IP. The droplet only needs to reachable from
# Cloudflare on port 443.
```

### 7.5 Install the nginx config + start nginx

```bash
sudo cp infra/nginx/legacyx.conf /etc/nginx/sites-available/legacyx
sudo ln -sf /etc/nginx/sites-available/legacyx /etc/nginx/sites-enabled/legacyx
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t                      # must print "syntax is ok" + "test is successful"
sudo systemctl restart nginx
sudo systemctl enable nginx
sudo systemctl status nginx --no-pager | head -10
```

The config (`infra/nginx/legacyx.conf`):
- Trusts the Cloudflare IP ranges via `set_real_ip_from` + `CF-Connecting-IP`
  so application logs and `X-Real-IP` show the actual client.
- Returns `444` (silent disconnect) for any direct port-80 hit on the
  droplet IP — bots scanning the IP get nothing.

### 7.6 Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw deny 80/tcp               # optional — port 80 only attracts bots
sudo ufw --force enable
sudo ufw status
```

### 7.7 (Optional, recommended) Cloudflare Authenticated Origin Pulls

Forces the droplet to reject anything that didn't come through Cloudflare,
even if someone discovers the droplet IP. Skip this if you don't care.

1. Cloudflare → SSL/TLS → Origin Server → **Authenticated Origin Pulls** → Enable
2. Download Cloudflare's CA: <https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/set-up/>
3. Drop the CA at `/etc/ssl/cloudflare/origin-pull-ca.pem` + add to each
   server block:
   ```nginx
   ssl_client_certificate /etc/ssl/cloudflare/origin-pull-ca.pem;
   ssl_verify_client on;
   ```
4. `sudo nginx -t && sudo systemctl reload nginx`

---

### Path 7B — HTTP-only behind Cloudflare Flexible (staging / smoke test)

> ⚠️ **Plaintext between Cloudflare and origin.** Acceptable for a test
> deploy on a shared zone where you can't change the zone-wide SSL mode.
> Not recommended for production with real PII. To migrate to Path 7A
> later, you only need to (1) get an Origin Cert, (2) swap the nginx
> config file, (3) flip the Cloudflare SSL mode for those hostnames. No
> code changes.

#### 7B.1 Cloudflare Dashboard

1. Make sure DNS A records for `app-legacyx`, `api-legacyx`, `m-legacyx`
   point to the droplet IP with the orange-cloud (proxied) toggle on.
2. SSL/TLS → Overview → Flexible (no change needed if the zone is already
   on Flexible).
3. No Origin Cert, no Configuration Rule.

#### 7B.2 Install the HTTP-only nginx config

```bash
cd /srv/legacyx
sudo cp infra/nginx/legacyx-flexible.conf /etc/nginx/sites-available/legacyx
sudo ln -sf /etc/nginx/sites-available/legacyx /etc/nginx/sites-enabled/legacyx
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t                   # must print "syntax is ok"
sudo systemctl restart nginx
sudo systemctl enable nginx
sudo systemctl status nginx --no-pager | head -10
```

The config (`infra/nginx/legacyx-flexible.conf`):
- Listens on port 80 only (Cloudflare connects in HTTP).
- Forwards `X-Forwarded-Proto: https` to the apps so cookies remain `Secure`.
- Trusts Cloudflare's IP ranges for `CF-Connecting-IP`.
- Returns 444 for direct droplet-IP probes.

#### 7B.3 Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw --force enable
sudo ufw status
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
| `/api/v1/auth/phone/lookup` returns `{"roles":[]}` for a seeded phone, but the user row IS in the DB | An inline `# comment` follows the value on the same line in `.env.prod`. `docker run --env-file` keeps it literally (45-char key), `docker compose --env-file` strips it (34-char key). Seed and runtime end up hashing with different keys → phoneHash mismatch | Remove every `KEY=value   # comment` form (put the comment on its OWN line above the key), force-recreate containers, **then re-seed** so phoneHash uses the clean key |
| Backoffice (`app-legacyx`) login works, but every mutation silently fails (no row change in the UI) | `SERVER_ACTIONS_ALLOWED_ORIGINS` has scheme (`https://app-legacyx.unityx.group`). Next.js Server Actions only match hostnames against this list. | Use hostnames only — `SERVER_ACTIONS_ALLOWED_ORIGINS=app-legacyx.unityx.group,m-legacyx.unityx.group` |
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
