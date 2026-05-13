🏥 Master Blueprint: LegacyX Enterprise Clinic Management System
🌟 1. Executive Summary & Core Philosophy
LegacyX คือระบบบริหารจัดการคลินิกระดับ Enterprise (Enterprise Clinic Management System) ที่ออกแบบมาเพื่อรองรับธุรกิจคลินิกความงามและ Wellness ระดับพรีเมียม โดยยึดหลักการทางวิศวกรรมซอฟต์แวร์ขั้นสูงดังนี้:
High-Touch, Low-Routine: นำ AI และระบบ Automation มาจัดการงานเอกสารและงานหลังบ้าน เพื่อให้บุคลากรทางการแพทย์โฟกัสกับการดูแลคนไข้ได้อย่างเต็มที่
Scalability & Isolation: โครงสร้างออกแบบมาเพื่อรองรับ Multi-branch (หลายสาขา) และ Multi-tenant (ระบบ SaaS) ตั้งแต่รากฐาน
Immutable Truth: ข้อมูลทางการเงิน (Ledger), คลังสินค้า (Stock) และประวัติการรักษา (EMR) ต้องมีความโปร่งใส ตรวจสอบย้อนหลังได้ 100% (No silent overwrites)
Bulletproof Compliance: ปฏิบัติตามกฎหมาย PDPA, มาตรฐานสถานพยาบาล, และนโยบายความปลอดภัยของข้อมูลระดับสูงสุด

🏗️ 2. System Architecture & Tech Stack
ระบบใช้สถาปัตยกรรม Event-Driven Modular Monolith บนโครงสร้าง Monorepo เพื่อรักษาสถานะ Transaction ให้แม่นยำ พร้อมการแยก Process ของ UI/API และ Background Task ออกจากกันอย่างเด็ดขาดเพื่อประสิทธิภาพสูงสุด
Database: MySQL ทำงานร่วมกับ Prisma ORM (เพื่อ ACID Compliance และ Type-safety)
Frontend & API Layer: Next.js (React) สำหรับฝั่ง Client Applications และ Core API (Request/Response)
Background Workers & AI: Node.js (TypeScript) รันเป็น Process แยกต่างหาก ไม่ผูกกับ Next.js เพื่อรองรับ Long-running tasks
Message Broker: Redis (BullMQ) หรือ AWS SQS สำหรับ Outbox Relay และระบบ Queue
Object Storage: AWS S3(Digitalocean) + CDN (บังคับใช้ Signed URL สำหรับเอกสาร/รูปภาพ พร้อมตั้งค่า Lifecycle Policy)

📦 3. Project Structure (Monorepo via Turborepo / Nx)
โครงสร้างโปรเจกต์ถูกแบ่งย่อยเพื่อลดการผูกมัด (Decoupling) แต่สามารถแชร์ Types และ Database Schema ร่วมกันได้
🖥️ Frontend Applications (Next.js)
apps/patient-app: Web App (PWA/LIFF) สำหรับคนไข้ (จองคิว, ดูประวัติ, เช็คคอร์สคงเหลือ, ดูรูป Before/After)
apps/clinical-pad: Tablet Web App สำหรับแพทย์และผู้ช่วย (Touch-optimized, ระบบบันทึกเสียง, กดทำหัตถการ)
apps/backoffice-web: Desktop Web App สำหรับพนักงานหน้าเคาน์เตอร์, ห้องยา, และผู้บริหาร (Dashboard, Billing, Inventory)
⚙️ Backend & Service Layer (Next.js + Node.js)
apps/api-server (Next.js API / Server Actions): รับ Request จากหน้าบ้านทั้งหมด และจัดการ Business Logic หลัก
apps/worker-engine (Node.js TypeScript Process): ดึงงานจาก Queue ไปรันแบบ Asynchronous (เช่น ตัดสต็อก BOM, ส่ง LINE/SMS, เจน PDF, ระบบ Retry, DLQ, ส่ง Aftercare)
apps/ai-service (Node.js AI Orchestrator): เป็นตัวกลางเรียก External AI API (Speech-to-Text, LLM, Vision API) ประมวลผล และจัดการ AI Draft / Approval Log
🧩 Shared Packages
packages/db (Prisma Schema / Migrations)
packages/ui (Design System กลาง เช่น ปุ่ม, ฟอร์ม)
packages/types (Zod Validation Schemas)
packages/events (Event Dictionary & Constants)

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

