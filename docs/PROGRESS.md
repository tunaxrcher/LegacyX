# 📊 LegacyX — Implementation Progress

> Living document tracking what has been **built** vs. what is **planned** per
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). Updated at the end of each delivery
> phase.

Last updated: **Tech-Debt Sprint (post-Phase H) — Pre-Phase-next audit cleanup:** `searchableHash` + `normalizePhone` unified into `@legacyx/db` (single source — seed/api/worker all use the same function so phoneHash drift is impossible); **`DEV_OTP` fail-closed in production** (defaults to `""` instead of `"123456"` when `NODE_ENV=production`); **header-only context mode locked** in prod behind `INTERNAL_API_SECRET`; `/api/dev/identities` requires same internal secret in prod; `/api/metrics` returns 503 in prod without `METRICS_BEARER_TOKEN`; **`invalidatePermissionCache` wired** into `updateUser` + `assignBranches` (no more stale RBAC after role change without restart); patient-app `tenant_slug` resolved from `PATIENT_APP_TENANT_SLUG` env (no more hardcoded "legacyx"); **ESLint** root flat config + `lint` scripts added to all 3 Next apps (`pnpm -w lint` passes); dead `loginAction` deleted from backoffice login actions; orphan `apps/patient-app/src/lib/liff.ts` deleted; AdminUser TS types cleaned (no more `email: string | null` leftovers); stale "Email is still tracked" comment in admin-users.service corrected; `.env.example` rewritten with all 30 env vars the codebase actually reads (was missing 10); `turbo.json globalEnv` expanded to match; new `AGENTS.md` at repo root for AI/human onboarding + `docs/CONVENTIONS.md` for deep code-style ref + ADR `docs/adr/0007-identity-v2-phone-otp.md` documenting the phone+OTP migration rationale.**

Earlier: **Phase H — Identity v2 + Admin/Setup split complete — Backoffice authentication switched from email/password to **Phone + OTP** (dev OTP `123456`, env `DEV_OTP`). `User.email` column dropped from schema (and from seed/audit/notification-dispatcher/dev identities); new `phone`, `phoneHash` (HMAC-SHA256 keyed), and `primaryRoleCode` columns with composite uniqueness `(tenantId, phone, primaryRoleCode)` — same phone may exist multiple times if `primaryRoleCode` differs (e.g. dual-role demo user `0888888888` registered as both DOCTOR and MANAGER). Login flow has 2 steps: `POST /api/v1/auth/phone/lookup` → if multiple roles, UI shows role picker; `POST /api/v1/auth/phone/login` mints session. OTP entry rendered as floating dialog over phone screen. Admin user CRUD: replaced email+multi-role chips with phone + single-role `<Select>` + optional profile picture upload to S3 via new `POST /api/v1/uploads/avatar` (2 MB max, `user:write` guard). `ADMIN` role hidden from new-user UI and rejected server-side. ADMIN-only users redirect to new `/admin` System Overview (users / roles / DLQ / settings KPIs); MANAGER+ops users stay on `/`. Sidebar reorganized into 3 groups: **Finance & Insights** (dashboard / catalog / EOD / audit / break-glass — MANAGER), **Clinic Setup** (rooms / services / notifications — MANAGER), **System Admin** (admin overview / users / roles / DLQ / settings — ADMIN). S3 image uploads now use DO Spaces virtual-host style (`sgp1.digitaloceanspaces.com`, `S3_FORCE_PATH_STYLE=false`) with detailed `S3UploadError` → `502 STORAGE_ERROR` propagation so the UI shows the real provider error.**

