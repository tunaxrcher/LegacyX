# Production Hardening Checklist

This is the canonical pre-deploy checklist for the LegacyX Clinic Management
System. Tick everything in **Required** before serving real patient data.

---

## 1. Secrets & Environment

- [ ] Generate fresh `JWT_SECRET` (`openssl rand -base64 32`).
- [ ] Generate fresh `ENCRYPTION_MASTER_KEY` (32 bytes, base64 or hex).
- [ ] Generate fresh `MYSQL_ROOT_PASSWORD`, `MINIO_ROOT_PASSWORD`.
- [ ] Generate `METRICS_BEARER_TOKEN` and configure Prometheus scrape with it.
- [ ] Confirm `.env.prod` is in `.gitignore` and **never** committed.
- [ ] All API keys (LINE, Twilio, SendGrid, OpenAI) loaded from secret manager,
      not from `.env.prod` on disk in production.
- [ ] `NODE_ENV=production` everywhere.
- [ ] No `console.log` of PII (verified via `pnpm lint` + manual review).

## 2. Database (MySQL)

- [ ] `pnpm db:migrate:deploy` runs cleanly against prod DB before traffic.
- [ ] Database user for the app has **no** `SUPER` / `RELOAD` privileges.
- [ ] Daily logical backups (`mysqldump` to S3) + point-in-time recovery via
      binlogs enabled.
- [ ] Read replica configured for analytics queries (optional, recommended).
- [ ] InnoDB buffer pool sized to ≥60% of available RAM.
- [ ] `max_connections` ≥ `(api_replicas * pool_size) + (worker_replicas * pool_size) + 20`.
- [ ] Slow-query log enabled (>200 ms threshold).

## 3. Redis

- [ ] `appendonly yes` (AOF persistence) **and** RDB snapshots enabled.
- [ ] `maxmemory` set with `allkeys-lru` policy (already set in
      `docker-compose.prod.yml`).
- [ ] Redis runs on private network only; no public ingress.
- [ ] AUTH password set if Redis is accessible beyond the docker network.

## 4. Encryption-at-Rest (Patient PII)

- [ ] Confirm AES-256-GCM encrypted columns on `Patient.phoneEnc`,
      `Patient.emailEnc`, etc. (already enforced by `crypto.ts`).
- [ ] `ENCRYPTION_MASTER_KEY` rotated annually; old key kept in HSM for
      decryption of historical rows.
- [ ] DB-level encryption (TDE) enabled on the MySQL instance (cloud-managed
      `Aurora`/`Cloud SQL`/`RDS` flag).

## 5. Authentication & Authorization

- [ ] JWT `iss`/`aud` validation enabled (audit `apps/api-server/src/shared/jwt.ts`).
- [ ] Session cookies set `Secure; HttpOnly; SameSite=Lax`.
- [ ] CSRF: Server Actions require same-origin (already configured in
      `next.config.mjs`).
- [ ] ABAC role matrix reviewed annually (`docs/ROLES.md`).
- [ ] Break-Glass overrides ring-fenced — alert on every `BreakGlassOverride`
      row insert (Prometheus alert: `BreakGlassUsed`).

## 6. Network & TLS