🗄️ 5. Core Domain Modules
🛡️ 1. Security, Compliance & Identity Module
ABAC (Attribute-Based Access Control): ผูก Role เข้ากับ Permission Scope (เช่น หมอ Role: Doctor สามารถดู EMR ได้เฉพาะคนไข้ในสาขาของตน Scope: branch_id)
Encryption at Rest: เข้ารหัสข้อมูล EMR อ่อนไหวตั้งแต่ตอนบันทึกลง Database
Consent Snapshot: บันทึก Document Version ของใบยินยอมที่คนไข้เซ็นพร้อม Timestamp ว่าเซ็นเวอร์ชันไหน
Patient Merge Engine: ระบบตรวจจับคนไข้ซ้ำซ้อน (Duplicate Detection) และรวมประวัติ (Patient Merge) พร้อมเก็บ Merge Audit Log
📄 2. Document & Integration Module
Document Generation: Worker สร้าง PDF อัตโนมัติ (Consent, Medical Cert, e-Receipt, Tax Invoice) ถูกเรียกผ่าน Event document.requested เก็บลง Object Storage
Integration Center: ศูนย์รวม API ภายนอก (Payment Gateway, SMS, LINE OA, e-Tax, Accounting Export)
Notification Layer: จัดการคิวส่งข้อความ LINE/SMS/Email มีระบบ Template, Retry Queue และ Delivery Log
🩺 3. Clinical & AI Assistive Module
Locked EMR: เมื่อเกิด Event emr.signed ระบบจะล็อก Version ของ EMR (Immutable) หากต้องการแก้ต้องสร้าง Version ใหม่พร้อม Audit Log
AI Policy: "AI-generated content is assistive only. Final clinical decisions require human approval."
AI Orchestrator: จัดการ AI Intake Summary (สรุปอาการก่อนพบแพทย์) และ AI Voice-to-Note Draft (ดราฟต์ประวัติจากเสียงสนทนา)
💰 4. Financial & Promotion Module
Granular Payment States: แยกสถานะชัดเจน: payment.authorized (จองวงเงิน) -> payment.completed (ทำรายการสำเร็จ ทริกเกอร์หัตถการได้) -> payment.settled (เงินเข้าบัญชีจริง ใช้สำหรับระบบบัญชี) -> payment.failed/refunded
Wallet Ledger: ระบบคอร์สความงามเป็น Immutable Ledger (PURCHASE +10, USE -1)
Promotion Engine: รองรับ Tier Pricing, Bundle Promotion, Package Discount
📦 5. Generic Resource & Inventory Module
Resource Engine: จัดการ Resource กลางแบบ Abstraction (Room, Machine, Therapist, Laser) มีระบบ Reservation, Utilization และ Maintenance Status
Stock Ledger & BOM: บันทึกคลังแบบ Immutable (RECEIVE, DISPENSE, BOM_USAGE) โดยใช้ BOM ตัดสต็อกอัตโนมัติ

🔄 6. The User Journey & Event Dictionary Flow
ผังการทำงานจริงครอบคลุมตั้งแต่ก่อนลูกค้าเข้าคลินิกจนถึงการรักษาฐานลูกค้าระยะยาว (Life-time Value)
🟢 Phase 1: Pre-Visit & Triage (ก่อนเข้ารับบริการ)
จองคิว → appointment.created (v1)
AI เตรียม Intake Summary → ระบบเก็บ Consent Snapshot
มาถึงคลินิก เช็คอินเข้าสู่ระบบ → visit.checked_in (v1) ทริกเกอร์ Resource Engine ให้เตรียมเตียง/ห้อง
🟢 Phase 2: Consultation & Optional Lab (พบแพทย์และส่งตรวจ)
แพทย์พบคนไข้ (ใช้ AI Orchestrator ดราฟต์ Note)
แพทย์กดยืนยัน EMR → emr.signed (v1) (ทริกเกอร์: Lock EMR Version + เขียน Audit Log)
(Optional) แพทย์สั่งตรวจ Lab → lab.ordered → ผล Lab ออก → lab.resulted
ลูกค้าร้องขอเอกสาร → document.requested (v1) (ทริกเกอร์: เจน Medical Cert / Consent PDF)
แพทย์สั่งยา/หัตถการ → order.created (v1)
🟢 Phase 3: Payment, Pharmacy & Dispatch (การเงิน ห้องยา กระจายงาน)
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