Previous: **Phase G — Patient App Guest Flow complete — Forced LIFF login REMOVED from `apps/patient-app`; new guest-friendly flow lets visitors browse without auth: `/` welcome with category cards (image 1) → `/c/[slug]` services list (image 2) → `/s/[id]/register` name+phone+KYC form (image 3) → `/s/[id]/book` slot picker with นัดล่วงหน้า/walk-in tabs + disabled-when-full slots (image 4) → `/booking/[id]/success` confirmation with auto-login (image 5). Schema additions: `ServiceCategory` + `Service` models (patient-facing 2-level catalog linked back to staff `procedureCode`); `Patient.kycImageUrl` + `verificationStatus` enum + `phoneHash` (deterministic SHA-256 keyed lookup for guest dedupe without decrypting `phoneEnc`). New public API namespace `/api/v1/public/{categories,categories/[code]/services,services/[id],branches,slots,book}` — no auth, the `POST /book` endpoint upserts Patient by `phoneHash` and mints a patient JWT atomically (auto-login on success page). Bottom nav now renders 4 tabs for logged-in users and 2 (Home + Sign in) for guests. Seed adds 3 categories (Dental / Beauty & Spa / Wellness) + 10 services with demo Unsplash images. All 8 packages typecheck clean.**

Earlier: **Phase 9 Observability + Prod complete — Lightweight zero-dep Prometheus metrics collector (Counter/Gauge/Histogram + text-format renderer) on both `apps/api-server` (`/api/metrics` route + `/api/healthz` liveness + `/api/readyz` DB readiness probe with `METRICS_BEARER_TOKEN`) and `apps/worker-engine` (standalone HTTP server on `:9464` for `/metrics` + `/healthz` + `/readyz`), worker metrics (`legacyx_worker_handler_runs_total`, `legacyx_worker_handler_duration_seconds`, `legacyx_worker_queue_depth`, `legacyx_worker_outbox_pending`, `legacyx_worker_dlq_depth`, `legacyx_worker_notifications_sent_total`, `legacyx_worker_cron_runs_total`, `legacyx_worker_cron_enqueued_total`), gauges refreshed every 15 s; multi-stage non-root Dockerfiles for all 5 apps + `docker-compose.prod.yml` w/ named volumes + healthchecks + `.env.prod.example`; GitHub Actions CI (lint + typecheck + build matrix + Docker buildx) + Dependabot weekly + PR template; `docs/PRODUCTION_HARDENING.md` 13-section pre-deploy checklist.**

---

## ✅ Foundation (delivered)

| Area | Status | Notes |
|---|---|---|
| Turborepo + pnpm monorepo | ✅ | `apps/*`, `packages/*` |
| MySQL 8 + Prisma | ✅ | `packages/db` with seed |
| Redis 7 + BullMQ worker | ✅ | `apps/worker-engine` |
| Multi-tenant + multi-branch | ✅ | every operational row tagged |
| Transactional Outbox + Relay | ✅ | `writeWithOutbox()` helper, OutboxEvent + ProcessedEvent + DeadLetter |
| Idempotency + DLQ | ✅ | worker checks ProcessedEvent; DLQ admin endpoint + UI |
| ABAC authorization | ✅ | `authorize()` with `tenant`/`branch`/`self` scopes |
| AES-256-GCM field encryption | ✅ | helper in EMR (Subjective/Plan/etc.) |
| Backoffice UI shell (shadcn/ui, dark mode, i18n TH/EN, Cmd+K) | ✅ | Phase 5.5 — see ADR-0006 |
| **Theme Refresh v2** (teal `#1bb59b` brand, animated gradient buttons, light sidebar, dialog conventions: backdrop blur + centered logo + confirm-only footer) | ✅ | see ADR-0006 Revision v2 |
| Identity v2 — Phone + OTP login | ✅ | single role per user via `User.primaryRoleCode`; `(tenant, phone, role)` unique; role picker on lookup if phone has >1 role; profile picture upload to S3; ADMIN reserved (cannot be assigned from UI); legacy `User.email` column removed |
| Dev OTP shortcut | ⚠️ | `DEV_OTP=123456` accepted for all phones in dev — swap with real provider before prod |

---

