# ADR 0001 — Event-Driven Modular Monolith on Monorepo

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: Engineering Lead, Architect

## Context
LegacyX must support multi-branch + multi-tenant clinics with strict data integrity for EMR, financial ledger, and inventory. The team is small but the domain is large (Identity, EMR, Inventory, Financial, AI, CRM). We need:
- ACID transaction guarantees on critical writes (payment + wallet + stock).
- Independent deployability of long-running async work (PDF, AI, notifications).
- Shared types + DB schema between Frontend and Backend.

## Options Considered
1. **Microservices from day 1** — high operational cost, distributed transaction complexity (sagas everywhere), small team can't sustain.
2. **Single Next.js app** — couples background jobs to web process; long-running tasks cause cold starts and scaling pain.
3. **Modular Monolith on Monorepo + dedicated Worker process** ✅

## Decision
- Use **Turborepo + pnpm workspaces**.
- One transactional core in `apps/api-server` (Next.js Route Handlers / Server Actions) for synchronous business logic.
- A separate `apps/worker-engine` Node.js process for asynchronous work and cron.
- A separate `apps/ai-service` to insulate AI latency/cost from core path.
- Communication via **Transactional Outbox + Redis BullMQ** (or AWS SQS for production).

## Consequences
- **+** Strong ACID for the synchronous critical path; queue work survives Next.js redeploys.
- **+** Future split into microservices is mechanical (modules already isolated by directory + events).
- **−** Outbox relay must be operationally healthy (monitoring + DLQ).
- **−** Schema evolution is shared between apps; coordinated migrations required.
