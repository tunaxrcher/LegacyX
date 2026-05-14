# 🚶 LegacyX — End-to-End Demo Workflow

> สำหรับทดสอบระบบครบ flow ตั้งแต่ลูกค้าจองคิว จนได้ใบเสร็จและตัดสต็อกเสร็จ.
> อ่านควบคู่ [`ROLES.md`](./ROLES.md) (สิทธิ์แต่ละ role) และ
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6 (Event Flow).

## 🪪 Demo Credentials

Login = **Phone + OTP**. Dev OTP สำหรับทุกเบอร์: `123456` (env `DEV_OTP`).

| Role | Phone | Full Name |
|---|---|---|
| ADMIN | `0800000001` | System Administrator |
| MANAGER | `0800000002` | Manda Manager |
| DOCTOR | `0800000003` | Dr. Daniel Doctor |
| NURSE | `0800000004` | Nina Nurse |
| RECEPTION | `0800000005` | Rita Reception |
| PHARMACIST | `0800000006` | Phil Pharmacist |
| DOCTOR + MANAGER | `0888888888` | Dr. Dual (multi-role — เลือก role ตอน OTP) |

**Tenant**: `legacyx` · **Branches**: `br_01` (Sukhumvit) · `br_02` (Thonglor)

> หลัง login: ADMIN จะตกที่ `/admin` (System Overview), ส่วน role อื่น ๆ ตกที่ `/` (Operational Dashboard).

---

## 🎬 Scenario A — หัตถการ Botox ครบวงจร

ลูกค้า **HN-0000001 (Demo Patient)** มาทำ Botox Face (PROC_BTX_FACE) ราคา 5,000 บาท ที่สาขา Thonglor

### 1️⃣ RECEPTION — รับจอง

**Login**: `0800000005` (RECEPTION)

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 1.1 | `/patients` | ค้นหา "HN-0000001" หรือกด `+ New patient` ถ้ายังไม่มี | (ถ้า new) สร้าง patient → audit log |
| 1.2 | `/appointments` | `+ นัดหมายใหม่` → เลือก patient, แพทย์, วันเวลา, type=PROCEDURE | ✅ Emit `appointment.created` |
| 1.3 | ดูตารางนัด | เห็นนัดอยู่ในสถานะ **BOOKED** | — |

→ ลูกค้ามาตามเวลา…

### 2️⃣ RECEPTION — เช็คอิน

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 2.1 | `/appointments` | คลิกนัดของลูกค้า | เปิด detail |
| 2.2 | ปุ่ม **Check-in** | เลือก **ห้อง 301** (Dental Room) → ยืนยัน | ✅ Emit `visit.checked_in` · Visit สถานะ `OPEN` · Resource สถานะ `OCCUPIED` |
| 2.3 | `/resources` | (option) ดูห้อง 301 ว่าใครใช้อยู่ | เห็นชื่อ "Demo Patient" · status dot 🔵 OCCUPIED |

→ ส่งต่อให้ผู้ช่วย/แพทย์ "เคสพร้อมที่ห้อง 301"

### 3️⃣ NURSE — เริ่มเคส + สั่งหัตถการ

**Logout** → **Login**: `0800000004` (NURSE)

> ⚠️ **DOCTOR** เท่านั้นที่สั่ง order ได้ (NURSE มี `procedure:perform` แต่ไม่มี `order:write`).
> ถ้าคลินิกมีคน DOCTOR คนเดียวที่ใช้บัญชี doctor login เอง ใช้ `0800000003` (DOCTOR).

**Logout** → **Login**: `0800000003` (DOCTOR)

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 3.1 | `/visits` | คลิก visit ของ Demo Patient | เปิดหน้า visit detail |
| 3.2 | ปุ่ม **+ New Order** | Type=PROCEDURE · ref=`PROC_BTX_FACE` · description="Botox face" · qty=1 · unit_price=5000 | ✅ Emit `order.created` · Order สถานะ `CREATED` |
| 3.3 | (option) `/ai-drafts` | ตรวจ AI draft ของ EMR (ถ้ามี) · กดอนุมัติ | ✅ Emit `ai.draft.approved` |
| 3.4 | `/emr/sign` | เซ็น EMR ของ visit นี้ | ✅ Emit `emr.signed` (ABAC scope=`self` — แพทย์เซ็นได้เฉพาะของตัวเอง) |

