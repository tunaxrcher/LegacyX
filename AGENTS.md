# AGENTS.md — Conventions for AI Agents & Humans

> One-page playbook for anyone (or anything) modifying this codebase. **Read
> this before your first PR / task.** Anchors keep AI sessions aligned across
> conversations so the same patterns keep showing up.

## What this repo is

LegacyX is an Enterprise Clinic Management System — a **multi-tenant,
multi-branch, event-driven modular monolith** running on Next.js + Prisma +
MySQL + Redis (BullMQ). Architecture intent: see `docs/ARCHITECTURE.md`.
Current implementation status: see `docs/PROGRESS.md`. Roles & permissions:
see `docs/ROLES.md`.

```
apps/api-server      :3001  Next.js API routes — Bearer auth, ABAC, business logic
apps/backoffice-web  :3003  Next.js UI for clinic staff (Reception → Admin)
apps/patient-app     :3004  Next.js PWA + LIFF for patients (guest + authed flow)
apps/worker-engine          Node BullMQ workers + Outbox Relay + CRM cron + Notif dispatcher
apps/ai-service      :3002  Node AI orchestrator (mock providers in dev)
packages/db                 Prisma schema + client + seed + shared identity helpers
packages/events             Versioned event payload Zod schemas
packages/types              Cross-app DTOs (Zod)
```

## Identity & Auth — current model

- **Backoffice staff** log in with **Phone + OTP** (no email/password). A user
  has exactly one role (`User.primaryRoleCode`). The same phone may appear on
  multiple rows if the role differs; the login flow shows a role picker.
- **Patients** log in via a separate **HS256 JWT** flow (LIFF or phone+OTP).
  Sessions live in cookies. The api-server validates Bearer tokens on every
  request — *never* trust `x-tenant-id` / `x-user-id` headers.
- The legacy `User.email` column is **gone**. `UserRole` table still exists
  as a 1-row mirror of `primaryRoleCode` (back-compat).
- See ADR `docs/adr/0007-identity-v2.md` for rationale.

## Hard rules — break these and the system breaks

1. **Tenant guard on every Prisma read/write.** Always filter by
   `tenantId: ctx.tenantId`. Never accept `tenantId` from the request body.
2. **Outbox for domain events.** Any mutation that emits a `*.{created,
   completed, settled, …}` event MUST use `writeWithOutbox()` so the event
   row is written in the same DB transaction as the data change. Workers
   pick it up via the relay. See `apps/api-server/src/shared/outbox.ts`.
3. **ABAC on every mutation.** Call `authorize(ctx, { resource, action,
   target })` before writing. Scope (`tenant` / `branch` / `self`) comes
   from the seed `ROLE_MATRIX`.
   - **Role allowlist** (Phase Q SoD): some resources need an extra
     guard *beyond* ABAC. ADMIN and MANAGER both hold `user:write:tenant`
     but a Manager must not be able to escalate themselves; the service
     layer enforces a static allowlist. Pattern lives in
     `apps/api-server/src/modules/admin/admin-users.service.ts`
     (`getAssignableRoleCodes` / `getVisibleRoleCodes`). Any new
     identity-touching action (lock / unlock / reset / branch-assign)
     MUST also call `assertCanManageTargetRole`.
4. **Idempotency in workers.** Every handler must check `ProcessedEvent`
   before acting and skip if already processed.
5. **Immutable data.** EMR (after sign), Wallet ledger, Stock ledger,
   AuditLog, Payment rows — never UPDATE/DELETE. Reverse with new rows.
6. **PII at rest.** Patient phone/email/NID/nickname go through
   `encryptField()`; `searchableHash()` provides the lookup index.

## Code style — what the codebase uses today

