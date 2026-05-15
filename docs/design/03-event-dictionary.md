# 📖 LegacyX — Event Dictionary v1

> Reference: `docs/ARCHITECTURE.md` §4 (Outbox / Observability) and §6 (User Journey)
> All events follow the `EventEnvelope<T>` shape and are published via the **Transactional Outbox**.

---

## 0. Envelope Contract (v1)

Every event in the system **MUST** match this shape (validated by Zod in `packages/events`):

```ts
type EventEnvelope<TPayload> = {
  metadata: {
    event_name: string;        // e.g. "payment.completed"
    event_version: "v1" | "v2";
    event_id: string;          // ULID/UUID — idempotency key (unique global)
    correlation_id: string;    // tracks full flow across services
    causation_id?: string;     // event_id of the parent event
    timestamp: string;         // ISO-8601 UTC
    tenant_id: string;
    branch_id?: string;        // optional for tenant-global events
    actor: {
      type: "USER" | "SYSTEM" | "PATIENT" | "AI";
      id: string | null;
    };
  };
  payload: TPayload;
};
```

### Mandatory invariants
- `event_id` is the **idempotency key**. Workers MUST `INSERT IGNORE` into `processed_events(event_id, handler_name)` before side-effects.
- `correlation_id` is propagated unchanged through the entire causal chain.
- `causation_id` MUST equal the `event_id` of the event that triggered this one.
- Schema evolution is additive within a major version. A breaking change requires a new `event_version`.

---

## 1. Naming Convention

`<domain>.<action>` — lowercase, dot-separated, past tense (`completed`, `signed`, `created`).

| Domain        | Owner Module                  |
|---------------|-------------------------------|
| `appointment` | Appointment & Resource        |
| `visit`       | Appointment & Resource        |
| `emr`         | Clinical & EMR                |
| `lab`         | Clinical & EMR                |
| `order`       | Clinical Orders               |
| `procedure`   | Clinical Orders               |
| `pharmacy`    | Pharmacy                      |
| `payment`     | Financial                     |
| `invoice`     | Financial                     |
| `wallet`      | Financial (Course Ledger)     |
| `inventory`   | Inventory & BOM               |
| `stock`       | Inventory                     |
| `document`    | Document & Integration        |
| `notification`| Notification                  |
| `patient`     | Identity & CRM                |
| `campaign`    | CRM / Retention               |
| `shift`       | Operations / End-of-Day       |
| `ai`          | AI Service                    |
| `audit`       | Security                      |

---

## 2. Event Catalog

Each entry: **emitter → consumers** + payload contract (TypeScript-style).

### 🟢 Phase 1 — Pre-Visit & Triage

#### `appointment.created` (v1)
- **Emitter**: `api-server` (booking endpoint, LIFF, walk-in form)
- **Consumers**: `worker-engine` (notification, AI intake prep), `resource` (hold reservation)
```ts
{ appointment_id, patient_id, doctor_id?, scheduled_at, channel, source }
```

#### `appointment.cancelled` (v1) / `appointment.rescheduled` (v1)
- **Emitter**: `api-server` (`cancelAppointment` / `rescheduleAppointment`)
- **Consumers (cancelled)**: `worker-engine` notification handler →
  inserts `appointment.cancelled` template **and** suppresses any
  pending `appointment.reminder` rows for the same `appointment_id`
  (status → FAILED, `lastError="appointment.cancelled — reminder
  suppressed"`).
- **Reminder cron contract**: appointment reminders are NOT
  event-driven — `apps/worker-engine/src/cron/appointment-reminder.ts`
  scans `Appointment.scheduledAt` against
  `APPOINTMENT_REMINDER_OFFSETS_MIN` (default `"15"`) and dedupes via
  JSON path filter on `payload.{appointment_id, minutes_before}`.
  Rationale: a delayed BullMQ job can't un-schedule itself when an
  appointment is later cancelled or rescheduled; DB-scan handles it
  intrinsically.
```ts
{ appointment_id, reason?, new_scheduled_at? }
```

