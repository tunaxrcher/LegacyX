# 👥 LegacyX — Roles & Permissions Guide

> ใช้คู่กับ [`ARCHITECTURE.md`](./ARCHITECTURE.md) §1 (Personas) และ §6 (User Journey).
> Source of truth สำหรับ matrix นี้คือ `packages/db/prisma/seed.ts` (PERMISSIONS + ROLE_MATRIX).

ระบบใช้ **RBAC + ABAC**:
- **RBAC** = แต่ละ user ผูกกับ Role (อาจหลาย role); แต่ละ Role ผูกกับ Permission set
- **ABAC scope** = `tenant` (ทั้งองค์กร) / `branch` (เฉพาะสาขาที่มีสิทธิ์ผ่าน `UserBranchAccess`) / `self` (เฉพาะข้อมูลของตน เช่น แพทย์เซ็น EMR ของตัวเอง)

---

## 🪪 Demo Credentials (seeded)

ทุก user มี access ทั้ง 2 สาขา (`br_01` Sukhumvit, `br_02` Thonglor) และ tenant `legacyx`.

| Email | Password | Role | จุดประสงค์ |
|---|---|---|---|
| `admin@legacyx.local` | `admin123!` | **ADMIN** | ผู้ดูแลระบบ — ทำได้ทุกอย่าง |
| `manager@legacyx.local` | `manager123!` | **MANAGER** | ผู้จัดการสาขา — กำกับการเงิน, audit, override |
| `doctor@legacyx.local` | `doctor123!` | **DOCTOR** | แพทย์ — บันทึก EMR + สั่งหัตถการ |
| `nurse@legacyx.local` | `nurse123!` | **NURSE** | พยาบาล/ผู้ช่วย — กดทำหัตถการ |
| `reception@legacyx.local` | `reception123!` | **RECEPTION** | พนักงานต้อนรับ — รับลูกค้า + รับเงิน |
| `pharmacist@legacyx.local` | `pharmacist123!` | **PHARMACIST** | เภสัชกร — จ่ายยา + ตัดสต็อก |

---

## 🔐 Permission Matrix

27 permissions จัดกลุ่มตาม resource:

| Resource | Action | Scope | ADMIN | MANAGER | DOCTOR | NURSE | RECEPTION | PHARMACIST |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **user** | read | tenant | ✅ | ✅ | | | | |
| **user** | write | tenant | ✅ | | | | | |
| **patient** | read | branch | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **patient** | write | branch | ✅ | | ✅ | | ✅ | |
| **patient** | merge | tenant | ✅ | | | | | |
| **emr** | read | branch | ✅ | | ✅ | ✅ | | |
| **emr** | write | branch | ✅ | | ✅ | | | |
| **emr** | sign | self | ✅ | | ✅ | | | |
| **appointment** | read | branch | ✅ | ✅ | ✅ | ✅ | ✅ | |
| **appointment** | write | branch | ✅ | ✅ | | | ✅ | |
| **order** | write | branch | ✅ | | ✅ | | | |
| **procedure** | perform | branch | ✅ | | ✅ | ✅ | | |
| **payment** | write | branch | ✅ | ✅ | | | ✅ | |
| **payment** | void | tenant | ✅ | ✅ | | | | |
| **invoice** | void | tenant | ✅ | ✅ | | | | |
| **wallet** | read | branch | ✅ | ✅ | | | | |
| **inventory** | read | branch | ✅ | ✅ | | ✅ | | ✅ |
| **inventory** | write | branch | ✅ | | | | | ✅ |
| **inventory** | reconcile | branch | ✅ | ✅ | | | | |
| **resource** | read | branch | ✅ | ✅ | | ✅ | ✅ | |
| **resource** | write | branch | ✅ | ✅ | | | | |
| **resource** | release | branch | ✅ | ✅ | | ✅ | ✅ | |
| **resource** | maintain | branch | ✅ | ✅ | | | | |
| **pharmacy** | dispense | branch | ✅ | | | | | ✅ |
| **catalog** | manage | tenant | ✅ | ✅ | | | | |
| **audit** | read | tenant | ✅ | ✅ | | | | |
| **break_glass** | approve | tenant | ✅ | ✅ | | | | |

---

## 🖥️ เมนูที่เห็นในแต่ละ Role

Sidebar กรองตาม role ที่ `apps/backoffice-web/src/components/app-shell/sidebar.tsx` แบ่งเป็น 5 groups
*(API ยังตรวจ ABAC อยู่ — sidebar เป็นแค่ UX)*

> 🛡️ **Design rule**: **ADMIN เห็นเฉพาะ System Admin group** (separation of
> duties — admin = sysadmin ตั้งค่าระบบ ไม่ดำเนินงานรายวัน). ถ้า admin ต้องการ
> ทดสอบ flow ของ role อื่น ให้ login เป็น role นั้นโดยตรง หรือ assign user หลาย
> role ผ่าน `/admin/users`.

