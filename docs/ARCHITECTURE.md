🏥 Master Blueprint: LegacyX Enterprise Clinic Management System
🌟 1. Executive Summary & Core Philosophy
LegacyX คือระบบบริหารจัดการคลินิกระดับ Enterprise (Enterprise Clinic Management System) ที่ออกแบบมาเพื่อรองรับธุรกิจคลินิกความงามและ Wellness ระดับพรีเมียม โดยยึดหลักการทางวิศวกรรมซอฟต์แวร์ขั้นสูงดังนี้:
High-Touch, Low-Routine: นำ AI และระบบ Automation มาจัดการงานเอกสารและงานหลังบ้าน เพื่อให้บุคลากรทางการแพทย์โฟกัสกับการดูแลคนไข้ได้อย่างเต็มที่
Scalability & Isolation: โครงสร้างออกแบบมาเพื่อรองรับ Multi-branch (หลายสาขา) และ Multi-tenant (ระบบ SaaS) ตั้งแต่รากฐาน
Immutable Truth: ข้อมูลทางการเงิน (Ledger), คลังสินค้า (Stock) และประวัติการรักษา (EMR) ต้องมีความโปร่งใส ตรวจสอบย้อนหลังได้ 100% (No silent overwrites)
Bulletproof Compliance: ปฏิบัติตามกฎหมาย PDPA, มาตรฐานสถานพยาบาล, และนโยบายความปลอดภัยของข้อมูลระดับสูงสุด

🏗️ 2. System Architecture & Tech Stack
ระบบใช้สถาปัตยกรรม Event-Driven Modular Monolith บนโครงสร้าง Monorepo เพื่อรักษาสถานะ Transaction ให้แม่นยำ พร้อมการแยก Process ของ UI/API และ Background Task ออกจากกันอย่างเด็ดขาดเพื่อประสิทธิภาพสูงสุด
Database: MySQL 8 ทำงานร่วมกับ Prisma ORM (เพื่อ ACID Compliance และ Type-safety) — field-level AES-256-GCM encryption สำหรับ PII (EMR, Patient PII, KYC)
Frontend & API Layer: Next.js 14 (App Router, React Server Components) สำหรับฝั่ง Client Applications และ Core API. backoffice-web ใช้ shadcn/ui + Tailwind + next-intl (TH/EN). patient-app เป็น PWA (manifest + service worker) + LIFF SDK พร้อม fallback
Background Workers & AI: Node.js (TypeScript) รันเป็น Process แยก (`worker-engine`, `ai-service`) ไม่ผูกกับ Next.js เพื่อรองรับ Long-running tasks + Cron jobs + Notification dispatcher tick
Message Broker: Redis 7 + BullMQ สำหรับ Outbox Relay, Queue, และ Cron scheduling (เปลี่ยนเป็น AWS SQS ได้ในอนาคต)
Object Storage: AWS S3 / DigitalOcean Spaces (S3-compatible API) สำหรับ service images, user avatars, KYC photos, และ generated PDFs — รองรับ presigned URL + virtual-host style
Observability: Zero-dep Prometheus text-format metrics exporter on `/api/metrics` (api-server) + `:9464/metrics` (worker-engine) + healthz/readyz probes. Logs structured JSON พร้อม `correlation_id` ตามทุก request/event
Containerization: Multi-stage non-root Dockerfiles ต่อ service (5 services) + `docker-compose.prod.yml` พร้อม healthchecks + named volumes + private network. GitHub Actions CI: lint → typecheck → build → buildx matrix per service

📦 3. Project Structure (Monorepo via Turborepo + pnpm)
โครงสร้างโปรเจกต์ถูกแบ่งย่อยเพื่อลดการผูกมัด (Decoupling) แต่สามารถแชร์ Types และ Database Schema ร่วมกันได้

🖥️ Frontend Applications (Next.js)
- **apps/patient-app** (:3004): Web App (PWA + LIFF) สำหรับคนไข้ — **guest-friendly flow**: หน้าแรกแสดง ServiceCategory cards (no auth) → เลือก service → กรอกชื่อ+เบอร์+KYC → เลือก slot (advance/walk-in) → จองสำเร็จ + auto-login. ส่วน authed มี Visit history, Course/Wallet balance, Aftercare CTA. ใช้ HS256 JWT session 14 วัน
- **apps/backoffice-web** (:3003): Desktop Web App สำหรับพนักงานคลินิก (Reception, Doctor, Nurse, Pharmacist, Manager, Admin) — 4 sidebar groups: Operations / Finance & Insights / Clinic Setup / System Admin. **Login = Phone + OTP** (no email/password) พร้อม role picker สำหรับเบอร์ที่ผูกหลาย role

⚙️ Backend & Service Layer (Next.js + Node.js)
- **apps/api-server** (:3001, Next.js API Routes / Server Actions): รับ Request จากหน้าบ้านทั้งหมด, ตรวจ ABAC, จัดการ Business Logic หลัก, mint JWT/session, expose `/api/metrics` + `/api/healthz` + `/api/readyz`
- **apps/worker-engine** (Node.js TS process): ดึงงานจาก BullMQ + ทำ Outbox Relay → run handlers (BOM consume, PDF generate, alert) ตรวจ Idempotency, จัดการ Retry + DLQ, รัน **Notification Dispatcher** (LINE/SMS/Email queue tick ทุก 5s) + **CRM Cron** (review request, rebooking, wallet expiring, birthday bonus tick รายชั่วโมง). มี standalone metrics HTTP server บน `:9464`
- **apps/ai-service** (:3002, Node.js AI Orchestrator): เป็นตัวกลางเรียก Gemini SDK (LLM + Vision) สำหรับ Intake summary, Voice-to-SOAP, Vision analyze (Phase Q). ทุก call มี graceful heuristic fallback. จัดการ AI Draft / Approval Log

