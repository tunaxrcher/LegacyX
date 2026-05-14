// Bilingual content for the Workflow guide dialog (sidebar footer button).
//
// Static reference content. Kept inline in TS rather than spread across ~250
// i18n keys because (a) it is naturally paragraph-shaped, (b) it changes
// rarely, (c) lookups happen in a single place. The render shell still uses
// next-intl for chrome (dialog title / role chip labels / event tooltip).

export type WorkflowRole =
  | "PATIENT"
  | "RECEPTION"
  | "DOCTOR"
  | "NURSE"
  | "PHARMACIST"
  | "MANAGER"
  | "ADMIN"
  | "SYSTEM";

export interface Step {
  /** "1.2" style id for stable anchoring */
  id: string;
  roles: WorkflowRole[];
  title: { th: string; en: string };
  body: { th: string; en: string };
  /** Outbox / domain event emitted by this step (mono-rendered chip). */
  event?: string;
  /** Optional in-app link the user can jump to. */
  link?: { href: string; label: { th: string; en: string } };
}

export interface Phase {
  id: string;
  /** lucide-react icon name — resolved on the client */
  icon: "Sparkles" | "ClipboardList" | "Stethoscope" | "Wallet" | "Activity"
    | "RotateCcw" | "Banknote" | "Repeat" | "ShieldCheck";
  /** Tailwind colour family used for the phase header pill. */
  tone: "teal" | "amber" | "violet" | "sky" | "rose" | "slate" | "indigo" | "emerald";
  title: { th: string; en: string };
  summary: { th: string; en: string };
  steps: Step[];
}

