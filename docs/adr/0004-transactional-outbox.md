# ADR 0004 — Transactional Outbox + Idempotent Workers

- **Status**: Accepted
- **Date**: 2026-05-13

## Context
Critical events (`payment.completed`, `procedure.completed`, `inventory.adjusted`) MUST not be lost if the queue is unavailable when the DB commit happens. Conversely, a queue publish that succeeds while the DB rolls back leads to phantom downstream effects (stock cut for a payment that never existed).

## Decision
**Transactional Outbox Pattern** with idempotent consumers.

### Producer flow
```
BEGIN TX
  UPDATE payments SET state='COMPLETED' ...
  INSERT INTO outbox_events (event_id, event_name, payload, metadata, status='PENDING') ...
COMMIT
```

A separate **Outbox Relay** worker (`apps/worker-engine`) does:
```
SELECT id FROM outbox_events
  WHERE status='PENDING' AND available_at <= NOW()
  ORDER BY created_at
  LIMIT 100 FOR UPDATE SKIP LOCKED;

-- publish to Redis (BullMQ) topic queue based on event_name
UPDATE outbox_events SET status='DISPATCHED', dispatched_at=NOW() WHERE id IN (...);
```

### Consumer flow (idempotency)
```
INSERT IGNORE INTO processed_events (event_id, handler_name, status='RUNNING') ...;
-- if 0 rows affected → already processed, skip
-- else execute side-effects, then UPDATE status='SUCCESS'
```

### Failure handling
- Handler exception → BullMQ retry with exponential backoff (max 5 attempts).
- After exhaustion → row inserted into `dead_letters`; admin can `Replay` from Backoffice.
- Stuck DISPATCHED rows (no ack within 10 min) → reaper resets to PENDING with `attempts++`.

## Why not Change Data Capture (Debezium)?
- Adds infrastructure (Kafka + Debezium) disproportionate to project scale.
- Outbox keeps the contract within app code (testable, no schema-binary coupling).
- We can swap to CDC later by writing a Debezium connector against `outbox_events`.

## Consequences
- **+** No event is lost as long as the DB transaction commits.
- **+** Replayable: outbox table is a permanent log of intent (subject to archival).
- **−** Adds a small write-amplification per business action.
- **−** Relay must be resilient and singleton-elected (Redis lock) to avoid double-publish; SKIP LOCKED makes multi-instance safe.