🧩 Shared Packages
- **packages/db** (Prisma Schema + seed.ts + ROLE_MATRIX) — single source of truth สำหรับ tables, enums, และ permission matrix
- **packages/types** (Zod Validation Schemas) — shared DTOs ระหว่าง api-server, worker-engine, frontends
- **packages/events** (Event Dictionary + Constants + zod schemas) — versioned event payloads (`v1`, `v2`)

> ⚠️ **Removed/never built**: `apps/clinical-pad` (tablet app) ยังไม่ถูก scaffold — Doctor/Nurse ใช้ `apps/backoffice-web` แทน (responsive desktop). `packages/ui` ก็ไม่มี — design system ถูก inline ใน `backoffice-web` ผ่าน shadcn/ui

🌐 **API Namespace Map (api-server)**
- `/api/v1/auth/phone/{lookup,login}` + `/api/v1/auth/{me,logout}` — Staff Phone+OTP auth (Phase H)
- `/api/v1/public/{categories,categories/[code]/services,services/[id],branches,slots,book}` — **No-auth** patient catalog + booking (Phase G)
- `/api/v1/patient/{auth,auth/phone,me,branches,slots,appointments,visits,wallets,aftercare}` — Patient-JWT-guarded (Phase 7)
- `/api/v1/admin/{patients,pdpa,...}` — ADMIN-only (Phase H + K)
- `/api/v1/{visits,invoices,patients,promotions,lab,photos,uploads/avatar,uploads/service-image,...}` — Staff Bearer (ABAC per route)
- `/api/v1/uploads/{avatar,service-image}` — Multipart S3 (DO Spaces) upload, max 2 MB / 8 MB respectively
- `/api/dev/identities` — **dev-only** (gated by `INTERNAL_API_SECRET` in prod)
- `/api/{healthz,readyz,metrics}` — Observability (Phase 9, `/metrics` Bearer-guarded)

🎨 **Theme & Dialog Conventions** (Theme Refresh v2 — see ADR-0006)
- Brand: teal `#1bb59b`, animated gradient buttons, light sidebar with teal active pill
- Dialog rule (สวีปใช้ทั้ง 18 dialogs): **backdrop-blur-md** + **centered logo header** + **confirm-only footer** (no Cancel button — close ด้วย X / Esc / backdrop click)
- All inputs/selects/cards/tabs ผ่าน shadcn/ui ที่ patched ให้ใช้ teal accent
- i18n TH/EN parity บังคับใน `apps/backoffice-web` (97 keys patient-app, ≈700 keys backoffice-web)

📱 **Patient App URL Map** (`apps/patient-app`, :3004)
- `/` — Welcome + ServiceCategory grid (no auth)
- `/c/[code]` — Services in category (no auth)
- `/s/[id]/register` — Name + phone + KYC capture (guest auto-creates Patient by `phoneHash`)
- `/s/[id]/book` — Slot picker (Advance / Walk-in tabs; full slots disabled; **Walk-in tab uses FIFO auto-queue** at check-in time, no slot pick)
- `/booking/[id]/success` — Confirmation + auto-mints patient JWT → 5-tab shell unlocks
- `/login` — Phone + OTP UI (dialog overlay; backend wiring pending — uses `DEV_OTP=123456` for now)
- `/(authed)/` — Home (5-tab bottom nav)
- `/(authed)/book` — Self-service rebook
- `/(authed)/visits` + `/(authed)/visits/[id]/receipt` — History + receipt deep-link
- `/(authed)/wallet` — Course balance + ledger
- `/(authed)/profile` — Profile + LIFF link

⚙️ 4. Advanced Engineering & Resilience Patterns
โครงสร้างรากฐานเพื่อการันตีความถูกต้องของข้อมูล (Data Integrity) และช่วยให้แก้ไขปัญหาบน Production ได้ง่าย
Transactional Outbox Pattern: ทุกครั้งที่ระบบหลักทำงานสำเร็จ (เช่น ตัดเงิน) ระบบจะบันทึกข้อมูลหลัก + Event ลง outbox_table ใน Database Transaction เดียวกัน จากนั้น Relay Worker จะกวาด Outbox ส่งเข้า Queue เพื่อการันตีว่า "ถ้า Save DB ผ่าน Event ต้องไม่หาย"
Observability Metadata: ทุก Event Payload ต้องมีโครงสร้างมาตรฐานสำหรับการสืบย้อน (Tracing):
JSON
{
  "metadata": {
    "event_name": "payment.completed",
    "event_version": "v1",                  // Schema Evolution เผื่อเปลี่ยน Payload ในอนาคต
    "event_id": "evt_8899aabb",             // Idempotency Key ป้องกัน Worker ทำงานซ้ำ
    "correlation_id": "req_123456789",      // Trace Flow ทั้งระบบ (จองคิว -> จ่ายเงิน -> หัตถการ)
    "causation_id": "evt_33445566",         // ต้นเหตุของ Event นี้
    "timestamp": "2026-05-13T15:15:48Z",
    "tenant_id": "tnt_legacyx",             // รองรับ SaaS Multi-tenant
    "branch_id": "br_01"                    // รองรับระบบ Multi-branch
  },
  "payload": { ... }
}