## 🧭 User Journey Coverage (per ARCHITECTURE §6)

### 🟢 Phase 1 — Pre-Visit & Triage
| Event / Capability | Endpoint / UI | Status |
|---|---|---|
| `appointment.created` | `POST /api/v1/appointments` + UI dialog | ✅ |
| AI Intake Summary (mock) | `POST /api/v1/ai/intake-summary` + AI Drafts UI | ✅ |
| Consent Snapshot capture | — | ❌ schema only |
| `visit.checked_in` | `POST /api/v1/visits/check-in` + UI on Appointments Today | ✅ Phase A |
| Resource reservation (room assignment) | CheckInDialog · `GET /api/v1/resources` | ✅ Phase A |
| Visit start (`IN_PROGRESS`) | `POST /api/v1/visits/{id}/start` + Visits page button | ✅ Phase A |

### 🟢 Phase 2 — Consultation & Lab
| Event | Status |
|---|---|
| EMR draft (AI assistive — voice-to-note mock) | ✅ |
| **AI Assistant in SOAP tab** (Web Speech API voice capture · transcript editing · heuristic SOAP splitter Thai/English · link accepted draft to `emr.signed`) | ✅ UX Sprint |
| `emr.signed` (immutable + encrypted + version) | ✅ |
| **Auto-bump visit status** `OPEN → IN_PROGRESS` on first clinical action (order.created or emr.signed) | ✅ UX Sprint |
| `lab.ordered` / `lab.resulted` | ❌ schema only |
| `document.requested` (PDF generation) | ✅ Phase C |
| `document.generated` | ✅ Phase C |
| `order.created` (medication/procedure) | ✅ Phase B |
| `order.cancelled` | ✅ Phase B |

### 🟢 Phase 3 — Payment, Pharmacy & Dispatch
| Event | Status |
|---|---|
| Invoice generation | ✅ Phase C (`POST /api/v1/invoices` from order, auto-numbered) |
| `invoice.created` / `invoice.issued` / `invoice.paid` / `invoice.voided` | ✅ Phase C |
| `payment.authorized → completed` | ✅ Phase C |
| `payment.settled` (gateway batch) | ✅ Phase 6.8 (`POST /api/v1/payments/settle-batch` + accounting CSV worker stub) |
| `payment.refunded` (compensating row + invoice revert) | ✅ Phase C |
| `wallet.purchased` | ✅ Phase A |
| `wallet.used` | ✅ Phase A + auto-trigger on procedure.complete in Phase B |
| `pharmacy.preparing` / `pharmacy.dispensed` | ❌ |

### 🟢 Phase 4 — Procedure & Aftercare
| Event | Status |
|---|---|
| `procedure.started` | ✅ Phase B |
| `procedure.completed` | ✅ Phase B |
| `procedure.cancelled` | ✅ Phase B |
| `inventory.adjusted` (BOM auto-consume) | ✅ Phase B (worker handler) |
| `stock.received` (manual receive) | ✅ Phase B |
| Doctor Fee / Commission | ❌ |
| Aftercare LINE 24h queue | ❌ (depends on Notification Layer) |

### 🔴 Phase 5 — Reversal & Cancellation
| Event | Status |
|---|---|
| `order.cancelled` | ✅ Phase B (cancels procedures too) |
| `invoice.voided` / `payment.refunded` | ✅ Phase C |
| `wallet.reversed` | ✅ Phase A (endpoint ready) |
| `stock.reversed` | ✅ Phase 5-reversal (manual via `/inventory/{productId}` ledger viewer) |
| `procedure.cancelled` | ✅ Phase B |

