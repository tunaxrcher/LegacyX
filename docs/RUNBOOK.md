# 🚨 LegacyX Operations Runbook

> Single-page reference for on-call. Every section follows the same shape:
> **Symptom → Verify → Mitigate → Root-cause → Postmortem trigger.**
>
> Keep this short. If a section grows past ~30 lines, branch it into
> `docs/runbook/<topic>.md` and link back from here.

---

## Quick links

| Need to… | Go to |
|---|---|
| Cluster-level health | `/api/healthz`, `/api/readyz` (api-server) · `:9464/healthz` (worker-engine) |
| Metrics scrape | `/api/metrics` (Bearer `METRICS_BEARER_TOKEN`) · `:9464/metrics` |
| Failed events queue | `/dlq` (ADMIN-only UI) |
| Worker logs (dev) | `apps/worker-engine` stdout |
| Notification dispatch logs | `storage/notifications/{channel}.log` (dev console provider) |
| Audit log | `/audit` UI · `correlation_id` filter |

---

## 1. DLQ depth alarm

**Symptom** — `legacyx_worker_dlq_depth > 0` for ≥ 5 min, or red banner on `/admin`.

**Verify**
1. Open `/dlq` → list of failed events.
2. Click any row → `last_error`, `correlation_id`, retry count.
3. Cross-ref `/audit?correlation_id=…` to see the originating user action.

**Mitigate**
- Transient (network blip, gateway 5xx): click **Retry** in `/dlq`. The worker will re-claim and idempotency keys keep it safe.
- Persistent (schema drift, bad payload): **do not retry blindly** — inspect payload, fix root cause, then retry.
- Stuck on a poison message? Manually mark as ACKED in DB (`prisma.outboxEvent.update({...})`) and open a follow-up issue with the dump.

**Root-cause checklist**
- Missing env var on worker pod? → check `worker-engine` env
- Recent schema migration not applied? → `pnpm --filter @legacyx/db migrate:deploy`
- AI provider credit exhausted? → `GEMINI_API_KEY` rotation, or fallback to heuristic auto-kicks in

**Postmortem trigger** — DLQ depth > 50 in any 1-hour window.

---

## 2. Worker hang / no events processing

**Symptom** — `legacyx_worker_outbox_pending` keeps climbing; `legacyx_worker_handler_runs_total` flat.

**Verify**
1. `:9464/healthz` returns OK? (process alive)
2. `:9464/readyz` — DB probe; if FAIL, it's a DB issue not a worker issue.
3. Tail `worker-engine` logs for last "Outbox claimed" line.

**Mitigate**
- Restart the `worker-engine` container. BullMQ re-claims abandoned jobs automatically.
- If outbox row is "in-flight" forever (stale lock), update the row's `processedAt` to NULL and let the relay re-pick it up.

**Root-cause** — typically Redis disconnected (BullMQ silently retries forever) or a synchronous bug stuck in a handler. Add a timeout + `markFailed` if a handler runs > 60s.

---

## 3. OTP not arriving (login failures)

**Symptom** — users report "ไม่ได้รับ OTP" in support.

**Verify**
1. Is `DEV_OTP` set? (dev only — prod must be empty)
2. SMS provider credentials valid? (Twilio, Thaibulk, etc.) — ping their console
3. `phoneHash` mismatch? In dev, `pnpm db:seed` recomputes hashes; in prod the user's phone might be encoded differently than seed data

**Mitigate**
- ADMIN can trigger a manual unlock via `/admin/users` → ⋯ → "Unlock account" (status LOCKED → ACTIVE).
- ADMIN can also "Force log out" to revoke all stale sessions for a user.
- For an emergency one-shot OTP, set the env var per pod (NEVER in code), recycle, then revert.

**Root-cause** — almost always an SMS gateway misconfig. Check provider rate-limits + sender-id whitelist for TH numbers (DTAC/AIS/TRUE all need pre-approved sender IDs).

**Postmortem trigger** — > 1% of OTP requests fail in any 1-hour window.

---

## 4. Database lost / restore from backup

**Symptom** — `/api/readyz` returns 503; api-server logs show `PrismaClientKnownRequestError P1001` (connection refused).

