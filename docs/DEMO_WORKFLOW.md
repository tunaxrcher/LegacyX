# 🚶 LegacyX — End-to-End Demo Workflow

> สำหรับทดสอบระบบครบ flow ตั้งแต่ลูกค้าจองคิว จนได้ใบเสร็จและตัดสต็อกเสร็จ.
> อ่านควบคู่ [`ROLES.md`](./ROLES.md) (สิทธิ์แต่ละ role) และ
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6 (Event Flow).

## 🪪 Demo Credentials
| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@legacyx.local` | `admin123!` |
| MANAGER | `manager@legacyx.local` | `manager123!` |
| DOCTOR | `doctor@legacyx.local` | `doctor123!` |
| NURSE | `nurse@legacyx.local` | `nurse123!` |
| RECEPTION | `reception@legacyx.local` | `reception123!` |
| PHARMACIST | `pharmacist@legacyx.local` | `pharmacist123!` |

**Tenant**: `legacyx` · **Branches**: `br_01` (Sukhumvit) · `br_02` (Thonglor)

---

## 🎬 Scenario A — หัตถการ Botox ครบวงจร

ลูกค้า **HN-0000001 (Demo Patient)** มาทำ Botox Face (PROC_BTX_FACE) ราคา 5,000 บาท ที่สาขา Thonglor

### 1️⃣ RECEPTION — รับจอง

**Login**: `reception@legacyx.local`

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

**Logout** → **Login**: `nurse@legacyx.local`

> ⚠️ **DOCTOR** เท่านั้นที่สั่ง order ได้ (NURSE มี `procedure:perform` แต่ไม่มี `order:write`).
> ถ้าคลินิกมีคน DOCTOR คนเดียวที่ใช้บัญชี doctor login เอง ใช้ `doctor@legacyx.local`.

**Logout** → **Login**: `doctor@legacyx.local`

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 3.1 | `/visits` | คลิก visit ของ Demo Patient | เปิดหน้า visit detail |
| 3.2 | ปุ่ม **+ New Order** | Type=PROCEDURE · ref=`PROC_BTX_FACE` · description="Botox face" · qty=1 · unit_price=5000 | ✅ Emit `order.created` · Order สถานะ `CREATED` |
| 3.3 | (option) `/ai-drafts` | ตรวจ AI draft ของ EMR (ถ้ามี) · กดอนุมัติ | ✅ Emit `ai.draft.approved` |
| 3.4 | `/emr/sign` | เซ็น EMR ของ visit นี้ | ✅ Emit `emr.signed` (ABAC scope=`self` — แพทย์เซ็นได้เฉพาะของตัวเอง) |

### 4️⃣ NURSE — เริ่มและจบหัตถการ

**Logout** → **Login**: `nurse@legacyx.local`

| # | ที่ | กดอะไร | เกิดอะไร |
|---|---|---|---|
| 4.1 | `/visits/<id>` | บนแถว Procedure → ปุ่ม **Start** | ✅ Emit `procedure.started` |
| 4.2 | บนแถว Procedure → ปุ่ม **Complete** | ตัด BOM อัตโนมัติ → worker engine ดึง event | ✅ Emit `procedure.completed` |
| 4.3 | *(behind the scenes)* | Worker handler: ตัด BTX-100U 0.5 vial, NEEDLE-30G 4 pcs, GAUZE-PK 1 pack | ✅ Emit `inventory.adjusted` × 3 |
| 4.4 | `/inventory/<product_id>` | ดู stock ledger ของ BTX-100U | เห็น `BOM_USAGE` row qty -0.5 |

### 5️⃣ RECEPTION — รับเงิน + ออกใบเสร็จ

**Logout** → **Login**: `reception@legacyx.local`

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
**Login**: `doctor@legacyx.local` → `/visits/<id>` → **+ New Order** · type=MEDICATION · refId=`<product_id ของยา>` · qty=1

### 2️⃣ PHARMACIST — จ่ายยา
**Logout** → **Login**: `pharmacist@legacyx.local`

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

**Login**: `manager@legacyx.local`

1. `/manager` → ดู Strategic Dashboard:
   - **รายได้วันนี้** + delta vs เมื่อวาน
   - **รายได้ MTD**
   - **เคสวันนี้**
   - **สินค้าใกล้หมด** (highlight ถ้ามี)
   - Bar chart 7 วัน + เปรียบเทียบสาขา
2. `/audit` → กรอง `action=payment.completed` → ดูใบเสร็จที่เพิ่งออก
3. `/break-glass` → ถ้ามี junior staff ขอ override (เช่น แก้ EMR ปิดไปแล้ว) → กด **Approve Override**

---

## 🎬 Scenario E — Admin Setup (one-off)

**Login**: `admin@legacyx.local`

> ⚠️ ADMIN เห็นเฉพาะกลุ่ม **System Admin** — ไม่มี Operations/Clinical. ถ้า admin อยากดูภาพรวมงานคลินิก ให้สลับ login เป็น role อื่น

1. `/admin/users` — สร้าง user ใหม่, reset password, มอบ role
2. `/admin/roles` — ดู matrix ของ role/permission (อ่านอย่างเดียว)
3. `/admin/resources` — เพิ่ม/แก้ไข/Retire ห้องเครื่องมือ (CRUD พร้อม edit/delete · ไม่มี Release)
4. `/dlq` — ดู Dead-letter queue ของ event ที่ล้มเหลว
5. `/settings` — ตั้งค่าระบบทั่วไป

---

## 🔄 Event Flow Summary

```
RECEPTION                DOCTOR              NURSE          PHARMACIST    MANAGER
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

# 3. Run all services (ใน 3 terminal คนละ tab)
pnpm --filter @legacyx/api-server dev      # :3001
pnpm --filter @legacyx/ai-service dev      # :3002
pnpm --filter @legacyx/worker-engine dev   # no port
pnpm --filter @legacyx/backoffice-web dev  # :3003

# 4. Open http://localhost:3003 → login as any demo user
```

---

## 📚 ดูเพิ่ม

- [`ROLES.md`](./ROLES.md) — สิทธิ์ละเอียดของแต่ละ role + menu mapping
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system overview, event dictionary
- [`PROGRESS.md`](./PROGRESS.md) — สถานะ phase ที่ทำเสร็จ/รอ
