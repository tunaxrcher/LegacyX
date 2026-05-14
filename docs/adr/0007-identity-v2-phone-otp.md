# ADR-0007 — Identity v2: Phone + OTP, single role per user

- **Status:** Accepted (Phase H, 2026-05)
- **Supersedes:** Implicit "email + password + multi-role" model from Phase 6 / 6.7
- **Related:** ADR-0005 (ABAC & Encryption), ADR-0001 (Event-driven monolith)

## Context

Phase 6 shipped a working email-based login with scrypt-hashed passwords and
many-to-many `UserRole`. After 6.7 + production trials at the partner clinic
in Q1, three pain points emerged:

1. **Email is a fiction.** Most Thai clinic staff don't use work email. Demo
   accounts (`reception@legacyx.local`) had to be invented just for login.
   Real users wanted to type a phone number — the same one used for HR
   contact / payroll / OTP banking.
2. **Multi-role users were exotic and confusing.** A single user with
   `[DOCTOR, MANAGER]` roles loaded both sidebars merged together,
   permissions OR'd. Manager-side actions appeared in the doctor's day-to-day
   queue. Audit logs showed a single actor doing both clinical and financial
   writes — hard to defend in a PDPA review.
3. **Password reset friction.** Forgotten passwords required a sysadmin
   round-trip. Receptionists were sharing logins.

## Decision

Replace email/password with **phone-number + OTP**, one role per user row.

### Schema changes

```prisma
model User {
  phone           String?  // E.164 normalized
  phoneHash       String?  // searchableHash(tenantId, phone) — keyed sha256
  primaryRoleCode String?  // single role per row
  // email column DROPPED

  @@unique([tenantId, phone, primaryRoleCode], name: "user_tenant_phone_role_unique")
  @@index([tenantId, phoneHash])
}
```

The composite `(tenantId, phone, primaryRoleCode)` unique constraint **allows
the same phone to appear multiple times if the role differs**. A doctor who
also manages payroll creates two rows: one `(0888888888, DOCTOR)`, one
`(0888888888, MANAGER)`. The login flow's "Step 1" (phone lookup) returns both;
the user picks a role before entering OTP.

### Auth flow

```
Step 1: POST /api/v1/auth/phone/lookup { tenant_slug, phone }
        → { roles: [{ code, name }, ...] }   // empty array on miss (no enum leak)

Step 2: POST /api/v1/auth/phone/login { tenant_slug, phone, otp, role_code? }
        → { token, tenant, user, branches, roles }   // standard session shape
```

### Backwards compatibility

- `UserRole` table still exists. Every `createUser` / `updateUser` writes a
  matching `UserRole` row so any code path doing `prisma.userRole.findMany`
  continues to work. The seed mirrors this too.
- `passwordHash` column kept (nullable) for future password-fallback use
  cases (kiosks without phone, etc). The auth path no longer reads it.
- ABAC matrix unchanged — same `Role` rows, same `RolePermission` entries.

### Why single role (not multi-role)

- **Auditability beats convenience.** A clear "this user acted as DOCTOR for
  this entry" is worth more than saving one row at signup.
- **UI hugely simpler.** Sidebar, dashboard redirect, and breadcrumbs are
  scoped to a single role.
- **No permission union complexity.** Either you have a role with a
  permission or you don't.
- **Easy disablement.** Suspending a person's manager role doesn't affect
  their doctor login.

### Why phone + OTP (not magic link / passkey / SSO)

- Phone is the universal identifier in our context. Every staff member has
  one. Email coverage was ~60%.
- OTP is familiar (every Thai bank app uses it).
- Magic link assumes email; passkey assumes modern device + browser; SSO
  requires Identity Provider procurement that small clinics don't have.
- We can layer passkey / SSO on top later without re-migrating users.

## Consequences

### Positive

- **Faster login** in user testing (~7s avg vs. ~22s for email+password).
- **Zero shared logins** observed in 2 weeks of pilot (every staff member
  has their phone on them).
- **Multi-tenant SaaS unlock**: same phone can exist across tenants without
  collision (tenant id is part of the unique key).
- **Clearer audit trail**: actor row's `primaryRoleCode` makes "why was this
  allowed?" trivial to answer.

### Negative

- **Phone churn**: users change phones more often than emails. UX must allow
  self-service phone update with old-phone OTP confirmation. **Not yet
  implemented — open tech-debt item.**
- **OTP cost**: real SMS provider (Twilio / SendCloud) is per-message.
  Production needs a 60s rate-limit per phone to bound this. **Currently in
  dev mode using universal OTP `123456` — see
  `docs/PRODUCTION_HARDENING.md` §5.**
- **Multi-role friction**: receptionist who is *also* an off-hours nurse
  must "log out + log in" to switch roles. Acceptable tradeoff (these
  shifts are scheduled, not interleaved).
- **Email-based password reset workflows** are gone — no big deal because
  password reset itself is gone.

### Neutral

- `User.email` column dropped (data-loss accepted; no production users at
  the time of the migration). The seed creates 7 phone-based demo users
  including a dual-role one.

## Operational notes for AI agents / future devs

- The OTP fallback (`DEV_OTP=123456`) is **fail-closed in production** — if
  env unset, all OTPs are rejected. Don't reintroduce a default that fails open.
- `searchableHash` and `normalizePhone` live in `@legacyx/db` (`packages/db/src/identity.ts`).
  Importing from elsewhere = hash drift = silent login failures. Don't.
- `ADMIN` role is system-only — UI never offers it, server rejects it. Bestow
  it via direct DB write or seed only.
- Role changes invalidate the in-process permission cache via
  `invalidatePermissionCache(tenantId, userId)`. Every mutator that touches
  `UserRole`, `User.primaryRoleCode`, `User.status`, or `UserBranchAccess`
  must call it.

## Open questions for v3

- Should patient-app and backoffice share the same OTP backend (rate-limit
  pool, audit log)? Probably yes once both are out of dev OTP mode.
- Migrate `UserRole` to be the source of truth and drop `primaryRoleCode`?
  Re-add multi-role with explicit "login as" choice? Revisit if we see real
  demand from larger tenants.
