# 🔔 LegacyX — Notification System

> Single-page reference for **every notification the system sends to patients
> and staff** — what triggers them, how they're rendered, how they're
> delivered, how to add a new one, and how to debug when they don't arrive.
>
> If you're touching anything in `apps/worker-engine/src/notification/**`
> or `apps/worker-engine/src/cron/**`, read this first.

---

## TL;DR — the 5-second mental model

```
┌────────────────┐  emit  ┌──────────────┐  enqueue  ┌──────────────────┐
│  api-server    │ ─────► │ outbox event │ ────────► │ worker handler   │
│  (any module)  │        │ + relay      │           │ (e.g. visit-     │
└────────────────┘        └──────────────┘           │  checked-in)     │
                                                     └────────┬─────────┘
                                                              │ insert
                                                              ▼
                                              ┌─────────────────────────┐
                                              │ notification_log        │
                                              │ status=PENDING          │
                                              │ template_code, payload  │
                                              └────────┬────────────────┘
                                                       │ every 5 s
                                                       ▼
                                              ┌─────────────────────────┐
                                              │ dispatcher tick         │
                                              │  • resolveRecipient     │
                                              │  • renderTemplate       │
                                              │  • provider.send        │
                                              │  • retry / FAILED / DLQ │
                                              └─────────────────────────┘
```

Three orthogonal pieces:

1. **Trigger** — either an outbox event handler (real-time) **or** a cron job
   (time-based scan), inserts a `NotificationLog` row with
   `status=PENDING`, a `templateCode`, and a JSON `payload`.
2. **Render** — `renderTemplate(code, payload, locale)` turns the row into a
   `{ title, text, deepLink }` tuple. Templates live in
   `apps/worker-engine/src/notification/templates.ts`.
3. **Deliver** — the dispatcher resolves the patient's preferred channel,
   sends via the configured provider, and updates the row to `SENT` /
   `FAILED` (after `MAX_ATTEMPTS`).

---

## 1. The full catalog

Every template currently registered in the system. **Add a row here when you
add a template.**

| `templateCode` | Triggered by | Where | Channel(s) | Idempotency key |
|---|---|---|---|---|
| `appointment.confirmed` | `appointment.created` event | `apps/worker-engine/src/handlers/appointment-created.handler.ts` | LINE → SMS → EMAIL | `ProcessedEvent(event_id, handler)` |
| `appointment.reminder` | **Cron** (every `APPOINTMENT_REMINDER_TICK_MS`, default 60s) | `apps/worker-engine/src/cron/appointment-reminder.ts` | LINE → SMS → EMAIL | `payload.appointment_id` + `payload.minutes_before` (JSON path filter) |
| `appointment.cancelled` | `appointment.cancelled` event | `apps/worker-engine/src/handlers/appointment-cancelled.handler.ts` | LINE → SMS → EMAIL | `ProcessedEvent`. **Also suppresses any pending `appointment.reminder` rows for the same appointment.** |
| `visit.checkedin` | `visit.checked_in` event | `apps/worker-engine/src/handlers/visit-checked-in.handler.ts` | LINE → SMS → EMAIL | `ProcessedEvent` |
| `procedure.aftercare` | **Cron** (CRM tick, hourly) — scans procedures completed 23–25h ago | `apps/worker-engine/src/cron/crm-cron.ts` — `jobAftercare24h` | LINE → SMS → EMAIL | `payload.procedure_id` (JSON path filter) |
| `review.request` | **Cron** (CRM tick) — D+3 after `Visit.completedAt` | `crm-cron.ts` — `jobReviewRequest` | LINE → SMS → EMAIL | last NotificationLog timestamp per visit |
| `rebooking.reminder` | **Cron** — last visit ≥ 30d ago + no upcoming appointment | `crm-cron.ts` — `jobRebookingReminder` | LINE → SMS → EMAIL | dedupe window (60d) |
| `wallet.expiring` | **Cron** — wallet balance expiring within 14d | `crm-cron.ts` — `jobWalletExpiring` | LINE → SMS → EMAIL | dedupe window (14d) |
| `birthday.bonus` | **Cron** — `MM-DD` match on `Patient.dob` | `crm-cron.ts` — `jobBirthdayBonus` | LINE → SMS → EMAIL | dedupe window (300d) |
| `shift.variance_alert` | `shift.closed` event when `|variance|` over threshold | `apps/worker-engine/src/handlers/shift-closed.handler.ts` | EMAIL (Manager group recipient) | `ProcessedEvent` |
| `inventory.shrinkage_alert` | `inventory.reconciled` event with negative variance | `apps/worker-engine/src/handlers/inventory-reconciled.handler.ts` | EMAIL (Manager group recipient) | `ProcessedEvent` |