- [ ] All external traffic terminated at TLS 1.2+ (Cloudflare / nginx / ALB).
- [ ] HTTP→HTTPS redirect at the edge.
- [ ] HSTS header (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`).
- [ ] CSP headers configured (start permissive, tighten iteratively).
- [ ] Rate limiting at edge: 60 req/min/IP for `/api/v1/patient/auth`,
      300 req/min/IP for other patient routes.
- [ ] `api-server`/`worker-engine` containers do **not** expose ports to
      public networks — only to load balancer.

## 7. Observability

- [ ] `/api/metrics` scraped by Prometheus every 30s.
- [ ] `legacyx-worker:9464/metrics` scraped by Prometheus every 30s.
- [ ] Grafana dashboards imported for:
  - HTTP RED metrics (api-server)
  - Worker handler success/failure rates
  - DLQ depth (`legacyx_worker_dlq_depth`)
  - Outbox lag (`legacyx_worker_outbox_pending`)
  - Notifications sent by channel
- [ ] Alerts configured:
  - `legacyx_worker_dlq_depth > 10` for 5m → page on-call
  - `legacyx_worker_outbox_pending > 100` for 10m → warn
  - `legacyx_worker_handler_runs_total{outcome="error"}` rate > 5/min → page
  - `up{job="api-server"} == 0` for 2m → page
- [ ] Centralised log aggregation (Loki / CloudWatch / Datadog) ingesting all
      container stdout, retaining ≥30 days.
- [ ] OpenTelemetry tracing enabled: set `OTEL_EXPORTER_OTLP_ENDPOINT` to your
      collector (e.g. Tempo / Jaeger / Honeycomb).

## 8. Backups & Disaster Recovery

- [ ] MySQL: nightly full backup + binlog streaming to S3 (≥30-day retention).
- [ ] MinIO/S3: cross-region replication for receipts/audio recordings.
- [ ] Documented RTO ≤ 4 h, RPO ≤ 1 h.
- [ ] DR runbook tested quarterly (restore latest backup to a staging stack).

## 9. CI/CD

- [ ] CI green on `main` (`.github/workflows/ci.yml`).
- [ ] Docker images built reproducibly with `--platform=linux/amd64`.
- [ ] Images scanned for CVEs (`docker scan` / Trivy) before deploy.
- [ ] Deploys are atomic: blue/green or rolling with `maxSurge: 1`,
      `maxUnavailable: 0`.
- [ ] DB migrations run as a one-shot job **before** new replicas come up;
      old replicas remain backward-compatible (expand/contract pattern).

## 10. Container Hardening

- [ ] All app containers run as **non-root** (`USER app`, already set in
      Dockerfiles).
- [ ] Containers run with `readOnlyRootFilesystem: true` (k8s securityContext).
- [ ] Drop all Linux capabilities except `NET_BIND_SERVICE` if binding <1024.
- [ ] Resource limits set: api-server 1 CPU / 1 GiB, worker 1 CPU / 2 GiB,
      backoffice 0.5 CPU / 512 MiB.
- [ ] `restart: unless-stopped` / k8s `restartPolicy: Always`.

## 11. Patient App (LIFF/PWA)

- [ ] `LINE_LIFF_ID` configured and LIFF endpoint URL set to production
      hostname in LINE Developers Console.
- [ ] `lib/liff.ts` mock fallback disabled in production (verified by
      `process.env.NODE_ENV === "production"` guard).
- [ ] Service worker (`public/sw.js`) cache strategy reviewed (don't cache API
      responses with PII).
- [ ] Manifest icons replaced with branded production assets.

## 12. Compliance / PDPA (Thailand)

- [ ] Consent capture flow for all new patients (already implemented:
      `Patient.consentVersion`).
- [ ] Data subject export endpoint (`GET /api/v1/patient/me/export`) — **TODO** if not yet.
- [ ] Data subject deletion request workflow documented.
- [ ] DPA signed with all sub-processors (LINE, Twilio, SendGrid, OpenAI).
- [ ] Audit log retention ≥ 3 years (`AuditLog` table — no automatic purge).

## 13. Smoke Tests Post-Deploy

After every production deploy, run these in order:

1. `curl https://api.example.com/api/healthz` → `{"status":"ok"}`
2. `curl https://api.example.com/api/readyz` → `{"status":"ready","db":"ok"}`
3. Login as MANAGER → `/manager/dashboard` loads.
4. Create a booking → confirm → check-in → diagnose → invoice → pay → close shift.
5. Open `/admin/notifications` → confirm at least one notification dispatched.
6. Open patient LIFF URL on a phone → login → see profile.
7. Tail Prometheus: `legacyx_worker_handler_runs_total{outcome="success"}` increasing.

---

**Owner:** Platform / SRE
**Last reviewed:** {{ update on each release }}
