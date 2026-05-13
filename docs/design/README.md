# 📘 LegacyX — Design Package (Phase 0: Design Only)

This folder contains the **complete design artifacts** for the LegacyX Enterprise Clinic Management System, delivered without scaffolding code or installing dependencies (per user direction).

> Source-of-truth blueprint: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)

---

## 📂 Contents

| # | File | Purpose |
|---|------|---------|
| 1 | [`01-folder-structure.md`](./01-folder-structure.md) | Turborepo + pnpm monorepo layout, app/package conventions |
| 2 | [`02-prisma-schema.prisma`](./02-prisma-schema.prisma) | Complete Prisma schema (10 domain sections, ~50 models) |
| 3 | [`03-event-dictionary.md`](./03-event-dictionary.md) | Event envelope contract, full catalog (Phases 1–7), versioning rules |
| 4 | [`04-sequence-diagrams.md`](./04-sequence-diagrams.md) | Mermaid diagrams for booking, EMR sign, payment, reversal, EoD, CRM, outbox |

## 📂 ADRs

| # | File |
|---|------|
| 0001 | [Event-Driven Modular Monolith](../adr/0001-event-driven-modular-monolith.md) |
| 0002 | [Immutable Ledger & Deletion Policy](../adr/0002-immutable-ledger-and-no-hard-delete.md) |
| 0003 | [Multi-Tenant Strategy](../adr/0003-multi-tenant-strategy.md) |
| 0004 | [Transactional Outbox Pattern](../adr/0004-transactional-outbox.md) |
| 0005 | [ABAC & Encryption Strategy](../adr/0005-abac-and-encryption.md) |

---

## 🧭 Reading Order (recommended)

1. **`ARCHITECTURE.md`** — vision and tech stack.
2. **ADR 0001 → 0005** — non-obvious decisions and trade-offs.
3. **`01-folder-structure.md`** — where everything lives.
4. **`02-prisma-schema.prisma`** — the data model.
5. **`03-event-dictionary.md`** — how modules talk.
6. **`04-sequence-diagrams.md`** — how it all flows.

---

## 🧩 Domain Coverage Map

| Domain Module (Architecture §5) | Schema Section (file 2) | Events (file 3) |
|---|---|---|
| Security, Compliance & Identity | §1 (Tenant, User, Role, Permission, AuditLog, BreakGlass, Consent) | `audit.*`, `consent.*`, `patient.merged` |
| Document & Integration | §7 (Document, NotificationLog) | `document.*`, `notification.*` |
| Clinical & AI Assistive | §2 (EMR, EMRVersion, Lab) + §8 (AIDraft) | `emr.*`, `lab.*`, `ai.*` |
| Financial & Promotion | §5 (Invoice, Payment, Wallet, Promotion) | `payment.*`, `invoice.*`, `wallet.*` |
| Generic Resource & Inventory | §3 (Resource) + §6 (Product, BOM, StockLedger) | `inventory.*`, `stock.*` |
| Resilience (cross-cutting) | §9 (OutboxEvent, ProcessedEvent, DeadLetter) | `outbox.relay`, DLQ admin |
| Operations / EoD | §10 (Shift) | `shift.*`, `payment.settled` |

Every Architecture §5 module → has both schema tables and event topics. ✅

---

## ✅ Design Acceptance Checklist

- [x] Multi-tenant + multi-branch baked into every operational table
- [x] Immutable ledgers for Payment, Wallet, Stock, EMR (no UPDATE/DELETE)
- [x] Soft delete reserved for Master Data only
- [x] Transactional Outbox + Idempotency tracking modeled
- [x] DLQ + Reprocess workflow modeled
- [x] BreakGlassOverride explicitly required for ledger/EMR mutation
- [x] ABAC scopes (`tenant`, `branch`, `self`) defined
- [x] Encryption strategy (KMS + field-level + blind index) recorded
- [x] Event envelope with `correlation_id` / `causation_id` / `event_version`
- [x] Compensating transaction chain documented for reversal flow
- [x] CRM cron event topology covered (Phase 7)
- [x] AI assistive draft + approval log separated from immutable EMR

---

## ▶️ Next Steps (when you're ready)

When you give approval, the next phase is **Phase 0 + 1 implementation**:

1. Run `pnpm init` + Turborepo scaffolding
2. Create `packages/db` and copy `02-prisma-schema.prisma` → `packages/db/prisma/schema.prisma`
3. Create `packages/events` with Zod schemas matching `03-event-dictionary.md`
4. `docker-compose.yml` with MySQL 8 + Redis 7 + MinIO
5. First Prisma migration + seed (sample tenant + permissions + products)

Reply when ready and I'll proceed with scaffolding (will require `pnpm install`).