### 4️⃣ NURSE — เริ่มและจบหัตถการ

**Logout** → **Login**: `0800000004` (NURSE)

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 4.1 | `/visits/<id>` | บนแถว Procedure → ปุ่ม **Start** | ✅ Emit `procedure.started` |
| 4.2 | บนแถว Procedure → ปุ่ม **Complete** | ตัด BOM อัตโนมัติ → worker engine ดึง event | ✅ Emit `procedure.completed` |
| 4.3 | *(behind the scenes)* | Worker handler: ตัด BTX-100U 0.5 vial, NEEDLE-30G 4 pcs, GAUZE-PK 1 pack | ✅ Emit `inventory.adjusted` × 3 |
| 4.4 | `/inventory/<product_id>` | ดู stock ledger ของ BTX-100U | เห็น `BOM_USAGE` row qty -0.5 |

### 5️⃣ RECEPTION — รับเงิน + ออกใบเสร็จ

**Logout** → **Login**: `0800000005` (RECEPTION)

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 5.1 | `/visits/<id>` → **Billing section** | กด **Create invoice** | ✅ Emit `invoice.created` · Invoice สถานะ `ISSUED` |
| 5.2 | กด **Take payment** | method=CASH · amount=5000 | ✅ Emit `payment.completed` · ✅ `invoice.paid` |
| 5.3 | *(behind the scenes)* | Worker handler รับ `payment.completed` → ขอเอกสาร | ✅ Emit `document.requested` (type=E_RECEIPT) |
| 5.4 | *(worker)* | Worker handler `document-requested.ts` → generate PDF + เก็บ local storage | ✅ Emit `document.generated` |
| 5.5 | กดลิ้งก์ใบเสร็จในหน้า Billing | เปิด PDF | ✅ ใบเสร็จ E-Receipt |

### 6️⃣ RECEPTION / NURSE — ปิดเคส

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 6.1 | `/visits/<id>` | ปุ่ม **ปิดเคส** มุมขวาบน | ✅ Visit → `COMPLETED` · ✅ ห้อง 301 auto-release → `AVAILABLE` |
| 6.2 | `/resources` | ห้อง 301 กลับมาว่าง 🟢 | พร้อมรับเคสถัดไป |

---

## 🎬 Scenario B — จ่ายยา (Pharmacy flow)

ลูกค้าได้รับใบสั่งยา paracetamol 1 กล่อง

### 1️⃣ DOCTOR — สั่งยา
**Login**: `0800000003` (DOCTOR) → `/visits/<id>` → **+ New Order** · type=MEDICATION · refId=`<product_id ของยา>` · qty=1

### 2️⃣ PHARMACIST — จ่ายยา
**Logout** → **Login**: `0800000006` (PHARMACIST)

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 1 | `/pharmacy` | เห็น queue ของ Order ที่มี MEDICATION lines | ลูกค้าอยู่ในกอง **Pending** |
| 2 | กด **จ่ายยา** บนแถวลูกค้า | ระบุ notes (option) → ยืนยัน | ตัดสต็อกผ่าน StockLedger.DISPENSE · ✅ Emit `pharmacy.dispensed` |
| 3 | กลับมาที่ `/pharmacy` | ลูกค้าย้ายไปกอง **Dispensed** | สถานะ DISPENSED |

---

## 🎬 Scenario C — ยกเลิก / ย้อนรายการ (Reversal Chain)

### C1 — ยกเลิก order ก่อนเริ่ม
- DOCTOR เปิด visit → กด **Cancel** บน order → ✅ `order.cancelled` · Resource ที่จองหลวมๆ ถูกปล่อย

### C2 — Void invoice (กรณีออกใบเสร็จผิด)
- MANAGER เปิด `/audit` หา invoice → API: `POST /api/v1/invoices/{id}/void` · ✅ `invoice.voided`

### C3 — Refund payment
- MANAGER → `POST /api/v1/payments/{id}/refund` · ✅ `payment.refunded`

### C4 — Reverse stock (ปรับสต็อกที่ตัดผิด)
- NURSE หรือ MANAGER ไป `/inventory/<product_id>` → คลิก **Reverse** ที่ row ใดก็ได้ที่ไม่ใช่ REVERSAL · ระบุเหตุผล · ✅ `stock.reversed`

