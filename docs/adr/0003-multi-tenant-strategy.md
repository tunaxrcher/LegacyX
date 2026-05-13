# ADR 0003 — Multi-Tenant & Multi-Branch Strategy

- **Status**: Accepted
- **Date**: 2026-05-13

## Context
The platform is designed both as a single-tenant deployment (one clinic group) and as a SaaS hosting multiple unrelated clinic groups. Strong isolation must be the default to prevent cross-tenant data leaks, while keeping operational cost low.

## Decision
Adopt a **shared database, shared schema, row-level scoping** model.

- Every operational table contains `tenant_id` (NOT NULL) and, where applicable, `branch_id`.
- Every query is forced through a Prisma `$extends` middleware that injects `tenant_id` into `where` from the request context. Direct queries that bypass the extension are blocked by lint rule + code review checklist.
- Branch scoping is part of **ABAC** (`scope: "branch"`): a doctor's permission applies only to branches in `user_branch_access`.
- Composite indexes always lead with `tenant_id` (then `branch_id`) for cardinality efficiency.

### Why not schema-per-tenant or DB-per-tenant?
- Schema-per-tenant: Prisma migrations across hundreds of schemas is operationally painful.
- DB-per-tenant: too expensive for early-stage SaaS; can be added later as a "premium isolation tier" without changing the data model — promote a tenant to its own DB by replication and switch the connection string.

## Cross-cutting Requirements
- All event payloads carry `metadata.tenant_id` (and `branch_id` if relevant).
- Background workers MUST use a tenant-scoped Prisma client created from the event metadata; no global queries.
- Backups are tenant-aware (export filtered dumps for data portability / right-to-be-forgotten of an entire tenant).

## Consequences
- **+** One operational DB to monitor, lower cost.
- **+** Cross-tenant analytics (consented + anonymized) is straightforward.
- **−** A bug bypassing scope is catastrophic. Mitigations: Prisma middleware, integration tests asserting cross-tenant isolation, periodic chaos test (`SELECT` without tenant filter must error).