| Convention | What to do | Where to look |
|---|---|---|
| **Route handler** | `try { ctx = await getRequestContext(); ... return NextResponse.json({ data, correlation_id: ctx.correlationId }); } catch (err) { return toErrorResponse(err, correlationId); }` | `apps/api-server/src/app/api/v1/visits/route.ts` |
| **Service DTOs** | `export const FooDto = z.object({...})`; service `export async function foo(ctx, input: z.infer<typeof FooDto>)` | `apps/api-server/src/modules/visit/visit.service.ts` |
| **Errors** | `throw BadRequest("...")` / `Unauthorized` / `Forbidden` / `NotFound` / `Conflict` from `shared/errors.ts`. Never throw `Error` — `toErrorResponse` won't classify it. | `apps/api-server/src/shared/errors.ts` |
| **Permissions** | `await authorize(ctx, { resource: "patient", action: "write", target: { branchId } })` *before* the write | `apps/api-server/src/shared/auth.ts` |
| **Phone hashing** | Import `searchableHash` + `normalizePhone` from `@legacyx/db` — never reimplement | `packages/db/src/identity.ts` |
| **Correlation IDs** | Forward `ctx.correlationId` to `toErrorResponse(err, correlationId)`. ULIDs for new records (`ulid()`), `crypto.randomUUID()` only for one-shot HTTP correlation when no ctx exists yet. | `apps/api-server/src/shared/context.ts` |
| **i18n** | All user-facing strings go through `useTranslations()` (client) or `getTranslations()` (server). Keep TH + EN in lock-step in `messages/`. | `apps/backoffice-web/src/i18n/messages/` |
| **UI components** | shadcn/ui primitives inline in `apps/backoffice-web/src/components/ui/`. Patient app has its own minimal set. **No** `packages/ui` — design system lives in each app. | `apps/backoffice-web/src/components/ui/` |
| **Server actions** | Patient-app booking + auth, backoffice login/logout. They `fetch()` the api-server with `cache: "no-store"`. Don't sneak Prisma calls into Server Actions. | `apps/patient-app/src/app/(authed)/s/[id]/book/actions.ts` |
| **Cache invalidation** | After any user/role/branch-access write, call `invalidatePermissionCache(ctx.tenantId, userId)` | `apps/api-server/src/shared/auth.ts` |

## Things that look tempting but DON'T do

- ❌ Reimplement `searchableHash` / `normalizePhone` locally (use `@legacyx/db`)
- ❌ Accept `tenant_id` in a request body (always derive from `ctx`)
- ❌ Hardcode `tenant_slug: "legacyx"` (use `PATIENT_APP_TENANT_SLUG` env)
- ❌ Add `email` back to the `User` model (phone is the identity now)
- ❌ Use `next-auth`, `bcrypt`, or other auth libs (we have a deliberate
  custom flow — see ADR-0007)
- ❌ Read/write directly from a Server Action skipping `ctx` — that bypasses
  ABAC. Server Actions should `fetch()` the api-server.
- ❌ Update the in-process permission cache directly — call
  `invalidatePermissionCache()` instead
- ❌ Throw a generic `Error` from a route — `toErrorResponse` will return
  500 with no classification

## Where to find things

| Need to … | Start here |
|---|---|
| Understand event flow for a feature | `docs/design/03-event-dictionary.md` + `docs/design/04-sequence-diagrams.md` |
| Add a new permission | `packages/db/prisma/seed.ts` → `PERMISSIONS` + `ROLE_MATRIX`, then re-seed |
| Add a new event | `packages/events/src/*.ts` with a `*V1` Zod schema, then export via `index.ts` |
| Add a worker handler | `apps/worker-engine/src/handlers/<name>.ts` + register in `apps/worker-engine/src/index.ts` |
| Add a backoffice page | `apps/backoffice-web/src/app/(authed)/...` + add sidebar entry in `components/app-shell/sidebar.tsx` + i18n keys for both `en.json` and `th.json` |
| Add a service catalog item | `/manager/services` UI in backoffice — system auto-generates codes from name; image goes to S3 |
| Add patient-facing page | `apps/patient-app/src/app/...`. Public pages live outside `(authed)`; authed pages inside |
| Debug a failed job | `/dlq` (System Admin only) → inspect → reprocess |
| Read metrics | `curl -H "Authorization: Bearer $METRICS_BEARER_TOKEN" /api/metrics` (api-server) or `:9464/metrics` (worker-engine) |

## Verification commands

Run these before declaring "done":

```sh
pnpm -w typecheck            # All 8 packages must pass
pnpm -w lint                 # 3 Next apps must pass (--max-warnings=0)
pnpm db:seed                 # Should print 8 users including 0888888888 dual
# Smoke: login as 0800000002 (MANAGER) + OTP 123456 → /manager/dashboard loads
```

## Documentation map

- `docs/ARCHITECTURE.md` — vision + design intent
- `docs/PROGRESS.md` — what's actually built (Phase A → H + tech debt)
- `docs/ROLES.md` — RBAC/ABAC permission matrix
- `docs/DEMO_WORKFLOW.md` — end-to-end test scenarios
- `docs/PRODUCTION_HARDENING.md` — pre-deploy checklist
- `docs/CONVENTIONS.md` — deeper code-style reference (this file is the short version)
- `docs/adr/` — Architecture Decision Records (one per major decision)
- `docs/design/02-prisma-schema.prisma` — annotated reference schema
- `.env.example` — every env var the system reads

## When the tide doesn't match the map

If you find code that contradicts this document, **the code wins** — fix this
file in the same PR. If you find docs that contradict the code, fix the docs
in the same PR (or call it out). Drift kills future agents.