**Verify**
1. Is the MySQL container alive? (`docker ps`)
2. Disk space? (a full disk == "DB lost" from the app's POV)
3. Network to DB host? `mysqlcli ping` from any worker host

**Mitigate** (assuming DB is genuinely gone)
1. Pull latest dump from S3:
   ```bash
   aws s3 cp s3://$BACKUP_BUCKET/mysql/$(date +%Y/%m/%d).sql.gz - | gunzip | mysql -u root -p ...
   ```
2. Replay binlogs newer than the dump's `--master-data` GTID for point-in-time recovery.
3. Run `pnpm --filter @legacyx/db migrate:deploy` once the DB is up to apply any schema migrations newer than the dump.
4. Smoke-test: `/api/healthz`, login flow, one read each on `/visits`, `/patients`, `/inventory`.

**Postmortem trigger** — *any* unplanned restore is a P0.

> ⚠️ **DR drill SLA**: do this on staging quarterly (calendar reminder in Q1/Q4/Q7/Q10). If the drill exceeds RTO=2h, file a remediation issue.

---

## 5. High notification failure rate

**Symptom** — `legacyx_worker_notifications_sent_total{status="failed"}` climbing.

**Verify**
1. `/manager/notifications` UI → filter by FAILED status, check the error column.
2. Common causes: provider rate-limit, phone-number country-mismatch, LINE OA bot kicked from group.

**Mitigate**
- Per-channel: bump retry budget in env `NOTIFICATION_RETRY_LIMIT` (default 3).
- LINE: re-add the bot to the patient's friend list (manual escalation to Reception).

---

## 6. Promotion code abused (suddenly negative margins)

**Symptom** — Manager flags negative service profitability or impossibly large discount on `/manager/promotions` analytics.

**Verify**
1. `/audit?action=promotion.redeemed` — sort by amount desc, top 10
2. Check `max_uses_per_patient` and `min_spend` on the promo config

**Mitigate**
- Toggle promo to inactive via `/manager/promotions` → row action → Toggle active (immediate).
- For invoices already discounted but not paid: void + reissue (Reception has the perms).
- For paid invoices: case-by-case refund decision (MANAGER + Break-Glass for >5k THB).

---

## 7. PDPA / DSR request landed (legal deadline = 30 days)

**Verify** — patient identity (national ID + recent appointment).

**Mitigate**
- **Export request** → `/manager/pdpa` → search patient → Download PII manifest. Send via secure channel (NOT email).
- **Deletion request** → `/manager/pdpa` → Anonymise. **This is irreversible**: ledger rows survive (7-year tax retention) but every PII field flips to `anon-<sha8>`.

**Audit trail** — every PDPA action writes `audit_log.pdpa_action = true` for regulator queries.

---

## 8. e-Tax export missed cut-off

**Symptom** — accountant complains the monthly CSV at `storage/etax/<tenant>/<yyyy-mm>/` is empty/short.

**Verify**
1. Check that the worker handler `document-generated.handler.ts` ran for type=TAX_INVOICE in the period.
2. Cross-ref `audit_log` action=`etax.export` count vs invoice count for the period.

**Mitigate**
- Manually trigger re-issue via `/visits/[id]` → `Issue Tax Invoice` (Reception, on PAID invoices). The worker will append a row to the CSV.
- For batch correction, use the SQL helper in `/scripts/etax-replay.sql` (TODO — not yet committed; see Issue #N).

---

## 9. On-call escalation tree

```
Level 1 (5 min)  — On-call engineer
                   ↓ no resolution in 30 min
Level 2 (30 min) — Tech lead + Manager-on-call (clinic ops)
                   ↓ user-facing impact > 1 hr OR financial impact > 50k THB
Level 3 (1 hr)   — CTO + Clinic Director
                   ↓ regulator-reportable (PDPA breach, e-Tax filing miss)
Level 4 (4 hr)   — Legal + DPO (Data Protection Officer) + RD (Revenue Dept) liaison
```

> Phone numbers in `1Password → Vault: LegacyX Ops → Item: On-call rota`.

---

## 10. After every incident

1. Comment thread in `#incident-<date>` Slack channel — keep timestamps + decisions.
2. Within 5 business days: file `docs/postmortems/YYYY-MM-DD-<short-name>.md` using the template.
3. Action items go to the project board — never trust verbal "we'll fix it later".

---

## Appendix — Useful one-liners

```bash
# Show current outbox lag (pending messages)
mysql -e "SELECT status, COUNT(*) FROM outbox_event GROUP BY status;"

# Force-fail a stuck handler claim (DANGER — only when sure)
mysql -e "UPDATE processed_event SET status='FAILED', error='manual-reset' WHERE event_id='evt_X';"

# Tail the dispatcher log (dev console provider)
tail -f storage/notifications/line.log

# List the latest 20 audit rows for a correlation_id
mysql -e "SELECT createdAt,actorType,actorId,action FROM audit_log WHERE correlationId='req_X' ORDER BY createdAt DESC LIMIT 20;"
```
