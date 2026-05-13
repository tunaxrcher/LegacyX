# ADR 0005 — ABAC Authorization & Encryption Strategy

- **Status**: Accepted
- **Date**: 2026-05-13

## Context
RBAC alone cannot express "Doctor X may read EMR only in branches Y, Z". PDPA also requires encryption of sensitive PII at rest in addition to disk-level encryption.

## Decision

### Authorization: ABAC on top of Roles
- A `Role` is a bag of `(resource, action, scope)` permissions.
- `scope` values: `tenant`, `branch`, `self`.
- Runtime check evaluates: `permission ∈ user.roles ∧ scopeMatches(scope, subject, target)`.
  - `branch`: `target.branch_id ∈ user.branch_access`
  - `self`: `target.created_by === user.id` (for staff own-records) or `target.patient_id === user.patient_id` (for patient app)

Implemented in `packages/auth` as a pure function — unit-testable; called by `apps/api-server` middleware **and** server actions, never relying on UI hiding.

### Encryption
| Layer | Mechanism | Scope |
|-------|-----------|-------|
| Disk | RDS / volume encryption (AES-256) | All tables |
| Field-level (app) | AES-256-GCM with per-tenant key from KMS | EMR `content_enc`, `patients.national_id_enc`, `phone_enc`, `email_enc`, `nickname_enc` |
| Transport | TLS 1.3 only | All connections |
| Object Storage | S3 SSE + Signed URLs (15 min default) | Documents, signatures, AI inputs |

- Encryption keys are stored in KMS (AWS KMS or DigitalOcean equivalent). Application loads a Data Encryption Key (DEK) per tenant, decrypted by the master KMS key — never logged.
- Search on encrypted fields uses **deterministic blind index** for exact-match lookups (`national_id`) and tokenized prefix indexes for names (separate columns, not on the encrypted blob).

### Consent & PDPA
- `ConsentSnapshot` stores SHA-256 hash of the rendered template + version, so we can prove which exact wording the patient agreed to.
- Right-to-be-forgotten: replace PII fields with `REDACTED` deterministic markers; ledger rows are kept (legal requirement) with `patient_id` retained but external PII columns blanked. A `patient.redacted_at` timestamp + `RedactionLog` row is created.

## Consequences
- **+** Fine-grained access matches real clinic hierarchy.
- **+** Encryption survives DB dump leaks.
- **−** Field-level encryption defeats some Prisma niceties (no `LIKE` on encrypted columns) — use blind index columns for searchable fields.
- **−** Key rotation requires re-encrypting blobs; mitigate via key-versioning column on each encrypted record.