Worker Resilience: Worker ต้องเช็ค Idempotency Key เสมอ มีระบบ Retry Policy และ Dead Letter Queue (DLQ) สำหรับงานที่ Error พร้อม Admin Dashboard สำหรับ Manual Reprocess
Strict Data Deletion Policy:
Soft Delete: ใช้กับ Master Data / Operational Records เท่านั้น (เช่น ซ่อนชื่อพนักงานที่ลาออก)
Immutable Data: ข้อมูล Ledger (Wallet, Stock), Audit Log, EMR Version และ Payment ต้องใช้การ Void / Reversal / Archive ห้ามลบทิ้งหรือเขียนทับเด็ดขาด
Break-Glass Override: ฟีเจอร์ Manual Override สำหรับแก้ไขข้อมูลฉุกเฉินระดับสูง โดยบังคับกรอก required_reason, บันทึก approved_by และลง override.audit_log เสมอ

**🔐 Production-mode Security Gates** (`NODE_ENV=production` triggers fail-closed defaults)
- `DEV_OTP` defaults to empty string (`""`) ในโปรดักชั่น — login จะ reject 100% ของ OTP ที่ไม่ผ่าน real provider จึง **ต้องตั้ง real SMS/voice OTP provider ก่อน deploy**
- `getRequestContext` header-only mode (มี `x-actor-id` / `x-tenant-id` headers) ถูก lock หลัง `INTERNAL_API_SECRET` ทำให้ frontend ภายนอกไม่สามารถ spoof actor ได้
- `/api/dev/identities` (ตัวลิสต์ demo user) gate ด้วย `INTERNAL_API_SECRET` เดียวกันใน prod
- `/api/metrics` คืน 503 ถ้าไม่มี `METRICS_BEARER_TOKEN` ใน env หรือใน Authorization header

**🧠 Permission Cache Invalidation**
- api-server มี in-memory permission cache ต่อ user เพื่อหลีกเลี่ยง round-trip ทุก request
- `invalidatePermissionCache(userId)` ถูกเรียกอัตโนมัติใน `updateUser` (เปลี่ยน role/active) และ `assignBranches` (เปลี่ยน scope) — **ไม่มี stale RBAC หลัง mutation โดยไม่ต้อง restart**

**🔑 Phone Identity Hash**
- `searchableHash(phone, tenantId)` (HMAC-SHA256 keyed ด้วย `MASTER_KEY`) อยู่ใน `@legacyx/db` — **single source of truth** ทำให้ seed/api/worker ไม่มี hash drift
- `normalizePhone(input)` (strip non-digit + canonical +66 form) อยู่ที่เดียวกัน เพื่อ deterministic lookup