---

## 🎬 Scenario D — Manager Daily Overview

**Login**: `0800000002` (MANAGER)

1. `/manager` → ดู Strategic Dashboard:
   - **รายได้วันนี้** + delta vs เมื่อวาน
   - **รายได้ MTD**
   - **เคสวันนี้**
   - **สินค้าใกล้หมด** (highlight ถ้ามี)
   - Bar chart 7 วัน + เปรียบเทียบสาขา
2. `/audit` → กรอง `action=payment.completed` → ดูใบเสร็จที่เพิ่งออก
3. `/break-glass` → ถ้ามี junior staff ขอ override (เช่น แก้ EMR ปิดไปแล้ว) → กด **Approve Override**

---

## 🎬 Scenario E — End-of-Day Operations (Phase 6.8)

ปิดวงจรของวัน — ปิดกะ, settle gateway, นับสต็อก. ทำได้ทั้ง MANAGER และ RECEPTION (เฉพาะ Shift tab สำหรับ RECEPTION; tabs Settlement + Recon เป็นของ MANAGER).

### E1 — เปิดกะตอนเช้า (RECEPTION)

**Login**: `0800000005` (RECEPTION)

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 1 | `/manager/eod` → tab **Shift Close** | กด **Open shift** → ระบุ `cash_opening` (เงินสดเปิดลิ้นชัก) | สร้าง `Shift` row สถานะ `OPEN` · audit `shift.open` |
| 2 | KPI การ์ดบนสุด | เห็น "Shift: Open · #shift_id" + เวลาเปิด | shift ผูกกับ branch ปัจจุบันใน BranchPicker |

→ ทำงานปกติทั้งวัน… Receive payment, complete visits, dispense medication, ฯลฯ

### E2 — ปิดกะตอนเย็น (RECEPTION หรือ MANAGER)

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 1 | `/manager/eod` → tab **Shift Close** | กด **Close shift** ของกะที่เปิดอยู่ | เปิด CloseShiftDialog |
| 2 | ดู **expected cash** | ระบบสรุปจาก `Payment` ที่ method=CASH/OTHER ในช่วง shift นี้ | คำนวณ realtime จาก DB |
| 3 | ระบุ **counted cash** ที่นับได้จริง | ระบบโชว์ variance = counted − expected | ถ้า variance ≥ ±฿1,000 จะ highlight เป็นเตือน |
| 4 | ยืนยัน | ✅ Emit `shift.closed` · audit `shift.close` · Worker หยิบ event → ถ้า variance สูงจะ enqueue `NotificationLog` แจ้ง MANAGER | Shift สถานะ `CLOSED` |

### E3 — Gateway Settlement (MANAGER เท่านั้น)

ตอนสิ้นวัน gateway (เช่น 2C2P, Omise, KBank QR) จะรวม transactions เป็น batch แล้ว transfer เงินเข้า bank account ของคลินิก. ฝั่งระบบต้อง mark payments เหล่านั้นเป็น `SETTLED` พร้อม `gateway_settlement_id` + fee.

**Login**: `0800000002` (MANAGER)

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 1 | `/manager/eod` → tab **Settlement** | เห็นรายการ Payment ที่ `status=COMPLETED` แต่ `settledAt=null` | filter ตาม method (CARD / QR_PROMPTPAY / TRANSFER) ได้ |
| 2 | เลือก checkbox payments ที่อยู่ใน batch จาก gateway | กด **Settle batch** | เปิด SettleDialog |
| 3 | ระบุ `gateway_settlement_id` (จากรายงานของ gateway) + `fee_amount` รวม + `settled_at` | กดยืนยัน | ระบบ: ① mark payments เป็น `SETTLED` + กระจาย fee ตามสัดส่วน amount · ② audit `payment.settle` · ③ ✅ Emit `payment.settled` ต่อ payment |
| 4 | *(behind the scenes)* | Worker `payment-settled.handler.ts` รับ event → append CSV row ที่ `storage/accounting/{tenant}/{branch}/settlement.csv` | ใช้สำหรับ import เข้า Accounting system (Express/AccPay/Flowaccount) ภายหลัง |

### E4 — Inventory Reconcile (MANAGER เท่านั้น)