> **Real-time vs cron decision rule.** If the trigger is a single business
> action (check-in, cancel, sign EMR) → use an **event handler**. If the
> trigger is a time-based condition (T-15min, 24h after, MM-DD match) →
> use a **cron job** that scans + dedupes via JSON path filter on
> `notification_log.payload`. **Never** use BullMQ delayed jobs for
> patient-facing reminders — they can't be un-scheduled when the
> appointment is cancelled/rescheduled.

---

## 2. Channel resolution & patient opt-in

`resolveRecipient()` in `apps/worker-engine/src/notification/dispatcher.ts`
walks this ladder and returns the **first** match:

1. `row.channel === "LINE"`:
   - Patient row must have **both** `lineUserId !== null` **and**
     `lineNotificationsOptIn !== false`.
   - If `lineFriendStatus === "BLOCKED"`, dispatcher still tries (the LINE
     API will return 403 — provider sets `channelStatus.friend = false` so
     the dispatcher can flip the column back, making the UI surface
     "ผู้ใช้ block OA").
2. `row.channel === "SMS"`: patient must have `phoneEnc` (encrypted).
3. `row.channel === "EMAIL"`: patient must have `emailEnc`.
4. Otherwise → `lastError = "Could not resolve recipient"` → permanently
   FAILED → DLQ row written.

**Why `lineNotificationsOptIn !== false` (not `=== true`)?** Existing patients
linked before this column was added are treated as opted-in by default.
Explicit unlink flips it back to `null` (no LINE userId, irrelevant).

The **CRM cron + appointment-reminder cron pre-check** the patient's LINE
binding before inserting a `NotificationLog` row — this avoids spamming the
`notification_log` table with PENDING rows that will only ever fail-permanent.

---

## 3. LINE binding (patient-side opt-in flow)

> Full architectural rationale in [ADR-0008](./adr/0008-patient-line-binding.md).
> This section is the operator's quick reference.

```
patient-app /profile
  └─► [Bind LINE] button
        │ POST /api/line/start  (proxy → api-server)
        ▼
  api-server.patient_line.service.linkStart()
        │ generates PKCE pair + state, stores PatientLineLinkState row
        │ returns LINE OAuth authorize URL (response_type=code, scope=profile+openid)
        ▼
  patient-app redirects browser to access.line.me
        │ patient consents
        ▼
  patient-app /profile/line-callback?code=...&state=...
        │ POST /api/line/callback (server action)
        ▼
  api-server.patient_line.service.linkCallback()
        │ • verify state + PKCE
        │ • exchange code → access_token at api.line.me
        │ • fetch profile → { userId, displayName, pictureUrl }
        │ • prisma.patient.update — set lineUserId / lineDisplayName /
        │   linePictureUrl / lineLinkedAt / lineFriendStatus="UNKNOWN" /
        │   lineNotificationsOptIn=true
        │ • AuditLog(action="line.linked")
        ▼
  → /profile (refresh) shows linked state + opt-in toggle + Unbind button
```

**Bug guards built in:**

- `@@unique([tenantId, lineUserId])` on `Patient` — same LINE id can't be
  bound to two patients in the same tenant.
- `state` is single-use: `PatientLineLinkState` row is deleted on first
  callback success.
- State TTL: 10 minutes (rejected with `Bad Request` after that).
- PKCE `code_challenge_method=S256` — prevents authorization code
  interception.
- `linkUnlink` removes the LINE binding **and** clears
  `lineNotificationsOptIn` — guarantees the dispatcher won't try LINE again
  until the patient re-binds.
- The opt-in **toggle** sends `PATCH /api/v1/patient/me/notifications` with
  `{ line: boolean }` — flips `lineNotificationsOptIn` without unlinking.

**LINE Developer Console settings required:**

- Channel type: **LINE Login** (not Messaging API).
- Callback URL: `{PATIENT_APP_BASE_URL}/profile/line-callback`
  (default `http://localhost:3004/profile/line-callback` in dev).
- Required scopes: `profile openid`.
- `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` env vars on
  api-server.
- Separate from `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` (those
  belong to the **Messaging API** channel used by the worker-engine to push
  notifications).

---

## 4. Templates — adding a new one

A template is a pure function in
`apps/worker-engine/src/notification/templates.ts`:

```ts
const templates: Record<string, TemplateFn> = {
  // ...
  "my.new.event": (payload, locale) => {
    if (locale === "th") {
      return {
        title: "หัวข้อภาษาไทย",
        text: `เนื้อหา ${payload.foo}`,
        deepLink: visitsUrl(), // optional, ends up in the LINE flex button
      };
    }
    return {
      title: "English title",
      text: `Body ${payload.foo}`,
      deepLink: visitsUrl(),
    };
  },
};
```