🗄️ 5. Core Domain Modules
🛡️ 1. Security, Compliance & Identity Module
ABAC (Attribute-Based Access Control): ผูก Role เข้ากับ Permission Scope (เช่น หมอ Role: Doctor สามารถดู EMR ได้เฉพาะคนไข้ในสาขาของตน Scope: branch_id)
Identity Model (v2 — single-role per user): แต่ละ `User` มี `primaryRoleCode` หนึ่ง role เท่านั้น. หากบุคคลคนเดียวต้องสวมหลาย role (เช่น หมอที่เป็น manager ด้วย) ให้สร้าง user หลาย rows ใช้ **เบอร์โทรเดียวกัน** ต่าง role — unique constraint คือ `(tenant_id, phone, primary_role_code)`. Backoffice ห้าม assign `ADMIN` ผ่าน UI (system-only role).
Authentication: **Phone + OTP** (ไม่มี email/password). Step 1 = `POST /api/v1/auth/phone/lookup` → คืน list of roles; ถ้ามีหลาย row ให้ผู้ใช้เลือก role. Step 2 = `POST /api/v1/auth/phone/login` พร้อม OTP (dev OTP = `123456`, env `DEV_OTP`). หลัง login: session token + HttpOnly cookie; ADMIN-only users redirect ไป `/admin`, role อื่นไป `/`.
Profile pictures: optional `User.avatarUrl` upload ผ่าน `POST /api/v1/uploads/avatar` (S3-compatible / DO Spaces, max 2 MB, guarded by `user:write`).
Legacy back-compat: (1) `UserRole` table ยังคงอยู่ในรูปแบบ 1-row mirror ของ `primaryRoleCode` เพื่อรองรับ code path เก่าที่ทำ `prisma.userRole.findMany()` — schema simplification ถูก defer ถึง v3. (2) `User.passwordHash` ยังคง nullable ในตาราง (ไม่ใช้ใน auth path ปัจจุบัน) — ถูกเก็บไว้รองรับ future password fallback (kiosk mode). (3) `User.email` column **ถูก drop** ออกจาก schema แล้วใน Phase H (Identity v2).
Encryption at Rest: เข้ารหัสข้อมูล EMR อ่อนไหวตั้งแต่ตอนบันทึกลง Database. Phone column ใช้ `phoneHash` (HMAC-SHA256 of normalized phone with tenant + master key) สำหรับ index lookup เพื่อให้ raw phone ไม่ปรากฏใน index/logs.
Consent Snapshot: บันทึก Document Version ของใบยินยอมที่คนไข้เซ็นพร้อม Timestamp ว่าเซ็นเวอร์ชันไหน
Patient Merge Engine: ระบบตรวจจับคนไข้ซ้ำซ้อน (Duplicate Detection) และรวมประวัติ (Patient Merge) พร้อมเก็บ Merge Audit Log
📄 2. Document & Integration Module
Document Generation: Worker สร้าง PDF อัตโนมัติ (Consent, Medical Cert, e-Receipt, Tax Invoice) ถูกเรียกผ่าน Event document.requested เก็บลง Object Storage
Integration Center: ศูนย์รวม API ภายนอก (Payment Gateway, SMS, LINE OA, e-Tax, Accounting Export)
Notification Layer (Phase 8): Provider abstraction ที่ swap ได้ผ่าน env — `console` (dev → log ไฟล์ `storage/notifications/{channel}.log`), `LINE Messaging API`, `Twilio` (SMS), `SendGrid` (Email). Template registry TH/EN สำหรับ 6 codes (`appointment.confirmed`, `review.request`, `rebooking.reminder`, `wallet.expiring`, `birthday.bonus`, `shift.variance_alert`/`inventory.shrinkage_alert`). Dispatcher tick (5s default) drain `NotificationLog` PENDING พร้อม Retry + permanent FAILED. Recipient resolver: `patient.id` → ใช้ lineUserId / decrypted phone ตาม channel; `manager` → resolve เป็น ACTIVE MANAGER user คนแรกของ tenant. มี `/admin/notifications` viewer แสดง KPI + filter
🩺 3. Clinical & AI Assistive Module
Locked EMR: เมื่อเกิด Event emr.signed ระบบจะล็อก Version ของ EMR (Immutable) หากต้องการแก้ต้องสร้าง Version ใหม่พร้อม Audit Log
AI Policy: "AI-generated content is assistive only. Final clinical decisions require human approval."
AI Orchestrator: จัดการ AI Intake Summary (สรุปอาการก่อนพบแพทย์) และ AI Voice-to-Note Draft (ดราฟต์ประวัติจากเสียงสนทนา)
💰 4. Financial & Promotion Module
Granular Payment States: แยกสถานะชัดเจน: payment.authorized (จองวงเงิน) -> payment.completed (ทำรายการสำเร็จ ทริกเกอร์หัตถการได้) -> payment.settled (เงินเข้าบัญชีจริง ใช้สำหรับระบบบัญชี) -> payment.failed/refunded
Wallet Ledger: ระบบคอร์สความงามเป็น Immutable Ledger (PURCHASE +10, USE -1)
Promotion Engine: รองรับ Tier Pricing, Bundle Promotion, Package Discount
End-of-Day Operations (Phase 6.8): หน้าเดียว `/manager/eod` รวม 3 tabs — **Shift Close** (เปิด/ปิดกะ + นับเงินสด + auto-calc variance), **Settlement** (เลือก payments `COMPLETED` → batch settle → trigger Accounting Export), **Inventory Reconcile** (นับสต็อกจริง + variance + บังคับ Break-Glass override ถ้ามี shrinkage). Events: `shift.{open,close}`, `payment.settle`, `inventory.reconcile`
📦 5. Generic Resource & Inventory Module
Resource Engine: จัดการ Resource กลางแบบ Abstraction (Room, Machine, Therapist, Laser) มีระบบ Reservation, Utilization และ Maintenance Status
Stock Ledger & BOM: บันทึกคลังแบบ Immutable (RECEIVE, DISPENSE, BOM_USAGE) โดยใช้ BOM ตัดสต็อกอัตโนมัติ
🛍️ 6. Service Catalog Module (Phase G)
Two-Level Catalog: `ServiceCategory` (Dental / Beauty & Spa / Wellness) → `Service` (procedures ที่ patient จองได้) ผูกกับ staff-side `procedureCode` ผ่าน FK. ทั้ง category code และ service code **auto-generated จาก name** (slugified) — UI ซ่อน manual input. รูปภาพ Service upload ตรงไป S3 ผ่าน `/api/v1/uploads/service-image`. Admin จัดการที่ `/admin/services` (MANAGER)
🎫 7. CRM Cron Module (Phase 8)
Worker `worker-engine` รัน CRM cron tick (default ทุก 1 ชั่วโมง, env `CRM_CRON_TICK_MS`). 4 jobs:
- **Review Request** (D+3 หลัง procedure.completed) → enqueue `review.request`
- **Rebooking Reminder** (เช่น Botox 4 เดือนหลัง procedure.completed) → enqueue `rebooking.reminder`
- **Wallet Expiring** (course ใกล้หมดอายุ ≤ 30 วัน) → enqueue `wallet.expiring`
- **Birthday Bonus** (วันเกิดลูกค้า) → enqueue `campaign.birthday_bonus`
ทุก job ใช้ idempotency key `(templateCode, recipient, window)` เพื่อกันส่งซ้ำ