### 🟣 Phase 6 — End-of-Day
| Event | Status |
|---|---|
| `shift.closed` | ✅ Phase 6.8 (`POST /api/v1/shifts/{id}/close` — cash count + variance + audit + alert if variance ≥ ฿1,000) |
| `payment.settled` (gateway batch) | ✅ Phase 6.8 (`POST /api/v1/payments/settle-batch` — multi-payment batch + fee distribution + accounting CSV stub at `storage/accounting/{tenant}/{branch}/settlement.csv`) |
| `inventory.reconciled` | ✅ Phase 6.8 (`POST /api/v1/inventory/reconcile` — manager stock count + variance vs ledger + Break-Glass override required for non-zero variance + auto `ADJUSTMENT` ledger entry) |

### 🟠 Phase 7 — CRM & Retention (cron)
| Event | Status |
|---|---|
| `patient.review_requested` (D+3) | ✅ Phase 8 (`crm-cron.ts` job, `review.request` template, dispatched via Notification Layer) |
| `campaign.rebooking_reminder` | ✅ Phase 8 (30d since last visit + no upcoming, `rebooking.reminder` template) |
| `wallet.expiring_reminder` | ✅ Phase 8 (14d horizon, `wallet.expiring` template) |
| `campaign.birthday_bonus` | ✅ Phase 8 (MM-DD match, `birthday.bonus` template, idempotent 300d window) |

---

## 🧩 Cross-cutting Modules

| Module (ARCH §5) | Status |
|---|---|
| Security, Compliance & Identity | ✅ ABAC + encryption + **token-validated auth** (Bearer Authorization → DB Session lookup per request, header spoofing rejected) + **patient JWT (HS256)** for LIFF + Audit Log viewer + Break-Glass UI + User CRUD + Role/Permission matrix viewer + **env-driven CORS allowlist**; ❌ Patient Merge Engine; ❌ MFA |
| Document & Integration | ⚠️ PDF (zero-dep stub) + local storage ✅; **LINE/SMS/Email queue ✅ Phase 8** (provider abstraction with console/LINE/Twilio/SendGrid + template registry TH/EN + dispatcher tick + retry/DLQ + `/admin/notifications` viewer); Payment gateway adapter (QR PromptPay webhook) ❌ |
| Clinical & AI | ✅ EMR signed/versioned + AI drafts + **AI Assistant in SOAP** (voice-to-note via Web Speech API + Thai/EN heuristic SOAP splitter + draft linking); ❌ Lab/Order |
| Financial & Promotion | ✅ Wallet, Invoice, Payment (auth→complete→refund→settle); ❌ Promotion engine (birthday bonus template exists in Phase 8 but actual coupon issuance pending), ❌ Doctor Fee/Commission |
| Generic Resource & Inventory | ✅ Resource CRUD + UI (card grid by floor) + release/maintenance + auto-release on visit complete; BOM auto-consume (worker); stock ledger UI, manual receive/adjust; **Pharmacy dispense queue (cuts stock + emits `pharmacy.dispensed`)**; **Manager Catalog CRUD** (Products + BOMs UI, `catalog:manage` permission for MANAGER/ADMIN); **Seed expansion** (28 products across medications/supplies/cosmetics/courses + 6 BOMs for procedures) |

---

## 🖥️ Frontend Apps

| App | Status |
|---|---|
| `apps/backoffice-web` (Desktop staff) | ✅ Real Login (6 demo users) · Role-filtered sidebar (light, teal-accent) · Branch picker · **Dashboard** (redesigned KPI hero + timeline rows) · **Appointments** (timeline UX refresh) · Visits (+Orders with cart-style `NewOrderDialog` + ProductPicker + running subtotal · Procedures · Billing · Complete · **SOAP tab with AI Assistant**) · Patients · Rooms & Resources · **Pharmacy** · AI Drafts · EMR Sign · **Inventory** (KPI tiles + search + category chips + low-stock filter + visual stock bars + searchable StockActions) · **Manager / Catalog** (Products + BOMs CRUD) · **Manager / EoD** (Shift · Settlement · Recon) · Audit Log · Break-Glass · **Admin Users + Roles + Resources** · DLQ |
| `apps/clinical-pad` (Tablet, touch) | ❌ |
| `apps/patient-app` (LIFF/PWA — booking, history, course balance) | ✅ Phase 7 — mobile-first Next.js app on :3004 · PWA manifest + service worker (network-first for API, cache-first for shell) · LIFF SDK wrapper with mock fallback (configurable via `NEXT_PUBLIC_LIFF_ID`) · JWT (HS256) patient session 14-day TTL · 5-tab bottom nav (Home · Book · Visits · Courses · Profile) · Booking flow (branch picker · 14-day date strip · 30-min slot grid · optional reason · LIFF channel) · Visit history with receipt deep-link · Course wallet w/ ledger · Aftercare CTA based on recent procedures · i18n TH/EN (97 keys parity) |