Manager เดินไปนับสต็อกจริงในห้อง stockroom แล้วกรอกเทียบกับระบบ.

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 1 | `/manager/eod` → tab **Inventory Recon** | เห็นรายการ products ทั้งหมดที่ `trackStock=true` พร้อม `system_qty` (ดึงจาก StockLedger.balanceAfter ล่าสุด) | filter หาเฉพาะ category ได้ |
| 2 | กรอก `counted_qty` ของแต่ละ SKU | ระบบโชว์ variance = counted − system แบบ realtime | row ที่มี variance ≠ 0 จะ highlight สีส้ม |
| 3 | ถ้ามี variance ≠ 0 อย่างน้อย 1 รายการ | ระบบบังคับให้แนบ **Break-Glass override id** | ป้องกัน adjust สต็อกแบบไม่มี audit trail |
| 4 | ขอ override จาก ADMIN/MANAGER อีกคน → `/break-glass` → Approve | ได้ override id (เช่น `bg_xxx`) | ไปแปะใน ReconcilePanel |
| 5 | กด **Submit reconciliation** | ระบบ: ① สร้าง `StockReconciliation` row ทุก SKU · ② สร้าง `StockLedger.ADJUSTMENT` (qty=variance, balanceAfter=counted) สำหรับ SKU ที่มี variance · ③ audit `inventory.reconcile` · ④ ✅ Emit `inventory.reconciled` 1 event ต่อ batch |
| 6 | *(behind the scenes)* | Worker `inventory-reconciled.handler.ts` รับ event → ถ้ามี variance ติดลบ (สูญหาย) จะ enqueue `NotificationLog` แจ้ง MANAGER + audit aggregation | สำหรับ MANAGER ติดตามต่อ |
| 7 | KPI การ์ดบนสุด | จำนวน "Reconciles today" + "Items with variance" จะอัปเดต | ดูแนวโน้ม shrinkage |

---

## 🎬 Scenario F — Patient App (LIFF/PWA) — Phase 7

ลูกค้าใช้แอปบนมือถือ ผ่าน LINE LIFF (หรือ standalone PWA). อยู่ที่ port `:3004`.

### F1 — เปิดแอปครั้งแรก + เข้าสู่ระบบ

1. เปิด `http://localhost:3004/` บนมือถือ → ไม่มี session → redirect ไป `/login`
2. UI จะตรวจ `NEXT_PUBLIC_LIFF_ID` — ถ้ามี + อยู่ใน LINE → เรียก `liff.getProfile()` อัตโนมัติแล้วเข้าระบบเลย
3. **ถ้าทดสอบใน Browser ปกติ (mock mode)** → กรอก:
   - **รหัสคลินิก**: `legacyx`
   - **LINE User ID**: `U_demo_line_0000001` (seed มาให้กับ Demo Patient — HN-0000001)
4. กด **เข้าสู่ระบบ** → API `POST /api/v1/patient/auth` → ตรวจ Patient ตาม `lineUserId` → ออก JWT 14 วัน → เก็บใน cookie `lx_patient_session`

### F2 — Home tab

| ส่วน | เนื้อหา |
|---|---|
| Greeting card | ชื่อ + HN + greeting ตามเวลา (เช้า/บ่าย/เย็น) |
| Quick actions | จองคิวใหม่ · ดูประวัติ · คอร์สของฉัน |
| Aftercare CTA | ปรากฏถ้ามี procedure สำเร็จในช่วง 14 วัน (heuristic: <=1 วัน = อ่านคู่มือ, 3-5 วัน = ให้คะแนน, >5 วัน = จองใหม่) |
| Wallet summary | คอร์สที่ใช้ได้ (top 3) + ยอดคงเหลือ |

### F3 — Book tab — Self-service booking

1. เลือก **สาขา** (Sukhumvit/Thonglor)
2. เลือก **วัน** จาก strip 14 วันข้างหน้า
3. UI ดึง slots ผ่าน `GET /api/v1/patient/slots?branch_id=&date=` → API gen 30-min slots 09:00-17:00 และ filter slot ที่ถูกจองไปแล้ว
4. เลือก **เวลา**
5. (option) กรอก **เหตุผล**
6. กด **ยืนยันการจอง** → `POST /api/v1/patient/appointments` (channel=`LIFF`) → ✅ Emit `appointment.created` · audit `actor.type=PATIENT`
7. หน้า success → กลับ Home

