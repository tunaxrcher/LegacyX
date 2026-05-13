# 🗺️ LegacyX — Sequence Diagrams (User Journey)

Mermaid diagrams covering the critical flows. Open this file in any Markdown viewer with Mermaid support (GitHub, VS Code Markdown Preview Mermaid extension).

---

## 1. Booking → Check-in (Phase 1)

```mermaid
sequenceDiagram
    autonumber
    participant P as Patient (LIFF/PWA)
    participant API as api-server
    participant DB as MySQL
    participant OB as Outbox
    participant W as worker-engine
    participant LINE as LINE OA

    P->>API: POST /v1/appointments {scheduled_at, doctor_id}
    API->>DB: BEGIN TX
    API->>DB: INSERT appointments
    API->>DB: INSERT resource_reservations (HELD)
    API->>OB: INSERT outbox(appointment.created v1)
    API->>DB: COMMIT
    API-->>P: 201 Created
    W->>OB: SELECT FOR UPDATE SKIP LOCKED
    W->>LINE: send confirmation
    W->>OB: UPDATE status=DISPATCHED

    Note over P,API: Day of visit
    P->>API: POST /v1/visits/check-in
    API->>DB: visit.status=IN_PROGRESS, reservation=CONFIRMED
    API->>OB: INSERT outbox(visit.checked_in v1)
```

---

## 2. EMR Sign + Document Generation (Phase 2)

```mermaid
sequenceDiagram
    autonumber
    participant Doc as Doctor (clinical-pad)
    participant API as api-server
    participant AI as ai-service
    participant DB as MySQL
    participant W as worker-engine
    participant S3 as Object Storage

    Doc->>AI: POST /draft (audio chunks)
    AI->>AI: STT + LLM → AIDraft
    AI-->>Doc: draft preview
    Doc->>API: POST /v1/emr/{id}/sign {accepted_draft_id, content}
    API->>DB: BEGIN TX
    API->>DB: INSERT emr_versions(version=N, content_enc, content_hash)
    API->>DB: UPDATE emrs SET current_version=N, status=SIGNED
    API->>DB: INSERT audit_logs
    API->>DB: INSERT outbox(emr.signed v1, document.requested v1)
    API->>DB: COMMIT
    W->>DB: claim outbox row
    W->>W: render PDF (Consent / Medical Cert)
    W->>S3: PUT pdf
    W->>DB: INSERT documents row + outbox(document.generated v1)
```

---

## 3. Payment Completed → Stock Cut + Wallet (Phase 3-4)

This is the most safety-critical flow.

```mermaid
sequenceDiagram
    autonumber
    participant Cash as Cashier (backoffice-web)
    participant API as api-server
    participant Gw as Payment Gateway
    participant DB as MySQL
    participant W as worker-engine
    participant Pad as clinical-pad

    Cash->>API: POST /v1/payments {invoice_id, method}
    API->>Gw: authorize(amount)
    Gw-->>API: AUTHORIZED ref=GW123
    API->>DB: TX{INSERT payment(state=AUTHORIZED) + outbox(payment.authorized)}
    API->>Gw: capture
    Gw-->>API: CAPTURED
    API->>DB: TX{UPDATE payment(state=COMPLETED) + INSERT outbox(payment.completed v1)}
    API-->>Cash: 200 receipt-pending

    par Wallet handler
      W->>DB: process payment.completed → INSERT wallet_ledger(PURCHASE +N)
      W->>DB: outbox(wallet.purchased v1)
    and Document handler
      W->>DB: outbox(document.requested e-receipt)
    and Notification
      W->>Pad: push "Patient ready for procedure"
    end

    Note over W,DB: All handlers protected by INSERT IGNORE INTO processed_events
```

### Procedure completion (BOM cut)

```mermaid
sequenceDiagram
    autonumber
    participant Pad as clinical-pad
    participant API as api-server
    participant DB as MySQL
    participant W as worker-engine

    Pad->>API: POST /v1/procedures/{id}/complete
    API->>DB: TX{procedure.status=COMPLETED + outbox(procedure.completed v1)}
    W->>DB: lookup BOM by procedure_code
    W->>DB: TX{
    Note right of DB: For each component:<br/>INSERT stock_ledger(BOM_USAGE, -qty, balance_after)<br/>INSERT wallet_ledger(USE, -1)<br/>INSERT doctor_fees(ACCRUED)<br/>INSERT outbox(inventory.adjusted, wallet.used, doctor.fee.accrued)
    }
    W->>W: schedule cron T+24h aftercare LINE
```

---

## 4. Reversal Chain (Phase 5)

Trigger: cashier voids invoice after a procedure was started but cancelled mid-way.

```mermaid
sequenceDiagram
    autonumber
    participant Mgr as Manager
    participant API as api-server
    participant DB as MySQL
    participant W as worker-engine

    Mgr->>API: POST /v1/invoices/{id}/void {reason, override?}
    API->>DB: TX{
    Note right of DB: invoice.status=VOIDED<br/>INSERT outbox(invoice.voided v1)<br/>INSERT audit_logs<br/>(if break_glass) INSERT break_glass_overrides
    }
    W->>DB: handle invoice.voided → emit causal events
    W->>DB: payment.refunded → wallet.reversed → stock.reversed → procedure.cancelled → order.cancelled
    Note over W: Each emitted event has causation_id = invoice.voided.event_id
```

---

## 5. End-of-Day & Settlement (Phase 6)

```mermaid
sequenceDiagram
    autonumber
    participant Cash as Cashier
    participant API as api-server
    participant DB as MySQL
    participant Gw as Gateway (webhook)
    participant W as worker-engine
    participant Acct as Accounting Export

    Cash->>API: POST /v1/shifts/{id}/close {cash_counted}
    API->>DB: shift.closed + outbox(shift.closed v1)

    Gw-->>API: webhook /webhooks/payments/settlement
    API->>DB: UPDATE payment.state=SETTLED + outbox(payment.settled v1)
    W->>Acct: build CSV / API push
    W->>DB: outbox(accounting.exported v1)
```

---

## 6. CRM Cron Engine (Phase 7)

```mermaid
flowchart LR
    cron[BullMQ cron @ 09:00] --> sel[SELECT visits<br/>completed_at = today-3]
    sel --> emit[INSERT outbox<br/>patient.review_requested]
    emit --> relay[Outbox Relay]
    relay --> q[q.notification]
    q --> handler[NotificationHandler]
    handler --> line[LINE OA]
    handler --> log[INSERT notification_logs]

    cron2[Daily 10:00] --> sel2[WalletAccount<br/>expires_at in 30d]
    sel2 --> emit2[wallet.expiring_reminder]
```

---

## 7. Outbox Relay Internal

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> DISPATCHED: relay publishes\n(SKIP LOCKED)
    PENDING --> FAILED: publish error
    FAILED --> PENDING: backoff timer
    FAILED --> DEAD: attempts >= max
    DEAD --> [*]: archived
    DISPATCHED --> [*]
```

```mermaid
stateDiagram-v2
    [*] --> RUNNING: INSERT processed_events
    RUNNING --> SUCCESS: commit
    RUNNING --> FAILED: handler throws
    FAILED --> RUNNING: BullMQ retry (n+1)
    FAILED --> DLQ: attempts exhausted
```