🔄 6. The User Journey & Event Dictionary Flow
ผังการทำงานจริงครอบคลุมตั้งแต่ก่อนลูกค้าเข้าคลินิกจนถึงการรักษาฐานลูกค้าระยะยาว (Life-time Value)
🟢 Phase 1: Pre-Visit & Triage (ก่อนเข้ารับบริการ)
จองคิว → appointment.created (v1)
AI เตรียม Intake Summary → ระบบเก็บ Consent Snapshot
มาถึงคลินิก เช็คอินเข้าสู่ระบบ → visit.checked_in (v1) ทริกเกอร์ Resource Engine ให้เตรียมเตียง/ห้อง
🟢 Phase 2: Consultation & Optional Lab (พบแพทย์และส่งตรวจ)
แพทย์พบคนไข้ (ใช้ AI Orchestrator ดราฟต์ Note ผ่าน Gemini Phase Q + AI Assistant SOAP)
แพทย์กดยืนยัน EMR → emr.signed (v1) (ทริกเกอร์: Lock EMR Version + เขียน Audit Log)
**(Phase M)** แพทย์สั่งตรวจ Lab → lab.ordered → state machine ORDERED→COLLECTED→PROCESSING→RESULTED → ผล Lab ออก → lab.resulted (ทริกเกอร์ render LAB_REPORT PDF)
**(Phase L)** ลูกค้าร้องขอเอกสาร → document.requested (v1) (ทริกเกอร์: เจน Medical Cert / Tax Invoice / Consent / Lab Report PDF)
แพทย์สั่งยา/หัตถการ → order.created (v1)
**(Phase S)** แพทย์/ผู้ช่วยอัปโหลด Before/After photo → patient_photos table → optionally trigger Gemini Vision analysis
🟢 Phase 3: Payment, Pharmacy & Dispatch (การเงิน ห้องยา กระจายงาน)
**(Phase O)** Reception ใส่โค้ดส่วนลด → POST /api/v1/invoices/[id]/apply-promo → write Invoice.discount + emit promotion.redeemed
ลูกค้าชำระเงิน → payment.completed (v1)
Worker: ตัด Wallet (wallet.used), เจน e-Receipt (document.requested), ยิงแจ้งเตือน iPad ผู้ช่วย
(Optional) ห้องยารับ Order → pharmacy.preparing → จัดยาเสร็จจ่ายให้คนไข้ → pharmacy.dispensed (ตัดสต็อกยา Real-time)
🟢 Phase 4: Procedure & Immediate Aftercare (ทำหัตถการ)
ผู้ช่วยกดเสร็จสิ้นหัตถการ → procedure.completed (v1)
Worker: ทริกเกอร์ระบบตัดสต็อกอุปกรณ์/ของสิ้นเปลืองผ่าน BOM (inventory.adjusted)
Worker: คำนวณ Doctor Fee / Commission
Worker: ตั้งคิว 24 ชม. ส่ง Short-term Aftercare ผ่าน LINE
🔴 Phase 5: Reversal & Cancellation (เคสยกเลิกฉุกเฉิน)
การตีกลับ Event ตามหลัก Compensating Transaction:
order.cancelled (ปลดล็อก Resource)
invoice.voided / payment.refunded (ทริกเกอร์บัญชีคืนยอด)
wallet.reversed (คืนโควต้าคอร์ส +1)
stock.reversed (คืนวัสดุเข้าคลัง +1)
procedure.cancelled (ยกเลิกหัตถการกลางคัน)
🟣 Phase 6: End-of-Day Operations (การปิดยอดและตรวจสอบ)
พนักงานตรวจสอบเงินสดและยอดโอน → shift.closed (บันทึกยอดแต่ละกะ)
Gateway ตัดยอดเข้าบัญชีจริง → payment.settled (ทริกเกอร์ Worker นำยอดส่ง Accounting Export)
ผู้จัดการเช็คสต็อกเทียบระบบ → inventory.reconciled (หากมี Variance บังคับใช้ Manual Override)
🟠 Phase 7: Post-Visit CRM & Retention (รักษาฐานลูกค้า) ระบบ Worker วิ่งตรวจสอบทุกวัน (Cron Jobs) เพื่อยิง Event สานสัมพันธ์:
หลังรับบริการ 3 วัน → patient.review_requested (ส่งคำขอรีวิว/NPS)
ระบบคำนวณรอบครบกำหนดหัตถการ (เช่น Botox) → campaign.rebooking_reminder
คอร์สใกล้หมดอายุใน 30 วัน → wallet.expiring_reminder (ทริกเกอร์โปรโมชันต่ออายุ)
ถึงเดือนเกิดลูกค้า → campaign.birthday_bonus (ส่ง Voucher หรือให้แต้ม)

📈 7. Observability & Production Operations (Phase 9)
ระบบเตรียมพร้อม production deploy ตั้งแต่ระดับ runtime metrics จนถึง CI/CD pipeline

**Metrics (Prometheus text format, zero external SDK)**
- `apps/api-server` expose `/api/metrics` (Bearer-token guarded ผ่าน `METRICS_BEARER_TOKEN`), `/api/healthz` (liveness), `/api/readyz` (DB readiness probe)
- `apps/worker-engine` มี standalone HTTP server บน `:9464` exposing `/metrics`, `/healthz`, `/readyz` (DB probe ผ่าน `SELECT 1`)
- 8 worker metric families: `legacyx_worker_handler_runs_total`, `legacyx_worker_handler_duration_seconds`, `legacyx_worker_queue_depth`, `legacyx_worker_outbox_pending`, `legacyx_worker_dlq_depth`, `legacyx_worker_notifications_sent_total`, `legacyx_worker_cron_runs_total`, `legacyx_worker_cron_enqueued_total`
- Gauges refresh ทุก 15 วินาที (queue depth, outbox pending, DLQ depth)