---

## 🗺️ Delivery Roadmap

| Phase | Scope | State |
|---|---|---|
| **Phase A** | Visit + Resource + Wallet backbone | ✅ done |
| **Phase B** | Order + Procedure + BOM auto-consume + Inventory ledger | ✅ done |
| **Phase C** | Invoice + Payment state machine + Document/PDF worker + local storage | ✅ done |
| **Phase 5 (reversal chain)** | order.cancelled, stock.reversed, procedure.cancelled, refund | ✅ done |
| **Phase 6 (real auth + Audit + Break-Glass)** | scrypt + Session table + login/logout/me + audit viewer + break-glass approval UI | ✅ done |
| **Phase 6.6 (Resource Engine UI)** | Multi-room seed, CRUD API, card-grid UI by floor, release, maintenance, auto-release on visit.complete, `resource.*` events | ✅ done |
| **Phase 6.7 (Multi-role + Pharmacy + RBAC UI)** | 6 demo users seeded, role-filtered sidebar, branch picker, /pharmacy dispense queue (cuts stock), /admin/users + /admin/roles viewer, ADMIN → sysadmin-only + /admin/resources CRUD | ✅ done |
| **Stabilization sprint** | Bearer token validated per request, env-driven CORS allowlist, `$queryRawUnsafe` → Prisma distinct, `SESSION_COOKIE_OPTIONS` helper, `getActorOrThrow`/`getBranchOrThrow` helpers, t:any → typed translator, `nav.admin` reorg | ✅ done |
| **UX Sprint** | Auto-bump visit status on first clinical action · Seed expansion (28 products + 6 BOMs) · Manager Catalog CRUD (Products + BOMs + `catalog:manage`) · `NewOrderDialog` cart UX + ProductPicker + subtotal · Inventory page redesign (KPI tiles + filters + stock bars) + `ProductPicker` in StockActions · **AI Assistant in SOAP** (Web Speech API voice → transcript → heuristic SOAP splitter → link to `emr.signed`) · **Theme Refresh v2** (teal `#1bb59b` brand, animated gradient buttons, light sidebar with teal active pill, dialog conventions: backdrop-blur-md + centered logo header + confirm-only footer, swept 18 dialogs to drop Cancel buttons, Input/Select/Card/Tabs/PageHeader/Dashboard shell polish) | ✅ done |
| **Phase 6.8 (EoD Operations)** | `/manager/eod` page with 3 tabs (Shift Close · Settlement · Inventory Recon) · `shift.{open,close}` + `payment.settle` + `inventory.reconcile` ABAC perms (Manager/Reception) · 3 new event schemas (`ShiftClosedV1` · `PaymentSettledV1` · `InventoryReconciledV1`) · Shift module (open/close/list/current with auto-cash-expected calc) · Settlement module (unsettled list + batch settle with fee distribution) · Inventory reconcile module (variance + Break-Glass override + auto `ADJUSTMENT` ledger) · Worker handlers (accounting CSV stub + variance alert via `NotificationLog`) | ✅ done |
| **Phase 7 (Patient app — LIFF/PWA)** | `apps/patient-app` on :3004 with PWA manifest + SW · HS256 JWT patient sessions (separate from staff Bearer) · `PatientRequestContext` with audit `actor.type=PATIENT` · Patient API at `/api/v1/patient/{auth,me,branches,slots,appointments,visits,wallets,aftercare}` · 9 endpoints · LIFF SDK wrapper with mock fallback · 5-tab mobile shell · Self-service booking (LIFF channel · `appointment.created` event) · Visit history + receipt deep-link · Wallet/course balance · Aftercare CTA heuristic | ✅ done |
| **Phase 8 (CRM cron + Notification Layer)** | Notification adapter (provider abstraction: console/LINE/Twilio/SendGrid swappable via env) · Template registry TH/EN for 6 codes (`appointment.confirmed` · `review.request` · `rebooking.reminder` · `wallet.expiring` · `birthday.bonus` · plus reused `shift.variance_alert` / `inventory.shrinkage_alert`) · Dispatcher tick (5s default) draining `NotificationLog` PENDING with retry + permanent FAILED · Recipient resolver (patient.id → channel-specific ref via lineUserId / decrypted phone / email; `manager` distribution-list resolves first ACTIVE MANAGER user) · CRM cron tick (hourly default) running 4 jobs idempotently via `(template, recipient, window)` de-dup · `/admin/notifications` viewer page (KPIs total/pending/sent/failed + filters status/channel/template) for MANAGER + ADMIN · `console` provider writes to `storage/notifications/{channel}.log` for demos | ✅ done |
| **Phase 9 (Observability + Prod)** | Prometheus metrics (zero-dep collector) on api-server + worker-engine · `/api/metrics` (Bearer-token guarded) + `/api/healthz` + `/api/readyz` (DB probe) on api-server · standalone metrics+health HTTP server on worker-engine `:9464` · 8 worker metric families (handler runs/duration, queue depth, outbox pending, DLQ depth, notifications sent, cron runs, cron enqueued) + gauge tick every 15 s · multi-stage non-root Dockerfiles (`api-server`, `backoffice-web`, `patient-app`, `worker-engine`, `ai-service`) using Next.js `output: standalone` for the web apps · `infra/docker/docker-compose.prod.yml` with named volumes + healthchecks + `${VAR}` env interpolation · `.env.prod.example` template · `.dockerignore` · GitHub Actions CI (`.github/workflows/ci.yml`: lint+typecheck w/ MySQL service → build → Docker buildx matrix per service) · Dependabot weekly (npm + actions + docker) · PR template · `docs/PRODUCTION_HARDENING.md` 13-section checklist (secrets/DB/Redis/encryption/auth/network/observability/backups/CI-CD/containers/PWA/PDPA/smoke-tests) | ✅ done |
| **Phase G (Patient App Guest Flow)** | Forced LIFF login REMOVED from `apps/patient-app` · public catalog flow `/` → `/c/[slug]` → `/s/[id]/register` → `/s/[id]/book` → `/booking/[id]/success` with auto-login on success · `ServiceCategory` + `Service` patient-facing 2-level catalog linked to staff `procedureCode` · `Patient.kycImageUrl` + `verificationStatus` enum + `phoneHash` (deterministic keyed SHA-256) for guest dedupe without decrypting `phoneEnc` · public API namespace `/api/v1/public/{categories,categories/[code]/services,services/[id],branches,slots,book}` — `POST /book` upserts Patient by `phoneHash` + mints patient JWT atomically · Walk-in tab (auto-FIFO queue on check-in) · seed adds 3 categories + 10 services with demo Unsplash images | ✅ done |
| **Phase H (Identity v2 + Admin/Setup split)** | Backoffice auth switched from email/password to **Phone + OTP** (dev OTP `123456`) · `User.email` column dropped · new `phone` + `phoneHash` (HMAC-SHA256 keyed) + `primaryRoleCode` columns · composite unique `(tenantId, phone, primaryRoleCode)` — same phone allowed across different roles (dual-role demo `0888888888` as DOCTOR + MANAGER) · 2-step API: `POST /api/v1/auth/phone/lookup` returns role list + `POST /api/v1/auth/phone/login` validates OTP + mints session · OTP entered via floating dialog with role picker when phone has >1 role · admin user CRUD: phone field, single-role `<Select>`, optional avatar upload via new `POST /api/v1/uploads/avatar` (DO Spaces, 2 MB max, `user:write` guard); `ADMIN` role hidden from UI + rejected server-side · ADMIN-only users redirect to new `/admin` System Overview (users / roles / DLQ / settings KPIs) while MANAGER+ops stay on `/` · sidebar reorganized into **Finance & Insights** + **Clinic Setup** (MANAGER) + **System Admin** (ADMIN) groups · S3 client hardened: `S3UploadError` propagates `name/code/status` → API returns `502 STORAGE_ERROR` with detail · DO Spaces virtual-host endpoint (`sgp1.digitaloceanspaces.com`, `S3_FORCE_PATH_STYLE=false`) | ✅ done |
| **Tech-Debt Sprint (post-Phase H)** | `searchableHash` + `normalizePhone` unified into `@legacyx/db` (eliminates seed/runtime drift); `DEV_OTP` fail-closed in production; `getRequestContext` header-only mode gated by `INTERNAL_API_SECRET` in prod; `/api/dev/identities` + `/api/metrics` require the same secret / Bearer in prod; `invalidatePermissionCache` wired into `updateUser` + `assignBranches`; patient-app `tenant_slug` driven by env; ESLint flat config + `lint` scripts for all 3 Next apps (`pnpm -w lint` passes); dead `loginAction` + `apps/patient-app/src/lib/liff.ts` deleted; AdminUser TS types cleaned; `.env.example` + `turbo.json globalEnv` synced with what code reads; new top-level `AGENTS.md` + `docs/CONVENTIONS.md` + ADR-0007 | ✅ done |