**Conventions:**

- **TH first, EN fallback.** Both required for parity with the i18n keys.
- **`payload` is `unknown`.** Coerce with `String(payload.foo ?? "")` or
  `Number(...)` — never trust the shape. The trigger (handler/cron) is
  responsible for filling in everything the template reads.
- **Emoji is OK** in titles/text but keep it minimal (1 leading icon max).
- **No PII in payload that isn't necessary.** Encrypted columns
  (`phoneEnc`, `emailEnc`, `firstName`) should be resolved in the
  handler/cron from `recipientRef` (a patient id), not stored verbatim in
  the JSON payload that lives forever in `notification_log`.
- **Don't put long-lived URLs in `deepLink`.** Use the helper functions
  (`bookUrl()`, `visitsUrl()`, etc.) so a single env var
  (`PATIENT_APP_URL`) controls them.

**Adding a template requires three edits:**

1. `apps/worker-engine/src/notification/templates.ts` — add the function.
2. The trigger (handler or cron) — must insert a `NotificationLog` row
   with the same `templateCode`.
3. **This file** — append a row to the catalog table above.

---

## 5. Idempotency — the two patterns

### Event-driven (handlers)

Handlers don't need to worry about it: the worker shell wraps every run in
`claimProcessing(eventId, handler.name)` against the `ProcessedEvent` table.
Second delivery of the same event → no-op.

### Cron-driven (anything in `cron/*.ts`)

The cron tick **runs on a wall-clock**, so re-firing is the rule, not the
exception. Pattern:

```ts
// BAD — would send 2x reminders if two ticks overlap.
await prisma.notificationLog.create({ ... });

// GOOD — JSON path filter on payload.
const existing = await prisma.notificationLog.findFirst({
  where: {
    templateCode: "appointment.reminder",
    AND: [
      { payload: { path: "$.appointment_id", equals: apptId } },
      { payload: { path: "$.minutes_before", equals: 15 } },
    ],
  },
  select: { id: true },
});
if (existing) return;
await prisma.notificationLog.create({ ... });
```

**MySQL gotcha:** Prisma's JSON `path` is a **JSONPath string** (e.g.
`"$.appointment_id"`), not an array — PostgreSQL uses arrays, but this repo
is on MySQL. If you copy-paste from a Postgres example you'll get a
typecheck error like `Type 'string[]' is not assignable to type 'string'`.

---

## 6. Providers

`apps/worker-engine/src/notification/providers/`:

```
console.ts      — appends to storage/notifications/{channel}.log (dev default)
line.ts         — POST to https://api.line.me/v2/bot/message/push (3 fallback formats: flex → buttons → text)
twilio.ts       — SMS gateway
sendgrid.ts     — Transactional email
```

Selected per-channel via env (all default to `console` in dev):

```env
NOTIFICATION_LINE_PROVIDER="line-messaging-api"   # or "console"
NOTIFICATION_SMS_PROVIDER="twilio"                # or "console"
NOTIFICATION_EMAIL_PROVIDER="sendgrid"            # or "console"
```

**LINE provider quirks:**

- 3 cascading formats. Tries **Flex** first (rich card with deepLink
  button). If LINE returns `400 Bad Request` (invalid flex JSON), falls
  back to **Buttons** template. If that fails, falls back to **plain text**.
- 403 from LINE = patient blocked the OA → returns
  `channelStatus.friend = false` to the dispatcher, which updates
  `Patient.lineFriendStatus = "BLOCKED"`. The patient-app UI shows a
  banner asking them to re-add the OA as a friend.
- 429 / 5xx = retryable; the dispatcher will re-try up to
  `MAX_ATTEMPTS` (default 3).

---

## 7. Dispatcher loop

```
worker-engine boot
  ├─► outbox-relay     every 1s  (poll outbox_events → BullMQ)
  ├─► event-worker     consuming q.events queue
  ├─► dispatcher tick  every 5s  (BATCH_SIZE PENDING rows)
  ├─► crm-cron         every 1h
  └─► appointment-reminder cron  every 1min (+ fire once on boot)
```

The dispatcher tick:

1. `findMany({ where: { status: "PENDING" }, take: BATCH_SIZE, orderBy: createdAt })`.
2. For each row: `resolveRecipient` → `renderTemplate` → `provider.send`.
3. On success: `status=SENT`, `sentAt`, `providerRef`.
4. On retryable failure and `attempt < MAX_ATTEMPTS`: increment attempt,
   leave PENDING. Next tick will retry.
5. On permanent failure: `status=FAILED`, write a `dead_letters` row with
   `queueName="notification-dispatcher"` so it appears in `/dlq`.