export const WORKFLOW: Phase[] = [
  {
    id: "phase-0",
    icon: "Sparkles",
    tone: "sky",
    title: {
      th: "Phase 0 — คนไข้จองคิวเอง (Self-service)",
      en: "Phase 0 — Patient self-service booking",
    },
    summary: {
      th: "เริ่มต้นจากแอป/เว็บคนไข้ ไม่ต้องล็อกอิน — ดู service → เลือก slot → จอง → auto-login",
      en: "Starts in the patient PWA. No login required — browse services → pick a slot → book → auto-login.",
    },
    steps: [
      {
        id: "0.1",
        roles: ["PATIENT"],
        title: { th: "เข้าหน้าแรกแอปคนไข้ + เลือกหมวด/บริการ", en: "Open patient app & pick a service" },
        body: {
          th: "หน้า / แสดง ServiceCategory cards (ทันตกรรม / ความงาม / Wellness) → /c/[slug] แสดง services ของหมวด → /s/[id] แสดงรายละเอียดบริการพร้อมรูปจาก S3",
          en: "/ shows ServiceCategory cards. /c/[slug] lists services in a category. /s/[id] shows the service detail card with S3-hosted images.",
        },
      },
      {
        id: "0.2",
        roles: ["PATIENT"],
        title: { th: "กรอกชื่อ + เบอร์ + KYC", en: "Enter name, phone & KYC" },
        body: {
          th: "/s/[id]/register — guest กรอกข้อมูล + อัปโหลด KYC photo. ระบบ upsert Patient ด้วย phoneHash (HMAC ของเบอร์ที่ normalise แล้ว) เพื่อกัน duplicate โดยไม่ต้อง decrypt phoneEnc",
          en: "On /s/[id]/register the guest enters details + uploads a KYC photo. The server upserts Patient by phoneHash (HMAC of normalized phone) to dedupe without decrypting phoneEnc.",
        },
      },
      {
        id: "0.3",
        roles: ["PATIENT", "SYSTEM"],
        title: { th: "เลือก slot และยืนยันการจอง", en: "Pick a slot & book" },
        body: {
          th: "/s/[id]/book มี 2 tab — นัดล่วงหน้า (slot ที่เต็มจะ disabled) กับ Walk-in (FIFO queue ตอน check-in). กดยืนยัน → POST /api/v1/public/book → mint patient JWT atomically → redirect ไป /booking/[id]/success → ระบบ emit appointment.created (v1)",
          en: "Two tabs on /s/[id]/book: Advance (full slots disabled) and Walk-in (FIFO queue at check-in). Confirm → POST /api/v1/public/book mints a patient JWT atomically → /booking/[id]/success. System emits appointment.created (v1).",
        },
        event: "appointment.created",
      },
    ],
  },
  {
    id: "phase-1",
    icon: "ClipboardList",
    tone: "amber",
    title: { th: "Phase 1 — Pre-Visit & Triage (เช็คอิน)", en: "Phase 1 — Pre-Visit & Triage (Check-in)" },
    summary: {
      th: "Reception เปิดวันใหม่ ตรวจรายการนัด เช็คอินคนไข้ — Resource Engine จองห้อง/เตียงให้อัตโนมัติ",
      en: "Reception starts the day, reviews appointments, checks patients in. The Resource Engine reserves a room/bed automatically.",
    },
    steps: [
      {
        id: "1.1",
        roles: ["RECEPTION", "MANAGER"],
        title: { th: "เปิดกะ + ตรวจรายการนัดของวัน", en: "Open the cash shift & review the day’s appointments" },
        body: {
          th: "Reception เปิด /manager/eod แท็บ Shift → กด ‘Open Shift’ ใส่ยอดเงินสดเริ่มต้น (emit shift.opened). จากนั้นไปหน้า /appointments ดู timeline ของวัน",
          en: "Reception opens /manager/eod (Shift tab) → Open Shift with starting cash (emits shift.opened). Then /appointments shows the day’s timeline.",
        },
        event: "shift.opened",
        link: { href: "/manager/eod", label: { th: "ไป EoD", en: "Open EoD" } },
      },
      {
        id: "1.2",
        roles: ["RECEPTION"],
        title: { th: "เช็คอินคนไข้", en: "Check the patient in" },
        body: {
          th: "เปิด appointment → กด Check-in → ระบบสร้าง Visit + จับคู่ Resource (ห้อง/เตียง) ที่ว่าง → emit visit.checked_in (v1) — ปลายทางคือ /visits/[id] พร้อมแท็บ Patient / SOAP / Orders / Procedures / Billing / Photos / Labs / Consents / Documents",
          en: "Open the appointment → Check-in. Server creates a Visit and reserves an available Resource (room/bed). Emits visit.checked_in (v1). The new /visits/[id] tab shell opens.",
        },
        event: "visit.checked_in",
      },
      {
        id: "1.3",
        roles: ["NURSE", "RECEPTION"],
        title: { th: "ขอ consent + (ถ้าจำเป็น) เปิด AI intake summary", en: "Capture consent + optional AI intake summary" },
        body: {
          th: "แท็บ Consents — เลือกเทมเพลต (CONSENT_GENERAL / LASER / INJECTION / PHOTO / DATA) → คนไข้เซ็น → emit consent.signed → worker chain ไป document.requested ออก PDF อัตโนมัติ. AI Intake summary จะใช้ตอนหมอเปิด SOAP tab",
          en: "Consents tab — pick a template (GENERAL / LASER / INJECTION / PHOTO / DATA) → patient signs → emit consent.signed → worker chains into document.requested to render the PDF. AI intake summary is loaded inside the SOAP tab.",
        },
        event: "consent.signed",
      },
    ],
  },
  {
    id: "phase-2",
    icon: "Stethoscope",
    tone: "teal",
    title: { th: "Phase 2 — Consultation, EMR & Lab", en: "Phase 2 — Consultation, EMR & Lab" },
    summary: {
      th: "หมอเปิด SOAP + AI Assistant → เซ็น EMR (lock เวอร์ชัน) → สั่ง lab/ยา/หัตถการ. พยาบาลเก็บตัวอย่างและบันทึกผล",
      en: "Doctor opens SOAP + AI Assistant → signs EMR (locks version) → orders labs/meds/procedures. Nurse collects specimens and records results.",
    },
    steps: [
      {
        id: "2.1",
        roles: ["DOCTOR"],
        title: { th: "บันทึก SOAP + ใช้ AI Assistant", en: "Write SOAP using the AI Assistant" },
        body: {
          th: "/visits/[id] → SOAP tab — Web Speech API บันทึกเสียง → ส่งไป ai-service (Gemini Phase Q) → heuristic splitter แยก S/O/A/P. หมอแก้ไขก่อนเซ็น. ‘Load draft’ ดึง AIDraft type=SOAP_NOTE ที่ยัง pending",
          en: "/visits/[id] → SOAP tab. Web Speech API records audio → ai-service (Gemini Phase Q) → heuristic splitter writes a SOAP draft. The doctor edits before signing. ‘Load draft’ pulls a pending AIDraft (type=SOAP_NOTE).",
        },
      },
      {
        id: "2.2",
        roles: ["DOCTOR", "SYSTEM"],
        title: { th: "เซ็น EMR (lock version)", en: "Sign the EMR (lock the version)" },
        body: {
          th: "กด Sign → server หมาย immutable + เพิ่มแถว AuditLog ‘emr.signed’ + emit emr.signed (v1). Version ใหม่ต้องสร้าง record ใหม่ ห้ามแก้ทับ",
          en: "Click Sign → server marks the EMR immutable + writes an AuditLog ‘emr.signed’ + emits emr.signed (v1). A future change requires a new version row — never an in-place edit.",
        },
        event: "emr.signed",
      },
      {
        id: "2.3",
        roles: ["DOCTOR", "NURSE"],
        title: { th: "(ถ้าจำเป็น) สั่ง Lab", en: "(Optional) Order labs" },
        body: {
          th: "Lab tab — Doctor กด ‘Order test’ (lab.ordered) → state machine ORDERED → COLLECTED (Nurse กดเก็บ) → PROCESSING → RESULTED (Nurse กรอก KEY:VALUE) → emit lab.resulted → worker render LAB_REPORT PDF",
          en: "Lab tab — Doctor presses ‘Order test’ (lab.ordered). State machine: ORDERED → COLLECTED (Nurse) → PROCESSING → RESULTED (Nurse enters KEY:VALUE). Emits lab.resulted → worker renders LAB_REPORT PDF.",
        },
        event: "lab.ordered → lab.resulted",
      },
      {
        id: "2.4",
        roles: ["DOCTOR"],
        title: { th: "สั่งยา / หัตถการ + อัปโหลด Before/After", en: "Order meds / procedures + upload Before/After photos" },
        body: {
          th: "Orders tab — เปิด NewOrderDialog (cart UX) เพิ่ม MEDICATION / PROCEDURE / PRODUCT lines พร้อม subtotal → กดยืนยัน emit order.created (v1). Photos tab — อัปโหลด BEFORE/AFTER → optional Gemini Vision analyse",
          en: "Orders tab — NewOrderDialog (cart UX) adds MEDICATION / PROCEDURE / PRODUCT lines with a running subtotal → confirm emits order.created (v1). Photos tab — upload BEFORE/AFTER → optional Gemini Vision analysis.",
        },
        event: "order.created",
      },
    ],
  },
  {
    id: "phase-3",
    icon: "Wallet",
    tone: "violet",
    title: { th: "Phase 3 — Payment & Pharmacy", en: "Phase 3 — Payment & Pharmacy" },
    summary: {
      th: "Reception ออก invoice → (option) ใส่โปรโมชั่น → คนไข้จ่าย → ห้องยา (PHARMACIST) จ่ายยา ตัดสต็อก real-time",
      en: "Reception issues an invoice → (optionally) applies a promo → patient pays → Pharmacy dispenses, deducting stock in real-time.",
    },
    steps: [
      {
        id: "3.1",
        roles: ["RECEPTION"],
        title: { th: "ออก invoice + (option) ใช้โปรโมชั่น", en: "Issue invoice + (optional) apply promo" },
        body: {
          th: "Billing tab → กด ‘Issue Invoice’. ApplyPromoButton → POST /api/v1/invoices/[id]/apply-promo → write Invoice.discount/total + emit promotion.redeemed (per-patient cap + idempotent re-apply ของโค้ดเดียวกัน)",
          en: "Billing tab → ‘Issue Invoice’. ApplyPromoButton → POST /api/v1/invoices/[id]/apply-promo → writes Invoice.discount/total + emits promotion.redeemed (per-patient cap + idempotent re-apply for the same code).",
        },
        event: "promotion.redeemed",
      },
      {
        id: "3.2",
        roles: ["RECEPTION", "PATIENT"],
        title: { th: "รับชำระเงิน", en: "Take payment" },
        body: {
          th: "เลือก method (cash / card / transfer / wallet) → emit payment.completed (v1). Worker chain: เจน E_RECEIPT (document.requested) + ตัด wallet (wallet.used) ถ้าใช้คอร์ส + แจ้ง iPad ผู้ช่วย",
          en: "Pick a method (cash / card / transfer / wallet) → emits payment.completed (v1). Worker chain: render E_RECEIPT (document.requested) + wallet.used if a course was redeemed + iPad notification to the assistant.",
        },
        event: "payment.completed → wallet.used",
      },
      {
        id: "3.3",
        roles: ["PHARMACIST", "MANAGER"],
        title: { th: "ห้องยา — รับ Order, จ่ายยา, ตัดสต็อก", en: "Pharmacy queue — dispense + deduct stock" },
        body: {
          th: "/pharmacy แสดง Order ที่มี MEDICATION lines ของสาขา. PHARMACIST กด Dispense → ตัด inventory ledger (DISPENSE) + create PharmacyDispense + emit pharmacy.dispensed. MANAGER เห็น queue เดียวกันสำหรับ oversight แต่ไม่มีปุ่ม Dispense (pharmacy:read vs pharmacy:dispense)",
          en: "/pharmacy lists Orders with MEDICATION lines for the active branch. PHARMACIST presses Dispense → inventory ledger (DISPENSE) + PharmacyDispense row + pharmacy.dispensed event. MANAGER sees the same queue for oversight but with no Dispense button (pharmacy:read vs pharmacy:dispense).",
        },
        event: "pharmacy.dispensed",
        link: { href: "/pharmacy", label: { th: "เปิดห้องยา", en: "Open pharmacy" } },
      },
    ],
  },
  {
    id: "phase-4",
    icon: "Activity",
    tone: "indigo",
    title: { th: "Phase 4 — Procedure & Aftercare", en: "Phase 4 — Procedure & Aftercare" },
    summary: {
      th: "พยาบาล/หมอทำหัตถการ → กด Complete → ระบบตัดสต็อกตาม BOM + คำนวณ commission + ตั้งคิว aftercare 24 ชม.",
      en: "Nurse/Doctor performs the procedure → marks Complete → server consumes BOM stock + computes commission + queues a 24h aftercare LINE message.",
    },
    steps: [
      {
        id: "4.1",
        roles: ["NURSE", "DOCTOR"],
        title: { th: "เริ่ม + จบหัตถการ", en: "Start & finish the procedure" },
        body: {
          th: "Procedures tab → กด Start (resource lock) → Complete → emit procedure.completed (v1). Worker: BOM consume → emit inventory.adjusted หลายเส้นต่ออุปกรณ์/ยาที่ผูกกับ procedure code",
          en: "Procedures tab → Start (resource lock) → Complete → emits procedure.completed (v1). Worker: BOM consume → emits inventory.adjusted lines for every consumable bound to the procedure code.",
        },
        event: "procedure.completed → inventory.adjusted",
      },
      {
        id: "4.2",
        roles: ["SYSTEM"],
        title: { th: "Worker คำนวณ commission + Aftercare", en: "Worker computes commission + queues aftercare" },
        body: {
          th: "worker-engine คำนวณ Doctor Fee / Commission ตามสูตรของหัตถการ + เก็บลง ledger. ตั้งคิว LINE aftercare ส่งใน 24 ชม. (ใช้ Notification Dispatcher tick 5 วินาที)",
          en: "worker-engine computes the doctor fee / commission per the procedure rule and writes it to the ledger. Schedules a LINE aftercare message 24h later (Notification Dispatcher ticks every 5s).",
        },
      },
      {
        id: "4.3",
        roles: ["RECEPTION", "PATIENT"],
        title: { th: "ออกเอกสาร (Medical Cert / e-Tax) ตามที่ขอ", en: "Issue documents (Medical Cert / e-Tax) on request" },
        body: {
          th: "กด ‘Issue Tax Invoice’ บน invoice ที่ PAID → POST /api/v1/invoices/[id]/tax-invoice → render PDF + append แถวลง storage/etax/<tenant>/<yyyy-mm>/etax-invoices.csv. Medical Cert ใช้ MedicalCertButton (Doctor only)",
          en: "‘Issue Tax Invoice’ on a PAID invoice → POST /api/v1/invoices/[id]/tax-invoice → renders PDF + appends a row to storage/etax/<tenant>/<yyyy-mm>/etax-invoices.csv. Medical Cert uses MedicalCertButton (Doctor only).",
        },
        event: "document.requested → document.generated",
      },
    ],
  },
  {
    id: "phase-5",
    icon: "RotateCcw",
    tone: "rose",
    title: { th: "Phase 5 — Reversal (เคสยกเลิก / refund)", en: "Phase 5 — Reversal (cancel / refund)" },
    summary: {
      th: "ใช้ Compensating Transaction ห้ามลบ — void invoice / refund payment / reverse wallet+stock — ทุก action ลง audit log",
      en: "Compensating Transaction model — never delete. void invoice / refund payment / reverse wallet+stock — every action is audit-logged.",
    },
    steps: [
      {
        id: "5.1",
        roles: ["RECEPTION", "MANAGER"],
        title: { th: "ยกเลิก order หรือ void invoice", en: "Cancel an order or void an invoice" },
        body: {
          th: "Orders/Billing tab → กด Void (RECEPTION เปิด, MANAGER อนุมัติยอดใหญ่) → emit order.cancelled / invoice.voided. Resource ที่ผูกกับ order จะถูกปลดอัตโนมัติ",
          en: "Orders/Billing tab → Void (RECEPTION initiates, MANAGER approves large amounts) → emits order.cancelled / invoice.voided. Resources bound to the order are released automatically.",
        },
        event: "order.cancelled / invoice.voided",
      },
      {
        id: "5.2",
        roles: ["RECEPTION", "MANAGER"],
        title: { th: "Refund + คืน wallet/สต็อก", en: "Refund + reverse wallet/stock" },
        body: {
          th: "กด Refund → emit payment.refunded + wallet.reversed (+1 หากใช้คอร์ส) + stock.reversed (+1 หากใช้วัสดุ). หากเคสฉุกเฉินเกิน scope ปกติ ต้องใช้ Break-Glass override (`required_reason` + `approved_by`)",
          en: "Refund → emits payment.refunded + wallet.reversed (+1 if course was redeemed) + stock.reversed (+1 if BOM was consumed). Out-of-scope edits require Break-Glass override (required_reason + approved_by).",
        },
        event: "payment.refunded → wallet.reversed → stock.reversed",
        link: { href: "/break-glass", label: { th: "Break-Glass queue", en: "Break-Glass queue" } },
      },
    ],
  },
  {
    id: "phase-6",
    icon: "Banknote",
    tone: "emerald",
    title: { th: "Phase 6 — End-of-Day", en: "Phase 6 — End-of-Day" },
    summary: {
      th: "Reception ปิดกะ → MANAGER settle ยอด → MANAGER reconcile สต็อก. shrinkage บังคับ Break-Glass",
      en: "Reception closes the shift → MANAGER settles payments → MANAGER reconciles inventory. Shrinkage forces Break-Glass.",
    },
    steps: [
      {
        id: "6.1",
        roles: ["RECEPTION"],
        title: { th: "นับเงินสด ปิดกะ", en: "Count cash & close the shift" },
        body: {
          th: "/manager/eod แท็บ Shift → กรอกยอดเงินสดที่นับได้ → ระบบเทียบยอดที่ระบบบันทึก → emit shift.closed พร้อม variance amount (ถ้ามี) + แจ้ง MANAGER ถ้าเกิน threshold",
          en: "/manager/eod (Shift tab) → enter the counted cash → server compares to ledger → emits shift.closed with variance (if any) + alerts MANAGER if it exceeds the threshold.",
        },
        event: "shift.closed",
      },
      {
        id: "6.2",
        roles: ["MANAGER"],
        title: { th: "Settle ยอดที่ COMPLETED → ส่ง Accounting", en: "Settle COMPLETED payments → push Accounting" },
        body: {
          th: "/manager/eod แท็บ Settlement → เลือก payments ที่ COMPLETED → batch settle → emit payment.settled → worker push Accounting Export",
          en: "/manager/eod (Settlement tab) → select COMPLETED payments → batch settle → emits payment.settled → worker pushes the Accounting Export.",
        },
        event: "payment.settled",
      },
      {
        id: "6.3",
        roles: ["MANAGER"],
        title: { th: "Reconcile สต็อก", en: "Reconcile inventory" },
        body: {
          th: "/manager/eod แท็บ Inventory Reconcile → กรอกจำนวนจริง → ระบบคำนวณ variance → emit inventory.reconciled. Variance > 0 (shrinkage) บังคับ Break-Glass override + เขียน audit log + แจ้งเตือน inventory.shrinkage_alert",
          en: "/manager/eod (Inventory Reconcile tab) → enter physical counts → server computes variance → emits inventory.reconciled. Positive variance (shrinkage) forces Break-Glass override + audit log + an inventory.shrinkage_alert notification.",
        },
        event: "inventory.reconciled",
      },
    ],
  },
  {
    id: "phase-7",
    icon: "Repeat",
    tone: "slate",
    title: { th: "Phase 7 — Post-Visit CRM (อัตโนมัติ)", en: "Phase 7 — Post-Visit CRM (automated)" },
    summary: {
      th: "worker-engine cron tick (ทุก 1 ชม.) ส่ง 4 แคมเปญ — review / rebooking / wallet expiring / birthday bonus. ใช้ idempotency key กันส่งซ้ำ",
      en: "worker-engine cron tick (hourly) fires 4 campaigns — review / rebooking / wallet expiring / birthday bonus. Idempotency keys prevent duplicates.",
    },
    steps: [
      {
        id: "7.1",
        roles: ["SYSTEM", "PATIENT"],
        title: { th: "Review request (D+3)", en: "Review request (D+3)" },
        body: {
          th: "3 วันหลัง procedure.completed → enqueue review.request → ส่ง LINE/SMS ขอรีวิว/NPS",
          en: "3 days after procedure.completed → enqueues review.request → sends LINE/SMS asking for a review/NPS.",
        },
        event: "review.request",
      },
      {
        id: "7.2",
        roles: ["SYSTEM", "PATIENT"],
        title: { th: "Rebooking reminder (เช่น Botox 4 เดือน)", en: "Rebooking reminder (e.g. Botox 4 months)" },
        body: {
          th: "Cron คำนวณรอบครบกำหนดของหัตถการ → enqueue rebooking.reminder",
          en: "Cron computes the procedure’s rebooking cadence → enqueues rebooking.reminder.",
        },
        event: "rebooking.reminder",
      },
      {
        id: "7.3",
        roles: ["SYSTEM", "PATIENT"],
        title: { th: "Wallet/course ใกล้หมดอายุ ≤ 30 วัน", en: "Wallet/course expiring ≤ 30 days" },
        body: {
          th: "Cron กวาด wallet ที่เหลือ ≤ 30 วัน → enqueue wallet.expiring → ทริกเกอร์โปรโมชันต่ออายุ",
          en: "Cron sweeps wallets with ≤ 30 days remaining → enqueues wallet.expiring → triggers a renewal campaign.",
        },
        event: "wallet.expiring",
      },
      {
        id: "7.4",
        roles: ["SYSTEM", "PATIENT"],
        title: { th: "Birthday bonus", en: "Birthday bonus" },
        body: {
          th: "Cron ตรวจวันเกิดลูกค้า → enqueue campaign.birthday_bonus (voucher / แต้ม)",
          en: "Cron checks customer birthdays → enqueues campaign.birthday_bonus (voucher / loyalty points).",
        },
        event: "campaign.birthday_bonus",
      },
    ],
  },
  {
    id: "phase-oversight",
    icon: "ShieldCheck",
    tone: "slate",
    title: { th: "เบื้องหลัง — MANAGER & ADMIN ทำอะไรบ้าง", en: "Behind the scenes — MANAGER & ADMIN duties" },
    summary: {
      th: "สองบทบาทนี้ไม่ได้ลงงาน OPD ทุกวัน แต่คุมเพดาน — ตั้งค่าคลีนิก / กำกับ compliance / ดูแลระบบ",
      en: "These two roles don’t run daily OPD work — they set the ceiling: clinic config, compliance oversight, and system plumbing.",
    },
    steps: [
      {
        id: "M.1",
        roles: ["MANAGER"],
        title: { th: "ตั้งค่าคลีนิก (Clinic Setup)", en: "Clinic setup" },
        body: {
          th: "/manager/{resources,services,catalog,staff,notifications} — ห้อง/เครื่อง, services ที่คนไข้จองได้, สินค้า+คอร์ส (BOM), บัญชีพนักงาน (เพิ่ม/แก้/ปลด/Reactivate — ห้ามแตะ ADMIN), notification template",
          en: "/manager/{resources,services,catalog,staff,notifications} — rooms/equipment, patient-facing services, products + courses (BOM), staff accounts (create/update/retire/reactivate — never ADMIN), notification templates.",
        },
        link: { href: "/manager", label: { th: "Manager Dashboard", en: "Manager Dashboard" } },
      },
      {
        id: "M.2",
        roles: ["MANAGER"],
        title: { th: "Compliance & PDPA", en: "Compliance & PDPA" },
        body: {
          th: "/audit (filter ด้วย correlation_id), /break-glass (อนุมัติ override), /manager/patients/merge (รวมเคสซ้ำ + reason ≥ 8 chars), /manager/pdpa (Export PII / Anonymise — ลบไม่ได้แต่ pseudonymise ได้, ledger เก็บ 7 ปีตามภาษี)",
          en: "/audit (filter by correlation_id), /break-glass (approve overrides), /manager/patients/merge (dedupe with reason ≥ 8 chars), /manager/pdpa (Export PII / Anonymise — irreversible pseudonymisation, ledger kept 7 years for tax retention).",
        },
        link: { href: "/manager/pdpa", label: { th: "PDPA / DSR", en: "PDPA / DSR" } },
      },
      {
        id: "A.1",
        roles: ["ADMIN"],
        title: { th: "System admin (ไม่ใช่ ops)", en: "System admin (not operations)" },
        body: {
          th: "/admin (KPI + DLQ alert), /admin/users (CRUD พนักงานทุก role รวม MANAGER/ADMIN — สำหรับ bootstrap/recover), /admin/roles (permission matrix viewer), /admin/branches (เพิ่มสาขา), /dlq (manual reprocess), /settings (system config)",
          en: "/admin (KPIs + DLQ alert), /admin/users (full staff CRUD including MANAGER/ADMIN — for bootstrap/recovery), /admin/roles (permission matrix viewer), /admin/branches (multi-branch setup), /dlq (manual reprocess), /settings (system config).",
        },
        link: { href: "/admin", label: { th: "Admin Overview", en: "Admin Overview" } },
      },
      {
        id: "A.2",
        roles: ["ADMIN", "MANAGER"],
        title: { th: "Separation of Duties (กฎทอง)", en: "Separation of Duties (golden rule)" },
        body: {
          th: "Role-allowlist server-side: ADMIN assign role ไหนก็ได้ (รวม MANAGER), MANAGER assign ได้แค่ DOCTOR / NURSE / RECEPTION / PHARMACIST และ ‘มองไม่เห็น’ row ของ ADMIN เลย. ดู docs/ROLES.md สำหรับ matrix เต็ม",
          en: "Server-side role-allowlist: ADMIN may assign any role (incl. MANAGER); MANAGER may assign only DOCTOR / NURSE / RECEPTION / PHARMACIST and cannot even see ADMIN rows. See docs/ROLES.md for the full matrix.",
        },
      },
    ],
  },
];

