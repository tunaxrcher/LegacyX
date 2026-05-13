# 📦 LegacyX — Monorepo Folder Structure

> Reference: `docs/ARCHITECTURE.md` §3
> Strategy: **Turborepo + pnpm workspaces** (Modular Monolith, shared types & schema)

---

## Top-level Layout

```
legacyx/
├─ apps/
│  ├─ patient-app/              # Next.js 14 (App Router) — PWA / LIFF for patients
│  ├─ clinical-pad/             # Next.js 14 — Tablet UX for doctors/assistants
│  ├─ backoffice-web/           # Next.js 14 — Desktop dashboard (counter, pharmacy, admin)
│  ├─ api-server/               # Next.js 14 — Core API (Route Handlers + Server Actions)
│  ├─ worker-engine/            # Node.js + BullMQ — async jobs, outbox relay, cron
│  └─ ai-service/               # Node.js — AI orchestrator (STT, LLM, Vision)
│
├─ packages/
│  ├─ db/                       # Prisma schema, migrations, seed, repository helpers
│  ├─ types/                    # Zod schemas + shared TS types (DTOs, API contracts)
│  ├─ events/                   # Event Dictionary (constants, payload types, versions)
│  ├─ ui/                       # Design System (React + Tailwind + shadcn/ui)
│  ├─ auth/                     # ABAC engine, session, JWT, scope evaluator
│  ├─ logger/                   # Pino wrapper + correlation_id propagation
│  ├─ observability/            # OpenTelemetry, metrics, tracing helpers
│  └─ config/                   # eslint-config, tsconfig-base, prettier-config
│
├─ infra/
│  ├─ docker/                   # docker-compose (mysql, redis, minio, mailhog)
│  ├─ k8s/                      # Helm charts / manifests (later)
│  └─ terraform/                # Cloud infra (S3, RDS, SQS) — optional
│
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ design/                   # Folder structure, schema, event dict (this folder)
│  ├─ adr/                      # Architecture Decision Records
│  └─ runbooks/                 # On-call playbooks (DLQ replay, break-glass, etc.)
│
├─ .github/workflows/           # CI: lint, typecheck, test, prisma migrate deploy
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
└─ tsconfig.base.json
```

---

## App Internal Conventions

### `apps/api-server/` (Next.js)
```
src/
├─ app/
│  └─ api/
│     ├─ v1/
│     │  ├─ patients/route.ts
│     │  ├─ appointments/route.ts
│     │  ├─ payments/route.ts
│     │  └─ ...
│     └─ webhooks/              # Payment Gateway, LINE, e-Tax callbacks
├─ modules/                     # Domain modules (vertical slice)
│  ├─ identity/
│  │  ├─ identity.service.ts
│  │  ├─ identity.repo.ts
│  │  ├─ identity.controller.ts
│  │  └─ identity.policies.ts   # ABAC rules
│  ├─ patient/
│  ├─ emr/
│  ├─ appointment/
│  ├─ resource/
│  ├─ inventory/
│  ├─ financial/
│  ├─ clinical-order/
│  ├─ document/
│  └─ notification/
├─ shared/
│  ├─ outbox/                   # writeWithOutbox() helper (DB tx + event)
│  ├─ middleware/               # auth, tenant, branch, correlation_id
│  └─ errors/
└─ middleware.ts                # Next.js middleware (auth + tenant resolution)
```

### `apps/worker-engine/` (Node.js)
```
src/
├─ index.ts                     # Bootstrap BullMQ workers + cron
├─ queues/
│  ├─ outbox-relay.queue.ts     # Reads OutboxEvent → publishes to topic queues
│  ├─ document.queue.ts         # PDF generation (consent, receipt, tax)
│  ├─ notification.queue.ts     # LINE / SMS / Email
│  ├─ inventory.queue.ts        # BOM stock cutter
│  ├─ ai.queue.ts               # Delegates to ai-service
│  └─ dlq.queue.ts              # Dead Letter inspector
├─ handlers/                    # Event → handler mapping
│  ├─ payment.completed.ts
│  ├─ procedure.completed.ts
│  ├─ emr.signed.ts
│  └─ ...
├─ cron/
│  ├─ review-requested.cron.ts  # +3 days
│  ├─ wallet-expiring.cron.ts   # T-30 days
│  ├─ rebooking-reminder.cron.ts
│  └─ birthday-bonus.cron.ts
└─ shared/
   ├─ idempotency.ts            # Check ProcessedEvent before run
   └─ retry-policy.ts
```

### `packages/db/`
```
prisma/
├─ schema.prisma                # Single source of truth
├─ migrations/
└─ seed.ts
src/
├─ client.ts                    # PrismaClient singleton
├─ repositories/                # Optional thin repos for complex queries
└─ tenant-extension.ts          # Prisma $extends for tenant_id auto-scoping
```

### `packages/events/`
```
src/
├─ dictionary.ts                # EVENT_NAMES const enum
├─ schemas/                     # Zod payload schemas per event + version
│  ├─ appointment.created.v1.ts
│  ├─ payment.completed.v1.ts
│  └─ ...
├─ metadata.ts                  # EventMetadata type (correlation, causation, tenant)
└─ index.ts
```

---

## Naming & Style Rules

- **Module names**: `kebab-case` folders, `PascalCase` types, `camelCase` functions
- **Event names**: `domain.action` lowercase dot-separated, suffix version (`v1`, `v2`)
- **DB tables**: `snake_case` (Prisma `@@map`), models `PascalCase`
- **Multi-tenant**: every operational table has `tenant_id` + `branch_id` (where applicable) and a compound index `(tenant_id, branch_id, ...)`
- **Soft delete**: `deleted_at DateTime?` only on Master Data (User, Product, Resource, Promotion). **Never** on Ledger/EMR/Payment.