---

## 🛠️ Open Tech Debt (visible to AI agents — please don't reintroduce)

| Item | Why it matters | Priority |
|---|---|---|
| **No automated tests** — 0 `*.test.ts` / `*.spec.ts` files | Refactors are dangerous; regressions ship | 🔴 |
| **OTP rate-limit not implemented** in api-server — relies on reverse proxy | Vulnerable to OTP bomb attacks until edge handles it | 🔴 |
| **Real SMS/voice OTP provider** not wired (only `console` provider + universal dev OTP) | Production not deployable to public until done | 🔴 |
| **Patient Merge Engine** has schema but no UI (`patient:merge:tenant` permission seeded but unused) | Duplicate patient detection deferred | 🟡 |
| **Consent Snapshot capture** flow has schema (`Patient.consentVersion`) but no UI to capture | PDPA compliance gap | 🟡 |
| **Payment Gateway adapter** — QR PromptPay webhook handler not built (env placeholders only) | Patients can book + clinic can take cash, but no online payment | 🟡 |
| **Manager dashboard `branchStats`** aggregates tenant-wide MTD revenue ignoring `ctx.branchId` | Cross-branch leak in multi-branch view | 🟡 |
| **`UserRole` table** still exists as a 1-row mirror of `primaryRoleCode` — back-compat for any code path doing `prisma.userRole.findMany` | Decide in v3 whether to keep mirror or migrate readers | 🟢 |
| **`User.passwordHash`** column kept (nullable) for future password-fallback use cases (kiosks, etc.) | Not used by auth path | 🟢 |
| **`verifyPassword()` export** in `shared/password.ts` not referenced — keep for future or delete in v3 | Minor | 🟢 |
| **TODOs in code** — `apps/worker-engine/src/relay/outbox-relay.ts:17`, `apps/worker-engine/src/notification/providers/sms.ts:27` | Trail of "do this later" | 🟢 |