#### `visit.checked_in` (v1)
- **Triggers**: Resource Engine prepares room/bed; clinical-pad opens session
- **Consumers**: `worker-engine` notification handler →
  `visit-checked-in.handler.ts` looks up branch + assigned
  room/doctor (`ResourceReservation.appointmentId`) and inserts a
  `visit.checkedin` notification with those fields in the payload.
```ts
{ visit_id, appointment_id?, patient_id, branch_id, checked_in_at }
```

---

### 🟢 Phase 2 — Consultation & Lab

#### `emr.signed` (v1)
- **Triggers**: Lock EMR version (immutable), AuditLog write, optional document.requested
```ts
{ emr_id, version, patient_id, signed_by, signed_at, content_hash }
```

#### `emr.amended` (v1)
- A new immutable version pointing to a parent version
```ts
{ emr_id, new_version, amendment_of, amended_by, reason }
```

#### `lab.ordered` (v1)
```ts
{ lab_order_id, visit_id, patient_id, panel, ordered_by }
```

#### `lab.resulted` (v1)
```ts
{ lab_order_id, result_id, abnormal_flags?: string[] }
```

#### `document.requested` (v1)
- **Consumer**: `worker-engine` (PDF generator)
```ts
{ document_type, template_code, template_version, ref_type, ref_id, params: object }
```

#### `document.generated` (v1)
```ts
{ document_id, storage_key, content_hash, signed_url_exp }
```

#### `order.created` (v1)
```ts
{ order_id, visit_id, patient_id, items: Array<{ type, ref_id, qty, unit_price, total }>, total_amount }
```

---

### 🟢 Phase 3 — Payment, Pharmacy, Dispatch

#### `payment.authorized` (v1)
```ts
{ payment_id, invoice_id, amount, method, gateway?, gateway_ref? }
```

#### `payment.completed` (v1)  ⭐ critical
- **Consumers**: wallet (purchase entries), document (e-receipt), notification (clinical-pad), procedure unlock
```ts
{ payment_id, invoice_id, patient_id, amount, method, completed_at, items_summary }
```

#### `payment.settled` (v1)
- **Consumer**: accounting export worker
```ts
{ payment_id, gateway_settlement_id, settled_at, fee_amount? }
```

#### `payment.failed` (v1) / `payment.refunded` (v1)
```ts
// failed
{ payment_id, reason }
// refunded
{ payment_id, refund_payment_id, amount, reason }
```

#### `invoice.voided` (v1)
- **Consumer**: triggers compensating chain (`wallet.reversed`, `stock.reversed`)
```ts
{ invoice_id, voided_by, reason }
```

#### `wallet.purchased` (v1) / `wallet.used` (v1) / `wallet.reversed` (v1) / `wallet.expiring` (v1)
```ts
// used
{ wallet_id, patient_id, delta: -1, ref_type: "PROCEDURE", ref_id, balance_after }
// reversed
{ wallet_id, reversal_of_id, delta: +1, balance_after, reason }
```

#### `pharmacy.preparing` (v1) / `pharmacy.dispensed` (v1)
- `dispensed` triggers `stock.dispensed` via BOM/medication mapping
```ts
{ pharmacy_dispense_id, order_id, patient_id, items: [{ product_id, qty, lot_no? }] }
```

---

### 🟢 Phase 4 — Procedure

#### `procedure.started` (v1) / `procedure.completed` (v1) / `procedure.cancelled` (v1)
- **completed Consumers**: `inventory.adjusted` via BOM, `doctor.fee.accrued`, aftercare notification scheduling
```ts
{ procedure_id, order_id, patient_id, performed_by, completed_at }
```

#### `inventory.adjusted` (v1) — emitted by BOM cutter
```ts
{ ledger_ids: string[], product_changes: Array<{ product_id, delta, balance_after }>, ref_type, ref_id }
```

#### `stock.received` (v1) / `stock.dispensed` (v1) / `stock.reversed` (v1) / `inventory.reconciled` (v1)
```ts
// reconciled
{ branch_id, items: Array<{ product_id, system_qty, counted_qty, variance }>, override_id? }
```

---

### 🔴 Phase 5 — Reversal & Cancellation (Compensating)

Compensating chain order (initiated by `invoice.voided` or `order.cancelled`):