**Containerization**
- Multi-stage non-root Dockerfiles ต่อ service (api-server, backoffice-web, patient-app, worker-engine, ai-service)
- Next.js apps ใช้ `output: "standalone"` เพื่อ image ขนาดเล็ก
- `infra/docker/docker-compose.prod.yml` พร้อม named volumes, healthchecks, `${VAR}` env interpolation, log rotation, private `legacyx-net`

**CI/CD (GitHub Actions)**
- Lint + typecheck (มี MySQL service + Prisma `db push`)
- Build matrix → Docker buildx ต่อ service
- Dependabot weekly (npm + actions + docker)

**Operational UI (Backoffice)**
- `/admin/audit` — Audit Log viewer (filter by actor / event / branch + correlation_id deep-link)
- `/admin/break-glass` — Break-Glass override approval queue
- `/admin/dlq` — Dead Letter Queue viewer + manual reprocess button
- `/admin/notifications` — Notification log + KPIs (Phase 8)
- `/admin/patients` — Patient Merge dashboard (Phase K, MANAGER)
- `/admin/pdpa` — DSR Export / Anonymise (Phase K · Export = MANAGER+ADMIN, Anonymise = ADMIN only)
- `/admin/users` + `/admin/roles` + `/admin/resources` + `/admin/settings` — system admin (Phase H, ADMIN)
- `/manager/promotions` — Promotion CRUD (Phase O, MANAGER)
- `/manager/eod` — End-of-Day Operations (Phase 6.8, MANAGER)

**Pre-deploy hardening** — ดู `docs/PRODUCTION_HARDENING.md` (13-section checklist: secrets / MySQL / Redis / encryption / auth / network / observability / backups / CI-CD / containers / PWA / PDPA / smoke-tests)

---

🧪 8. Compliance, Clinical Extensions & AI Engine
เพิ่มเติมจาก phase 1-7 ของ user journey ระบบยังครอบคลุมโมดูลพิเศษต่อไปนี้ (ที่ ship เรียบร้อยแล้วผ่าน Phase K, L, M, O, Q, S):

**🛡️ PDPA Compliance Layer (Phase K)**
- **Consent Snapshot** — `POST /api/v1/patients/[id]/consents` เก็บ `content_hash` (SHA-256) ทุกฉบับเพื่อพิสูจน์ tamper-evidence + ออก `consent.signed` outbox event ที่ chain ไป `document.requested` เพื่อ render PDF อัตโนมัติ. มี 5 templates ที่รองรับ: `CONSENT_GENERAL`, `CONSENT_LASER`, `CONSENT_INJECTION`, `CONSENT_PHOTO`, `CONSENT_DATA`
- **Patient Merge Engine** — `/admin/patients` หน้าแสดง duplicate candidates (group by `phoneHash` หรือ `firstName + lastName + dob`) พร้อม MergeDialog ที่ขอ reason ≥ 8 chars (PDPA Article 30) → transactional move ของ appointments / visits / invoices / wallets / EMR / consents / labs / orders / procedures / pharmacy / **patient photos** ไปยัง surviving record + tombstone แหล่งเดิมเป็น `MERGED` + บันทึก `PatientMergeLog` เพื่อย้อนรอย
- **DSR (Data Subject Rights)** — `/admin/pdpa` มี 2 actions: (1) **Export PII** (`pdpa:export:tenant` — MANAGER + ADMIN) → คืน decrypted JSON manifest เป็น download (ครอบคลุม name / phone / email / national-id / appointments / visits / invoices / payments / wallets / consents / EMR / procedures / pharmacy / documents / notifications), (2) **Anonymise** (`pdpa:anonymize:tenant` — ADMIN only, irreversible) → แทน identifying fields ด้วย `anon-<sha8>` pseudonym + soft-delete patient photos แต่เก็บ ledger rows ไว้สำหรับ retention 7 ปี ของกฎหมายภาษี. UI ใช้ `PatientCombobox` + summary card ก่อนกดเพื่อกัน operator เลือกคนผิด
- ทุก action ออก `pdpa.exported` / `pdpa.anonymized` events + เขียน audit log แท็ก `pdpa_action: true` เพื่อให้ regulator filter ได้

**📄 Document Engine v2 (Phase L)**
- `document-issue.service.ts` กำหนด ABAC ที่ tighter กว่า generic `requestDocument`: `issueMedicalCert` ต้อง `emr:write` (DOCTOR เท่านั้น) · `issueTaxInvoice` ต้อง `payment:write` (RECEPTION/MANAGER) + รับเฉพาะ invoice สถานะ `PAID`
- Routes: `POST /api/v1/visits/[id]/medical-cert`, `POST /api/v1/invoices/[id]/tax-invoice`
- Worker template renderer ครอบคลุม: `E_RECEIPT` (subtotal/discount/total + method), `CONSENT` (risk text แตกต่างตาม `template_code`), `MEDICAL_CERT` (diagnosis + period + recommendation + doctor + license), `TAX_INVOICE` (Thai e-Tax format: VAT 7% + buyer/issuer tax-id + branch code), `LAB_REPORT` (key:value table จาก `payload`)
- `document-generated.handler.ts` แยก `TAX_INVOICE` ออกมา append CSV row ไปที่ `storage/etax/<tenant>/<yyyy-mm>/etax-invoices.csv` (RD column convention) → พร้อม bind กับ e-Tax provider (SFTP/API)