**Why a synthetic DLQ row for notification failures?** Notification
dispatch is not BullMQ-driven (it's a direct DB poll), so it bypasses the
queue's own `failed → DLQ` path. We synthesise the row in the dispatcher so
**operators have a single pane of glass** for both BullMQ failures and
notification failures.

---

## 8. Adding a new notification — the checklist

If real-time:

- [ ] Define event in `packages/events/src/schemas/...` with a Zod
      `*V1Payload`. Export via `index.ts`.
- [ ] Emit from the api-server module via `writeWithOutbox()`.
- [ ] Add a handler at `apps/worker-engine/src/handlers/...` that:
      reads the payload, fetches anything needed from DB, and
      `prisma.notificationLog.create({...})` with a stable `templateCode`.
- [ ] Register the handler in `apps/worker-engine/src/handlers/index.ts`.
- [ ] Add the template function in `templates.ts`.
- [ ] Add a row to the catalog table above.

If time-based (cron):

- [ ] Add a job function to `apps/worker-engine/src/cron/crm-cron.ts` (or
      a new dedicated cron file if it has its own cadence — see
      `appointment-reminder.ts`).
- [ ] **Dedupe via JSON path filter on payload** before inserting.
- [ ] **Pre-check the patient has a viable channel** (avoid PENDING rows
      that will only ever fail-permanent).
- [ ] Wire metrics: `cronRuns.inc({ job, outcome })` +
      `cronEnqueued.inc({ job }, n)`.
- [ ] Add the template, update the catalog.
- [ ] Consider: if the cron window is `[T-half-tick, T+half-tick]`, also
      `void runMyCron()` on worker boot so a worker restart doesn't miss
      a tick.

---

## 9. Common pitfalls (learned the hard way)

| Symptom | Root cause | Fix |
|---|---|---|
| `last_error = "Could not resolve LINE recipient"` and `provider_ref` starts with `console:` | `NOTIFICATION_LINE_PROVIDER` unset / set to `console` → dispatcher used the dev provider, which doesn't resolve patient bindings | Set `NOTIFICATION_LINE_PROVIDER="line-messaging-api"` in `.env`, restart worker-engine |
| `400 Bad Request — Invalid redirect_uri` from LINE OAuth | Callback URL not whitelisted in LINE Login channel | Add `http://localhost:3004/profile/line-callback` to **Callback URL** under LINE Developers → channel → LINE Login |
| Reminders fire but the patient already cancelled | Reminders inserted at tick time; cancel ran later but `appointment.cancelled` handler didn't run | Verify the cancel path goes through `cancelAppointment` (emits the event). Direct DB updates bypass the suppression. |
| Worker restarted, missed a 15-min reminder window | Cron ticks every 60s — restart inside the window = missed | `runAppointmentReminderTick()` is also called once on boot. Verify the boot log line `appointment reminders enqueued`. |
| `TS error: Type 'string[]' is not assignable to type 'string'` on Prisma JSON path | Copy-pasted Postgres JSON path syntax | Use MySQL JSONPath string: `path: "$.foo"`, not `path: ["foo"]` |
| Aftercare fired twice for the same procedure | Two CRM ticks overlapped on the 23–25h window without dedup | Use JSON path filter on `payload.procedure_id` (see `jobAftercare24h`) |
| Notification stuck PENDING forever | `MAX_ATTEMPTS` not reached AND provider keeps returning retryable | Inspect `last_error`. Either fix provider or manually set `status=FAILED`. |

---

## 10. Operator quick commands

```sh
# 1. Tail the dev LINE log
tail -f apps/worker-engine/storage/notifications/line.log

# 2. Inspect a single failed row
mysql -e "
  SELECT id, channel, template_code, status, attempt, last_error
  FROM notification_log
  WHERE status = 'FAILED'
  ORDER BY created_at DESC
  LIMIT 10;
"

# 3. Manually replay one notification (set back to PENDING + clear attempt)
mysql -e "
  UPDATE notification_log
  SET status='PENDING', attempt=0, last_error=NULL
  WHERE id='<row-id>';
"

# 4. Why isn't this patient getting messages?
mysql -e "
  SELECT id, line_user_id IS NOT NULL AS has_line,
         line_notifications_opt_in, line_friend_status
  FROM patient
  WHERE id='<patient-id>';
"
```

---

## See also

- `docs/adr/0008-patient-line-binding.md` — LINE binding decision rationale
- `docs/design/03-event-dictionary.md` — full event reference
- `docs/RUNBOOK.md` § 5 — "High notification failure rate" on-call card
- `apps/worker-engine/src/notification/dispatcher.ts` — the loop itself
- `/manager/notifications` UI — operator dashboard (filter by status,
  retry, view full payload)
