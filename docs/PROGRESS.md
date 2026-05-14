# 📊 LegacyX — Implementation Progress

> Living document tracking what has been **built** vs. what is **planned** per
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). Updated at the end of each delivery
> phase.

Last updated: **Phase G — Patient App Guest Flow complete — Forced LIFF login REMOVED from `apps/patient-app`; new guest-friendly flow lets visitors browse without auth: `/` welcome with category cards (image 1) → `/c/[slug]` services list (image 2) → `/s/[id]/register` name+phone+KYC form (image 3) → `/s/[id]/book` slot picker with นัดล่วงหน้า/walk-in tabs + disabled-when-full slots (image 4) → `/booking/[id]/success` confirmation with auto-login (image 5). Schema additions: `ServiceCategory` + `Service` models (patient-facing 2-level catalog linked back to staff `procedureCode`); `Patient.kycImageUrl` + `verificationStatus` enum + `phoneHash` (deterministic SHA-256 keyed lookup for guest dedupe without decrypting `phoneEnc`). New public API namespace `/api/v1/public/{categories,categories/[code]/services,services/[id],branches,slots,book}` — no auth, the `POST /book` endpoint upserts Patient by `phoneHash` and mints a patient JWT atomically (auto-login on success page). Bottom nav now renders 4 tabs for logged-in users and 2 (Home + Sign in) for guests. Seed adds 3 categories (Dental / Beauty & Spa / Wellness) + 10 services with demo Unsplash images. All 8 packages typecheck clean.**

Previous: **Phase 9 Observability + Prod complete — Lightweight zero-dep Prometheus metrics collector (Counter/Gauge/Histogram + text-format renderer) on both `apps/api-server` (`/api/metrics` route + `/api/healthz` liveness + `/api/readyz` DB readiness probe with `METRICS_BEARER_TOKEN`) and `apps/worker-engine` (standalone HTTP server on `:9464` for `/metrics` + `/healthz` + `/readyz`), worker metrics (`legacyx_worker_handler_runs_total`, `legacyx_worker_handler_duration_seconds`, `legacyx_worker_queue_depth`, `legacyx_worker_outbox_pending`, `legacyx_worker_dlq_depth`, `legacyx_worker_notifications_sent_total`, `legacyx_worker_cron_runs_total`, `legacyx_worker_cron_enqueued_total`), gauges refreshed every 15 s; multi-stage non-root Dockerfiles for all 5 apps + `docker-compose.prod.yml` w/ named volumes + healthchecks + `.env.prod.example`; GitHub Actions CI (lint + typecheck + build matrix + Docker buildx) + Dependabot weekly + PR template; `docs/PRODUCTION_HARDENING.md` 13-section pre-deploy checklist.**

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
| Dev login (no real auth yet) | ⚠️ | header-based identity picker; real auth = Phase 6 |

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