**🔬 Lab Orders & Results (Phase M)**
- Permissions: `lab:write:branch` (DOCTOR), `lab:collect:branch` + `lab:result:branch` (NURSE), `lab:read:branch` (DOCTOR/NURSE/MANAGER)
- State machine: `ORDERED → COLLECTED → PROCESSING → RESULTED` (กับ `CANCELLED` แตกแขนงได้ทุกจุดก่อน RESULTED)
- Routes: `/api/v1/lab/orders` (GET/POST), `/api/v1/lab/orders/[id]` (GET/PATCH), `/api/v1/lab/orders/[id]/result` (POST)
- `lab.resulted` event chain ไป `document.requested` (template `LAB_REPORT`) อัตโนมัติ
- `LabsSection` tab บนหน้า Visit detail พร้อม per-row state-transition buttons + KEY:VALUE result entry dialog
- ⚠️ **Outsourced LIS adapter** ยังไม่ได้ build — ตอนนี้ nurse กรอกผลด้วยมือ (clinic ส่วนใหญ่ outsource ผ่าน NHL/AMS courier)

**🎁 Promotion Engine (Phase O)**
- 4 promo types: **VOUCHER** (code-based, kind=`percent` หรือ `amount`), **PACKAGE_DISCOUNT** (auto บน SKU match), **BUNDLE** (placeholder), **TIER** (placeholder)
- Config schema: `kind`, `percent`/`amount`, `min_spend`, `max_uses_per_patient`, `applies_to_skus`
- Routes: `/api/v1/promotions` (GET list / POST create), `/api/v1/promotions/[id]` (PATCH/DELETE), `/api/v1/invoices/[id]/apply-promo` (POST redeem)
- Redeem flow: เขียน `Invoice.discount` + `Invoice.total` + `AuditLog` ledger + emit `promotion.redeemed` event ใน transaction เดียว — idempotent re-apply ของ code เดิม + 409 ถ้า apply code ที่ 2 (one-promo-per-invoice MVP)
- `/manager/promotions` UI พร้อม KPIs (active/total/expired) + CreatePromotionDialog (full type/kind/config) + RowActions (toggle active / soft-delete)
- `ApplyPromoButton` ใน BillingSection ของ Visit detail บน invoice สถานะ DRAFT/ISSUED
- ⚠️ **Promotion redemption ledger** ยังคงใช้ `auditLog` แทน dedicated `PromotionRedemption` table (per-patient count ทำใน-memory) — refactor เมื่อ volume เพิ่ม

**🤖 Gemini AI Integration (Phase Q)**
- ทุก AI ใช้ Google Gemini ผ่าน `@google/generative-ai` SDK โดยมี wrapper `apps/ai-service/src/providers/gemini.ts` เป็น single chokepoint สำหรับ JSON-mode + image part support
- 3 capabilities: `generateIntakeSummary` (Thai-aware triage: ROUTINE/URGENT/EMERGENCY), `generateVoiceNote` (SOAP scribe), `analyzeVision` (clinical photo analysis)
- **Graceful fallback**: ถ้า `GEMINI_API_KEY` ไม่ตั้งค่า → fallback heuristic ทันที (deterministic, ทำให้ CI/dev ไม่ต้องตั้ง key)
- Model name + version stamp ลง `AIDraft` ทุก row → ตรวจย้อนหลังได้ว่า draft ไหนมาจาก Gemini vs heuristic
- Vision endpoint: `POST /ai/vision/analyze` (base64 + mime + kind=BEFORE/AFTER/OTHER) → persist `AIDraft(type=VISION_REPORT)`
- Env: `GEMINI_API_KEY`, `GEMINI_MODEL_TEXT` (default `gemini-1.5-flash`), `GEMINI_MODEL_VISION` (default `gemini-1.5-flash`)

**📷 Patient Photos (Phase S)**
- New `PatientPhoto` model — ครอบคลุม `KYC_ID`, `KYC_SELFIE`, `BEFORE`, `AFTER`, `PROCEDURE`, `OTHER` พร้อม `region` (left cheek / forehead / ฯลฯ), `analysis` JSON column (denormalised Gemini Vision draft), `deletedAt` (PDPA scrub)
- Storage policy: ทุกภาพเก็บใน S3 / DigitalOcean Spaces ด้วย `ACL: private` (ไม่ใช่ public-read แม้แต่ KYC) — UI ใช้ public URL เฉพาะตอน MinIO dev; prod ใช้ signed URL
- Routes: `POST /api/v1/patients/[id]/photos` (multipart upload, 8 MB cap, JPEG/PNG/WebP), `GET /api/v1/patients/[id]/photos?kind=&visit_id=`, `DELETE /api/v1/photos/[id]`, `POST /api/v1/photos/[id]/analyze` (pulls bytes → forwards to ai-service → persists analysis)
- KYC upload auto-progresses `Patient.verificationStatus`: UNVERIFIED → PENDING (รอ staff review)
- `PhotosSection` Visit-detail tab — grid ของ cards พร้อม AI summary / observations / concerns / confidence + analyze + delete button
- PDPA anonymise + Patient Merge ทั้งคู่ wipe / move PatientPhoto rows ตาม survivor