### 🟢 Operations (รายวัน)
| Page / URL | ADMIN | MANAGER | DOCTOR | NURSE | RECEPTION | PHARMACIST |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `/` Dashboard | | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/appointments` | | ✅ | ✅ | ✅ | ✅ | |
| `/visits` | | ✅ | ✅ | ✅ | ✅ | |
| `/patients` | | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/resources` Rooms | | ✅ | | ✅ | ✅ | |

### 🩺 Clinical
| Page / URL | ADMIN | MANAGER | DOCTOR | NURSE | RECEPTION | PHARMACIST |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `/ai-drafts` | | ✅ | ✅ | | | |
| `/emr/sign` | | | ✅ | | | |
| `/pharmacy` | | | | | | ✅ |

### 📦 Stock
| Page / URL | ADMIN | MANAGER | DOCTOR | NURSE | RECEPTION | PHARMACIST |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `/inventory` | | ✅ | | ✅ | | ✅ |

### 📊 Finance & Insights
| Page / URL | ADMIN | MANAGER | DOCTOR | NURSE | RECEPTION | PHARMACIST |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `/manager` Strategic Dashboard | | ✅ | | | | |
| `/manager/catalog` Products + BOMs CRUD | ✅ | ✅ | | | | |
| `/audit` | | ✅ | | | | |
| `/break-glass` | | ✅ | | | | |

### ⚙️ System Admin (ADMIN-only universe)
| Page / URL | ADMIN | MANAGER | DOCTOR | NURSE | RECEPTION | PHARMACIST |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `/admin/users` Users | ✅ | | | | | |
| `/admin/roles` Roles & permissions | ✅ | | | | | |
| `/admin/resources` Rooms & resources setup | ✅ | | | | | |
| `/dlq` Dead-letter queue | ✅ | | | | | |
| `/settings` System settings | ✅ | | | | | |

> 🛋️ Note: **2 หน้าแยกสำหรับห้อง** —
> - `/resources` = card grid · งานรายวัน · Release / Maintenance · (MANAGER/NURSE/RECEPTION)
> - `/admin/resources` = ตารางแบบ CRUD · Create / Edit / Retire(soft-delete) · ไม่มี Release · (ADMIN)

---

## 🔁 Typical Workflows ต่อ Role

### 👤 RECEPTION — พนักงานต้อนรับ
ตามแผน ARCH §6 Phase 1, 3:
1. **รับลูกค้าใหม่** — `/patients` → กดสร้าง patient (มี `patient:write:branch`)
2. **จองคิว** — `/appointments` → New appointment
3. **เช็คอินเมื่อมาถึง** — เลือก appointment → Check-in → เลือกห้อง (`resource:read`/`resource:release`)
4. **รับเงิน** — เปิด visit → Billing → Create invoice → Take payment (`payment:write`)
5. *(ปลดล็อกห้องถ้าลูกค้ากลับแล้วลืม close visit)*

ทำไม่ได้: ดู EMR · เซ็น EMR · สั่งหัตถการ · ปรับ stock · void invoice (ต้อง Manager)

### 👨‍⚕️ DOCTOR — แพทย์
ตามแผน ARCH §6 Phase 2:
1. **ดูผู้ป่วยและประวัติ** — `/patients/{id}` → ดู visits/EMR (`emr:read`, `patient:read`)
2. **AI ช่วยร่าง EMR** — `/ai-drafts` → ตรวจร่างของ AI Orchestrator
3. **เซ็น EMR** — `/emr/sign` → ยืนยัน → emit `emr.signed` (`emr:sign:self` — ของตัวเองเท่านั้น)
4. **สั่งหัตถการ** — เปิด visit → New Order (`order:write`)
5. **เริ่ม/จบหัตถการ** — `procedure:perform` (Doctor หรือ Nurse ก็ได้)

ทำไม่ได้: ลงทะเบียนผู้ป่วยข้ามสาขา · รับเงิน · ดู audit · merge patient

### 👩‍⚕️ NURSE — พยาบาล/ผู้ช่วย
ตามแผน ARCH §6 Phase 4:
1. **ดู queue เคสที่ checked-in** — `/visits`
2. **กดเริ่มหัตถการ** — `procedure.started`
3. **กดเสร็จหัตถการ** — `procedure.completed` → worker auto-consume BOM ตัดสต็อกทันที (`inventory.adjusted`)
4. **ปลดล็อกห้องหลัง close visit** — `/resources` → Release
5. **ดูสต็อกคงเหลือ** — `/inventory` (อ่านอย่างเดียว)

ทำไม่ได้: เซ็น EMR · สั่งของใหม่ใน BOM · รับเงิน · ปรับสต็อกเอง