1. `order.cancelled` → release `ResourceReservation`
2. `payment.refunded` → accounting reversal
3. `wallet.reversed` → restore course quota
4. `stock.reversed` → restock components
5. `procedure.cancelled` → mark abort

Each step emits its own event with `causation_id` chained back to the trigger.

---

### 🟣 Phase 6 — End-of-Day

#### `shift.closed` (v1)
```ts
{ shift_id, branch_id, cash_counted, cash_expected, variance, closed_by }
```

#### `inventory.reconciled` (v1) — see above
- If `variance > 0`, `BreakGlassOverride` is required and referenced via `override_id`.

---

### 🟠 Phase 7 — CRM / Retention (Cron-driven)

| Cron schedule           | Event                          | Trigger condition                                  |
|-------------------------|--------------------------------|----------------------------------------------------|
| Daily 09:00 local       | `patient.review_requested`     | Visit completed exactly 3 days ago                 |
| Daily 09:30             | `campaign.rebooking_reminder`  | Procedure cycle (e.g. Botox) due in 7 days         |
| Daily 10:00             | `wallet.expiring_reminder`     | WalletAccount expires in 30 days                   |
| Daily 08:00             | `campaign.birthday_bonus`      | Patient DOB matches today (tenant-tz)              |

```ts
// patient.review_requested
{ patient_id, visit_id, completed_at, channel: "LINE" | "SMS" }

// campaign.birthday_bonus
{ patient_id, voucher_code, points?: number }
```

---

### 🛡️ Cross-cutting

#### `audit.recorded` (v1)
- Synthetic event for high-sensitivity actions (mirror of `AuditLog` row) for SIEM streaming.
```ts
{ audit_log_id, action, resource_type, resource_id, actor_user_id }
```

#### `ai.draft.created` (v1) / `ai.draft.approved` (v1) / `ai.draft.rejected` (v1)
```ts
{ draft_id, type, ref_type, ref_id, model_name, model_version, reviewer_user_id? }
```

#### `consent.signed` (v1)
```ts
{ consent_id, patient_id, document_type, document_version, signed_at, content_hash }
```

#### `patient.merged` (v1)
```ts
{ from_patient_id, into_patient_id, performed_by, reason }
```

---

## 3. Topology (Queue → Handlers)

| Topic queue                | Subscribed events                                  | Handler app       |
|----------------------------|----------------------------------------------------|-------------------|
| `q.outbox.relay`           | (internal) all `outbox_events` PENDING             | worker-engine     |
| `q.notification`           | `*.created`, `wallet.expiring`, `campaign.*`       | worker-engine     |
| `q.document`               | `document.requested`                               | worker-engine     |
| `q.inventory`              | `procedure.completed`, `pharmacy.dispensed`, `*.reversed` | worker-engine |
| `q.financial.settlement`   | `payment.settled`                                  | worker-engine     |
| `q.ai`                     | `ai.intake.requested`, `ai.voice.draft.requested`  | ai-service        |
| `q.dlq`                    | any handler failure after `max_attempts`           | worker-engine     |

### Retry policy (default)
- `attempts = 5`, exponential backoff (`2^n` seconds, capped at 5 min)
- After exhaustion → `dead_letters` row + Admin Dashboard alert.

---

## 4. Versioning Rules

- **Additive change** (new optional field): keep `v1`.
- **Required field added / field removed / semantics changed**: bump to `v2`. Both versions coexist; consumers register handlers per-version. Outbox row carries `event_version`.
- Deprecation lifecycle: announce → dual-emit (v1 + v2) for 1 release → remove v1 after consumer migration.

---

## 5. Implementation Notes

- Constants live in `packages/events/src/dictionary.ts` as a `const enum` — both backend and frontend import the same file.
- Each event has a Zod schema in `packages/events/src/schemas/<event_name>.<version>.ts`.
- Outbox writer helper:
  ```ts
  await db.$transaction(async (tx) => {
    await tx.payment.update({ ... });
    await tx.outboxEvent.create({ data: buildEnvelope("payment.completed", "v1", payload, ctx) });
  });
  ```
- Relay worker uses `SELECT ... FOR UPDATE SKIP LOCKED` (MySQL 8) to fan out concurrently without double-publish.