/** Fired by every event handler before the visible chain — kept here for the "Behind the curtain" callout. */
export const PLATFORM_NOTES: { th: string; en: string }[] = [
  {
    th: "ทุก write ลง outbox เสมอ (Transactional Outbox) — Worker ค่อยไปดึง emit event อีกที จึงไม่มี ‘DB save แล้วแต่ event หาย’",
    en: "Every write hits the outbox (Transactional Outbox) — the worker drains it later, so we never lose an event after a successful DB write.",
  },
  {
    th: "Idempotency key อยู่ทุก event (event_id + tenant_id + correlation_id) → handler ทำซ้ำกี่รอบก็ได้ผลลัพธ์เดียว",
    en: "Every event carries an idempotency key (event_id + tenant_id + correlation_id) so handlers can retry safely.",
  },
  {
    th: "Worker fail → ขึ้น DLQ + เด้ง alert บน /admin (DLQ tile) → ADMIN กด Reprocess",
    en: "Worker failures land in the DLQ + raise an alert on /admin (DLQ tile) → ADMIN clicks Reprocess.",
  },
  {
    th: "Notification Dispatcher tick ทุก 5 วินาที (LINE/SMS/Email queue), CRM Cron tick รายชั่วโมง",
    en: "Notification Dispatcher ticks every 5s (LINE/SMS/Email queue); CRM Cron ticks hourly.",
  },
];