### 💊 PHARMACIST — เภสัชกร
ตามแผน ARCH §6 Phase 3 ห้องยา:
1. **ดู queue ใบสั่งยา** — `/pharmacy` (Order ที่มี MEDICATION lines)
2. **กดจ่ายยา** — ตัดสต็อก real-time + emit `pharmacy.dispensed`
3. **รับสต็อกเข้า / ปรับสต็อก** — `/inventory` (`inventory:write`)
4. **ดู ledger ของแต่ละสินค้า** — `/inventory/{productId}`

ทำไม่ได้: ดูนัด · เช็คอินผู้ป่วย · ดู EMR · ดู audit log

### 🧑‍💼 MANAGER — ผู้จัดการสาขา
ตามแผน ARCH §6 Phase 5, 6:
1. **ดูภาพรวมการเงิน** — `/visits` → ดูใบเสร็จ; void invoice/refund payment (`invoice:void:tenant`, `payment:void:tenant`)
2. **ดู audit trail** — `/audit` (`audit:read:tenant`)
3. **อนุมัติ Break-Glass override** — `/break-glass` (`break_glass:approve:tenant`)
4. **ปรับห้อง/maintenance** — `/resources`
5. **Reconcile inventory** — เปรียบเทียบ stock ระบบ vs จริง

ทำไม่ได้: เซ็น EMR (ต้องเป็นแพทย์เท่านั้น) · สร้าง user · merge patient

### 👑 ADMIN — ผู้ดูแลระบบ
1. **จัดการ user** — `/admin/users` → สร้าง/แก้ไข/reset password/assign role+branch
2. **ดู role-permission matrix** — `/admin/roles`
3. **ทุก feature ของทุก role**

---

## 🛡️ Security & ABAC Scope

| Scope | ความหมาย | ใช้กับ permission ไหน |
|---|---|---|
| `tenant` | ทำได้ทุกสาขาในองค์กร | `user:*`, `payment:void`, `audit:read`, `break_glass:approve`, `patient:merge` |
| `branch` | ทำได้เฉพาะสาขาใน `UserBranchAccess` | `patient:read/write`, `emr:read/write`, `inventory:*`, `resource:*`, `order:write`, `procedure:perform` |
| `self` | ทำได้เฉพาะ entity ที่ตัวเองเป็นเจ้าของ | `emr:sign:self` (แพทย์เซ็นเฉพาะ EMR ที่ตัวเองเขียน) |

**ABAC check** เกิดทุก mutation ที่ `apps/api-server/src/shared/auth.ts:authorize()`. คำขอที่ส่งไป API จะถูก reject ด้วย **403** ถ้า role ไม่มีสิทธิ์ + log เข้า `audit_logs` table.

**Break-Glass override**:
- ใช้เมื่อ junior staff ต้องทำงานเกินสิทธิ์ฉุกเฉิน (เช่น แก้ EMR ที่ปิดไปแล้ว)
- Manager เปิด `/break-glass` → Approve → สร้าง `BreakGlassOverride` row ที่ปกคลุม operation นั้น
- ทุก override ถูก audit + manager ต้องระบุเหตุผล ≥10 ตัวอักษร

---

## 🧪 วิธีเช็คว่า ABAC ทำงาน

1. Login เป็น `nurse@legacyx.local` (NURSE)
2. ลองเปิด `/audit` ผ่าน URL bar → API จะตอบ 403 (NURSE ไม่มี `audit:read:tenant`)
3. หรือลองสร้าง order → 403 (NURSE ไม่มี `order:write`)

Sidebar จะซ่อนเมนูพวกนี้อยู่แล้ว แต่ถ้า URL ตรงๆ ก็จะโดน API guard อยู่ดี

---

## 🔧 วิธีปรับ matrix

ตอนนี้ admin UI **อ่านอย่างเดียว** (Phase 6.7). ถ้าจะปรับ role-permission mapping:

1. แก้ `packages/db/prisma/seed.ts` ส่วน `ROLE_MATRIX`
2. เพิ่ม permission ใหม่ใน `PERMISSIONS` ถ้าจำเป็น
3. รัน `pnpm --filter @legacyx/db seed`

(Phase ในอนาคต: เพิ่ม UI สำหรับแก้ matrix ผ่านหน้า `/admin/roles` → ตอนนี้ยังเป็นแค่ viewer)

---

## 📚 References
- `packages/db/prisma/seed.ts` — ground truth ของ PERMISSIONS + ROLE_MATRIX
- `apps/api-server/src/shared/auth.ts` — `authorize()` ตรวจ ABAC ทุก request
- `apps/backoffice-web/src/components/app-shell/sidebar.tsx` — UI role filter
- `docs/ARCHITECTURE.md` §1 (Personas), §5.1 (Security & Identity), §6 (User Journey)