**🧪 Test Foundation (Phase J)**
- Vitest ที่ workspace root พร้อม `@vitest/coverage-v8`
- 4 canonical test files / 19 tests: events envelope build, payload schemas (consent / promotion / lab), AI heuristic SOAP cue split (Thai/EN), promotion DTO validation
- CI extended: lint → typecheck → **test** → build → docker buildx
- ⚠️ **Coverage ยังบาง** — เหลือ integration + e2e specs สำหรับ phase ถัดไป

---

🚧 9. Deferred Phases & Open Tech Debt
ส่วนนี้ทำให้ AI agent / dev ใหม่ไม่หยิบของที่ user **ตั้งใจเลื่อน** มาทำซ้ำ และเห็นภาพ gap ปัจจุบัน — sync เนื้อหาจาก `PROGRESS.md`

**🟦 Phases ที่เลื่อนตามคำสั่งผู้ใช้ (อย่าหยิบมาทำโดยพลการ)**
- **Phase I — Production-Ready Security** (MFA / pen-test / WAF) — เลื่อนหลังจากระบบสมบูรณ์ก่อน
- **Phase N — Native Mobile App** — Patient PWA ครอบคลุม Use case หลักแล้ว
- **Phase P — Tablet/iPad UX (clinical-pad)** — backoffice-web responsive desktop พอใช้กับ workflow ปัจจุบัน
- **Phase R — Reporting & BI** (data warehouse + cube) — ใช้ Manager Dashboard MTD ได้ก่อน
- **Phase T — Telemedicine / Video Consult** — out of MVP scope
- **AI provider lock-in**: ใช้ **Gemini ทั้งระบบ** (Phase Q chokepoint). อย่าเพิ่ม OpenAI/Anthropic adapter โดยไม่ขออนุมัติ

**🔴 Critical Tech Debt (block production deploy)**
- **OTP rate-limit** ยังไม่ implement ใน api-server (พึ่งแค่ reverse proxy) — vulnerable ต่อ OTP-bomb
- **Real SMS/voice OTP provider** ยังไม่ wire (ใช้ console + universal `DEV_OTP=123456`)

**🟡 Important Tech Debt**
- **Pharmacy event chain** (`pharmacy.preparing` / `pharmacy.dispensed`) ยังไม่ emit (UI dispense queue ตัดสต็อก inline แทน)
- **Doctor Fee / Commission** worker ยังไม่ได้ build
- **Aftercare 24h LINE queue** ยังไม่ wire (depends on Phase 8 dispatcher → ใช้ template ใหม่)
- **Payment Gateway adapter** (QR PromptPay webhook) — env placeholders only
- **Patient photo S3 GC** — soft-deleted blobs ไม่ถูกลบจาก S3 ตามจริง (PDPA expects 30-day blob purge)
- **Manager dashboard `branchStats`** aggregate tenant-wide MTD revenue ignoring `ctx.branchId` (cross-branch leak)

**🟢 Nice-to-have / Future cleanup**
- **Promotion redemption ledger** ใช้ `auditLog` แทน dedicated `PromotionRedemption` table (per-patient count = in-memory scan) — refactor when volume grows
- **Lab outsourced LIS adapter** ยังไม่มี — nurse กรอกผลด้วยมือ
- **Test coverage** — 19 unit tests; integration + e2e specs ยังไม่เริ่ม
- **`UserRole` table mirror** + **`User.passwordHash` nullable** + **`verifyPassword()` export** — back-compat carriers, decide in v3 whether to drop
- Inline TODOs: `apps/worker-engine/src/relay/outbox-relay.ts:17`, `apps/worker-engine/src/notification/providers/sms.ts:27`

**📋 Architecture Decision Records** (ของจริงใน `docs/adr/`)
- ADR-0001 — Event-driven Modular Monolith
- ADR-0002 — Immutable Ledger & No Hard Delete
- ADR-0003 — Multi-Tenant Strategy
- ADR-0004 — Transactional Outbox
- ADR-0005 — ABAC & Encryption
- ADR-0006 — UI Design System (incl. Theme Refresh v2 dialog conventions)
- ADR-0007 — Identity v2 (Phone + OTP)
- *(0008 reserved — Promotion / AI provider lock-in if needed)*

---

📚 **Implementation Status**: เอกสารฉบับนี้เป็น **Master Blueprint** (vision + design intent). สำหรับสถานะการ implement จริง ดู:
- [`docs/PROGRESS.md`](./PROGRESS.md) — checklist ของ feature ที่ ship แล้ว vs. ยังไม่ทำ (เรียงตาม Phase A → Phase S)
- [`docs/ROLES.md`](./ROLES.md) — Demo credentials (Phone + OTP), Permission matrix, sidebar mapping
- [`docs/DEMO_WORKFLOW.md`](./DEMO_WORKFLOW.md) — End-to-end test scenarios พร้อม step-by-step
- [`docs/design/02-prisma-schema.prisma`](./design/02-prisma-schema.prisma) — Reference schema (ของจริงคือ `packages/db/prisma/schema.prisma`)
- [`docs/adr/`](./adr/) — Architecture Decision Records
