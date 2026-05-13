# ADR 0002 — Immutable Ledger & Strict Deletion Policy

- **Status**: Accepted
- **Date**: 2026-05-13

## Context
Financial, inventory, and EMR data are regulated (PDPA, สถานพยาบาล standard, accounting). Silent overwrites destroy auditability and create legal risk.

## Decision
Three deletion tiers, enforced by table design:

| Tier | Policy | Tables |
|------|--------|--------|
| **Master Data** | Soft delete (`deleted_at`) | `users`, `roles`, `products`, `resources`, `promotions`, `tenants`, `branches`, `patients` |
| **Operational** | Status reversal only (`CANCELLED`, `VOIDED`) | `appointments`, `orders`, `procedures`, `invoices`, `pharmacy_dispenses` |
| **Immutable Ledger / EMR** | **Append-only**. Reversal via new row pointing to original (`reversal_of_id` or new `version`) | `payments`, `wallet_ledger`, `stock_ledger`, `emr_versions`, `audit_logs`, `outbox_events`, `consent_snapshots`, `documents` |

### Rules
- Immutable tables MUST NOT have `UPDATE`/`DELETE` permissions in production DB user; enforce via DB role.
- Reversal entries carry `reversal_of_id` pointing to the original row.
- EMR amendments produce a **new `EMRVersion`** with `amendment_of` reference; the original is never modified.
- `BreakGlassOverride` is the **only** path to mutate immutable data and requires `required_reason` + `approved_by` + `audit_log` entry.

## Consequences
- **+** 100% trail for compliance audits; reproducible balances at any timestamp.
- **+** Reversals are observable events (downstream systems react cleanly).
- **−** Storage grows monotonically; archival job needed (cold storage after N years, never delete).
- **−** Reporting must aggregate signed deltas (sum of `delta`), not "current row" — denormalized snapshots (`balance_after`, `WalletAccount.balance`) are caches, not source of truth.