### F4 — Visits tab — ประวัติ

- ดึงผ่าน `GET /api/v1/patient/visits?page=1&perPage=20`
- แสดง list ของ visit ทั้งหมด พร้อมสถานะ (COMPLETED/IN_PROGRESS/OPEN/CANCELLED), บริการ + ราคา, เลขที่ใบเสร็จ
- กด **ดูใบเสร็จ** → ไปหน้า `/visits/{id}/receipt` → ดึง `GET /api/v1/patient/visits/{id}/receipt` → ถ้ามี E_RECEIPT document → แสดงปุ่ม download

### F5 — Courses tab — Wallet balance

- ดึงผ่าน `GET /api/v1/patient/wallets` → list `WalletAccount` ทั้งหมด
- การ์ดสวย ๆ ต่อคอร์ส: ชื่อสินค้า + balance ตัวใหญ่ + วันหมดอายุ (badge สีเหลือง/แดงถ้าใกล้/หมดอายุ)
- Ledger 6 รายการล่าสุด พร้อมเครื่องหมาย +/- (เขียว/แดง)

### F6 — Profile tab

- ดึงผ่าน `GET /api/v1/patient/me` (decrypt phone/email/nickname)
- แสดง avatar (initials), HN, สถานะ LINE link, เพศ, วันเกิด, เบอร์, อีเมล, กรุปเลือด, ภูมิแพ้, สาขาประจำ
- ปุ่ม **Sign out** → ลบ cookie → redirect `/login`

### F7 — Cross-app verification

หลังลูกค้าจองผ่านแอปแล้ว ทดสอบที่ฝั่ง staff:

1. Backoffice → `0800000005` (RECEPTION) → `/appointments` → เห็นนัดใหม่ ✅ status BOOKED, **channel=LIFF**
2. `/audit` → กรอง `action=appointment.create` → เห็น record ที่มี `actor: PATIENT/{patient_id}` ✅

---

## 🎬 Scenario G — Notification + CRM Cron (Phase 8)

ระบบ trigger การส่ง LINE/SMS/อีเมล อัตโนมัติ ผ่าน worker engine. ใน demo เราใช้ `console` provider ที่เขียน log ลง `storage/notifications/{channel}.log` แทนการส่งจริง.

### G1 — Real-time notification จาก event

1. ลูกค้าจองคิวผ่าน Patient App (Scenario F3) → ✅ Emit `appointment.created`
2. Worker handler `appointment-created.reserve+notify` → insert `NotificationLog` row (templateCode `appointment.confirmed`, status `PENDING`)
3. Dispatcher tick (default 5s) → ดึง row → resolve recipient (LINE userId ของ Patient) → render template TH → ส่งผ่าน provider
4. Demo: เปิด `storage/notifications/line.log` → เห็น JSON line ที่บันทึกข้อความ "ขอบคุณที่จองคิวกับ LegacyX Clinic..."
5. ที่ Backoffice → `0800000002` (MANAGER) → `/admin/notifications` → เห็นการ์ด KPI (PENDING/SENT/FAILED) + row นี้กับสถานะ `SENT`

### G2 — Manager alerts (Phase 6.8 + Phase 8 integration)

ทุกครั้งที่ปิดกะที่มี variance สูง / reconcile แล้วมี shrinkage:

1. Handler `shift-closed.audit+alert` หรือ `inventory-reconciled.audit+alert` → enqueue `NotificationLog` (channel=EMAIL, recipientRef=`manager`)
2. Dispatcher resolve `manager` → หา ACTIVE user ใน role `MANAGER` ของ tenant นั้น → ใช้ **เบอร์โทร** ของคนแรกเป็น `ref` (ไม่มี User.email แล้ว — phone ใช้ได้ทุก channel; console provider แค่ log)
3. ส่งผ่าน console provider → log ลง `storage/notifications/email.log`
4. Manager เปิด `/admin/notifications` → filter channel=EMAIL → เห็นรายการเตือนทั้งหมด

### G3 — CRM Cron jobs (automatic, 1 hour tick)

Worker `worker-engine` มี CRM cron แยกที่ tick ทุก 1 ชั่วโมง (configurable via `CRM_CRON_TICK_MS`). มี 4 jobs:

| Job | เงื่อนไข | Template | De-dup window |
|---|---|---|---|
| **review.request** | Visit completed 3 วันที่แล้ว (window 24h) | `review.request` | 30 วัน |
| **rebooking.reminder** | Visit completed 30 วันที่แล้ว + ไม่มี upcoming appointment | `rebooking.reminder` | 30 วัน |
| **wallet.expiring** | WalletAccount balance>0 + expiresAt อยู่ใน 14 วันข้างหน้า | `wallet.expiring` | 14 วัน |
| **birthday.bonus** | dob.MM-DD = วันนี้ | `birthday.bonus` | 300 วัน (กันส่งซ้ำในปีเดียวกัน) |

ทุก job จะ check ใน DB ก่อนว่าเคย enqueue ไปแล้วใน window หรือไม่ — ทำให้ idempotent โดยไม่ต้องใช้ external scheduler.

### G4 — Real provider mode (production)

สลับจาก console → ของจริง โดยตั้ง env:

```bash
NOTIFICATION_LINE_PROVIDER=line-messaging-api
LINE_CHANNEL_ACCESS_TOKEN=<from LINE Developers Console>

NOTIFICATION_SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+1...

NOTIFICATION_EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG....
EMAIL_FROM=no-reply@yourdomain.example
```

ระบบจะใช้ provider จริงทันที — ไม่ต้องเปลี่ยน code.

---

## 🎬 Scenario H — Admin Setup (one-off)

**Login**: `0800000001` (ADMIN)

> ⚠️ ADMIN เห็นเฉพาะกลุ่ม **System Admin** — ไม่มี Operations/Clinical. ถ้า admin อยากดูภาพรวมงานคลินิก ให้สลับ login เป็น role อื่น

1. `/admin/users` — สร้าง user ใหม่, reset password, มอบ role
2. `/admin/roles` — ดู matrix ของ role/permission (อ่านอย่างเดียว)
3. `/admin/resources` — เพิ่ม/แก้ไข/Retire ห้องเครื่องมือ (CRUD พร้อม edit/delete · ไม่มี Release)
4. `/dlq` — ดู Dead-letter queue ของ event ที่ล้มเหลว
5. `/settings` — ตั้งค่าระบบทั่วไป

---

## 🎬 Scenario I — Observability + Prod (Phase 9)

ตรวจสุขภาพระบบและสำรวจ metrics ที่ Prometheus ใช้

### I1. Healthchecks (no auth)

```bash
curl http://localhost:3001/api/healthz
# → {"status":"ok","uptime":42.3}

curl http://localhost:3001/api/readyz
# → {"status":"ready","db":"ok"}
```

Worker engine (จะต้องเปิด `METRICS_PORT=9464` ใน `.env`):

```bash
curl http://localhost:9464/healthz   # → ok + uptime
curl http://localhost:9464/readyz    # → ready + db probe
```

### I2. Prometheus metrics scrape

api-server protected by Bearer token (`METRICS_BEARER_TOKEN`):

```bash
curl -H "Authorization: Bearer dev-metrics-token" http://localhost:3001/api/metrics
```

ดู metric ที่สำคัญ:

- `legacyx_http_requests_total{route,method,status}` — request rate per route
- `legacyx_http_request_duration_seconds_bucket` — latency histogram

Worker engine:

```bash
curl http://localhost:9464/metrics
```

- `legacyx_worker_handler_runs_total{event_name,handler,outcome}` — handler attempts
- `legacyx_worker_handler_duration_seconds` — handler latency
- `legacyx_worker_queue_depth` — BullMQ events queue depth
- `legacyx_worker_outbox_pending` — outbox lag
- `legacyx_worker_dlq_depth` — DLQ size (alert if > 10 sustained)
- `legacyx_worker_notifications_sent_total{channel,status}`
- `legacyx_worker_cron_runs_total{job,outcome}`

### I3. Build production images

```bash
cp .env.prod.example .env.prod   # ⚠️ fill in real secrets first
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod build
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod up -d
```

ทั้ง 5 services จะ build แบบ multi-stage non-root + Next.js standalone (small image). ดู [`PRODUCTION_HARDENING.md`](./PRODUCTION_HARDENING.md) สำหรับ checklist ก่อน deploy จริง.

### I4. CI pipeline

