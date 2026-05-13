# 📊 LegacyX — Implementation Progress

> Living document tracking what has been **built** vs. what is **planned** per
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). Updated at the end of each delivery
> phase.

Last updated: **Stabilization sprint complete — token-validated auth, CORS allowlist, type cleanups**

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
| `emr.signed` (immutable + encrypted + version) | ✅ |
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
| `payment.settled` (gateway batch) | ❌ Phase 6 EoD |
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
| `shift.closed` | ❌ |
| `payment.settled` (gateway batch) | ❌ |
| `inventory.reconciled` | ❌ |

### 🟠 Phase 7 — CRM & Retention (cron)
| Event | Status |
|---|---|
| `patient.review_requested` (D+3) | ❌ |
| `campaign.rebooking_reminder` | ❌ |
| `wallet.expiring_reminder` | ❌ |
| `campaign.birthday_bonus` | ❌ |

---

## 🧩 Cross-cutting Modules

| Module (ARCH §5) | Status |
|---|---|
| Security, Compliance & Identity | ✅ ABAC + encryption + **token-validated auth** (Bearer Authorization → DB Session lookup per request, header spoofing rejected) + Audit Log viewer + Break-Glass UI + User CRUD + Role/Permission matrix viewer + **env-driven CORS allowlist**; ❌ Patient Merge Engine; ❌ MFA |
| Document & Integration | ⚠️ PDF (zero-dep stub) + local storage ✅; LINE/SMS/Email queue ❌; Payment gateway adapter (QR PromptPay webhook) ❌ |
| Clinical & AI | ✅ EMR signed/versioned + AI drafts; ❌ Lab/Order |
| Financial & Promotion | ✅ Wallet, Invoice, Payment (auth→complete→refund); ❌ Promotion engine, ❌ Doctor Fee/Commission |
| Generic Resource & Inventory | ✅ Resource CRUD + UI (card grid by floor) + release/maintenance + auto-release on visit complete; BOM auto-consume (worker); stock ledger UI, manual receive/adjust; **Pharmacy dispense queue (cuts stock + emits `pharmacy.dispensed`)** |

---

## 🖥️ Frontend Apps

| App | Status |
|---|---|
| `apps/backoffice-web` (Desktop staff) | ✅ Real Login (6 demo users) · Role-filtered sidebar · Branch picker · Dashboard · Appointments · Visits (+Orders/Procedures/Billing/Complete) · Patients · Rooms & Resources · **Pharmacy** · AI Drafts · EMR Sign · Inventory · Audit Log · Break-Glass · **Admin Users + Roles** · DLQ |
| `apps/clinical-pad` (Tablet, touch) | ❌ |
| `apps/patient-app` (LIFF/PWA — booking, history, course balance) | ❌ Phase 8 |

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
| **Phase 7 (Patient app — LIFF)** | self-service booking, history, course balance | pending |
| **Phase 8 (CRM cron + Notification Layer)** | LINE/SMS, review request, rebooking, birthday | pending |
| **Phase 9 (Observability + Prod)** | OpenTelemetry, Prometheus, CI/CD, Dockerfiles | pending |