PR ขึ้น GitHub → `.github/workflows/ci.yml` รัน:

1. **lint-typecheck** (MySQL service, Prisma generate + db push → lint + typecheck)
2. **build** (Turbo build all apps + packages)
3. **docker** (Buildx matrix สำหรับ 5 services — เฉพาะ push to main / tags)

---

## 🔄 Event Flow Summary

```
RECEPTION                DOCTOR              NURSE          PHARMACIST    MANAGER
    │                       │                  │                │            │
shift.opened (cash drawer)  │                  │                │            │
    │                       │                  │                │            │
appointment.created         │                  │                │            │
    │                       │                  │                │            │
visit.checked_in ──────→ (ห้องถูกล็อก)         │                │            │
    │                  emr.signed               │                │            │
    │                  order.created  ─────→ procedure.started   │            │
    │                       │              procedure.completed   │            │
    │                       │              inventory.adjusted (BOM auto)      │
    │                       │              (Pharmacy queue) ───→ pharmacy.dispensed  │
invoice.created             │                  │                │            │
payment.completed ──────→ document.requested → document.generated (PDF)      │
invoice.paid                │                  │                │     audit.read
visit.completed ──────→ (ห้อง auto-release)    │                │     manager dashboard
    │                       │                  │                │            │
    │  ─────────── End of day ─────────────────────────────────→             │
shift.closed (cash count + variance)                            │            │
                                                  payment.settled (gateway batch) ──→ Accounting CSV export
                                                          inventory.reconciled (variance + override) ──→ alert MANAGER
```

---

## 🐛 Troubleshooting

| ปัญหา | สาเหตุที่น่าจะเป็น | แก้อย่างไร |
|---|---|---|
| **เช็คอินแล้วไม่มีห้องให้เลือก** | ห้องที่ seed อยู่ครบไหม / สถานะ MAINTENANCE | `/admin/resources` ตรวจสถานะ + activate |
| **กด Complete procedure แล้ว stock ไม่ตัด** | Worker engine ตาย | เช็ค `worker-engine` process / `/dlq` ดู event ที่ค้าง |
| **403 Forbidden ตอนกดอะไรสักอย่าง** | Role ไม่มีสิทธิ์ทำ action นั้น | ดู [`ROLES.md`](./ROLES.md) แล้ว login เป็น role ที่เหมาะสม |
| **Login error "Invalid Server Actions request"** | Origin mismatch จาก browser preview proxy | hard refresh (`Ctrl+Shift+R`) หรือเปิด `localhost:3003` ตรง ๆ |
| **Cookie ไม่มี roles หลัง login** | api-server ตายตอน auth.service.ts update | restart api-server แล้ว logout+login ใหม่ |
| **กด Reverse stock แล้ว 409** | row นั้นเป็น REVERSAL หรือถูก reverse ไปแล้ว | reverse row อื่น |
| **Delete ห้องไม่ได้** | มี active reservation อยู่ | release reservation ก่อน หรือรอ visit จบ |

---

## 🛠️ Quick Setup Checklist

ถ้าเริ่มจาก clone fresh:

```bash
# 1. Install deps
pnpm install

# 2. Database
docker compose up -d mysql redis
pnpm --filter @legacyx/db generate
pnpm --filter @legacyx/db migrate
pnpm --filter @legacyx/db seed   # ⬅️ ทุกครั้งที่ schema เปลี่ยน

# 3. Run all services (ใน 5 terminal คนละ tab)
pnpm --filter @legacyx/api-server dev      # :3001
pnpm --filter @legacyx/ai-service dev      # :3002
pnpm --filter @legacyx/worker-engine dev   # no port
pnpm --filter @legacyx/backoffice-web dev  # :3003 — staff backoffice
pnpm --filter @legacyx/patient-app dev     # :3004 — LIFF/PWA patient app

# 4. Open http://localhost:3003 → login as any demo user (staff)
# 5. Open http://localhost:3004 → login as Demo Patient (lineUserId U_demo_line_0000001)
```

---

## 📚 ดูเพิ่ม

- [`ROLES.md`](./ROLES.md) — สิทธิ์ละเอียดของแต่ละ role + menu mapping
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system overview, event dictionary
- [`PROGRESS.md`](./PROGRESS.md) — สถานะ phase ที่ทำเสร็จ/รอ
