# Catalog Reference — Products, BOMs, Services

This page is the operator-facing reference for everything that lives under
**Manager → Catalog** (`/manager/catalog`). It explains the three intertwined
concepts that drive automatic stock deduction, low-stock alerts, and the
patient-facing booking experience.

---

## 1. Product

A `Product` is anything you stock or sell at the clinic — a vial of botox,
a box of paracetamol, a single-use needle, or a package course like "Botox Full
Face × 4 sessions".

| Field         | Meaning                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `sku`         | Internal stock code, e.g. `BTX-100U`, `MED-PARA`, `COURSE-BTX-4`                                  |
| `name`        | Display name shown to staff and on receipts                                                       |
| `category`    | `MEDICATION` / `SUPPLY` / `COSMETIC` / `COURSE`                                                   |
| `unit`        | `vial`, `pcs`, `box`, `pack`, `session` …                                                         |
| `trackStock`  | If `true`, system maintains `StockLedger` rows + low-stock alerts                                 |
| `reorderLevel`| **Reorder point** — see § 1.1                                                                     |
| `attributes`  | Extra JSON: `price`, `procedureCode` (for COURSE), `sessions`, etc.                               |

### 1.1 Reorder point (จุดสั่งซื้อ)

`reorderLevel` is the stock threshold that triggers a low-stock alert.

* When `Product.balance ≤ Product.reorderLevel`, the **Manager dashboard** shows
  the SKU under **Items to reorder** and the `inventory.below_reorder` worker
  emits an alert (`alert.created`).
* Recommended setting: ~7–14 days of typical usage. For a 30 ml/day item,
  set ~150–300 ml.
* `reorderLevel = 0` disables the alert for that SKU (used for products that
  are never reordered, e.g. cosmetics with custom procurement).

> **Tip:** If you change a SKU's reorder point, the recompute is lazy — the
> alert only fires after the *next* stock movement against that SKU.

### 1.2 Stock ledger

Every change to `Product.balance` writes one row in `StockLedger`:

| Kind            | Source                                  | Sign   |
| --------------- | --------------------------------------- | ------ |
| `RECEIVE`       | Manager receives shipment               | `+`    |
| `BOM_USAGE`     | Procedure completed → BOM auto-deduct   | `−`    |
| `PHARMACY_DISPENSE` | Pharmacist dispenses MEDICATION row | `−`    |
| `MANUAL_ADJUST` | Manager + reason (audit-logged)         | `±`    |
| `RECONCILE`     | Manager EOD inventory count             | `±`    |
| `REVERSAL`      | Reverses any prior row                  | inverse|

The `balanceAfter` column on each row is the SoT — never recompute from sum.

---

## 2. BOM — Bill of Materials (สูตรตัดสต็อก)

A **BOM** is the recipe of supplies a procedure consumes. It binds a
`procedureCode` (the staff-side procedure registry) to a list of products with
quantities.

```
PROC_BTX_FACE   ─►   BTX-100U      0.5 vial
                    NEEDLE-30G    4 pcs
                    GAUZE-PK      1 pack
                    ALCOHOL-PAD   2 pcs
```

When a NURSE marks the procedure as **Complete** in `/visits/<id>`, the
`procedure-completed.consume-bom` worker:

1. Reads the **active BOM version** for the procedure (immutable history).
2. Deducts each item's `qty` from stock atomically (one transaction).
3. Writes 1 × `StockLedger { kind=BOM_USAGE }` per item.
4. Emits 1 × `inventory.adjusted` event per item.

### 2.1 Versioning

* Each BOM edit creates a **new version** (`BomVersion.version` increments).
* Old visits keep referencing the version that was *active at the time the
  procedure was completed* — historical accuracy is preserved.
* Only one version per `(tenant, procedureCode)` can be `isActive=true` at a
  time. Saving a new version automatically deactivates the previous one.

### 2.2 Editing a BOM

`/manager/catalog → Tab "BOMs"` → click **Edit BOM** on any procedure.

* The dialog shows a row per current item; add/remove freely.
* Saving with no items deactivates the BOM (procedures will then *not* deduct
  stock).
* Permission: `catalog:manage` (MANAGER + ADMIN only).

### 2.3 Seeded sample BOMs

The seed script populates these (under tenant `acme`):

| `procedureCode`      | Items                                                   |
| -------------------- | ------------------------------------------------------- |
| `PROC_BTX_FACE`      | BTX-100U 0.5 / NEEDLE-30G 4 / GAUZE-PK 1 / ALCOHOL-PAD 2|
| `PROC_BTX_FOREHEAD`  | BTX-100U 0.25 / NEEDLE-30G 2 / GAUZE-PK 1               |
| `PROC_FILLER_CHEEK`  | FILLER-1ML 1 / NEEDLE-25G 2 / NUMB-CREAM 1              |
| `PROC_LASER_HAIR`    | LASER-COOL-GEL 1 / GAUZE-PK 1                           |
| `PROC_FACIAL_BASIC`  | FACIAL-SERUM 1 / GAUZE-PK 2 / COTTON-PAD 4              |
| `PROC_VITAMIN_IV`    | IV-VITAMIN-MIX 1 / IV-LINE 1 / NEEDLE-25G 1             |
| `PROC_CONSULT`       | (no items — consult-only, doesn't deduct stock)         |

### 2.4 Edge cases

* **Insufficient stock:** the worker still completes the procedure but writes a
  `stock.shortage` warning and a manager alert (visible at `/manager`).
* **Course-funded procedure:** wallet is decremented in addition to BOM.
* **Reverting a procedure:** call `procedure.cancel` *before* completion. After
  completion, the BOM deductions are immutable (use `MANUAL_ADJUST` to correct).

---

## 3. Service catalog (patient-facing)

Distinct from the staff-side `Product` table, the `Service` catalog is what the
patient app shows during guest booking:

```
ServiceCategory   (Dental / Beauty & Spa / Wellness)
   └─ Service     (Dental Checkup / Botox Face / Vitamin IV Drip ...)
        ├─ priceFrom / priceTo  — range, e.g. 1,200–1,500 ฿
        ├─ durationMin
        └─ procedureCode        — links back to staff-side BOM
```

When a guest books `SVC_BOTOX_FACE`, the booking arrow goes:

```
Service.code = SVC_BOTOX_FACE
        │
        ▼
Service.procedureCode = PROC_BTX_FACE
        │  (same code that staff use in /visits)
        ▼
order.created → procedure.completed → BOM auto-consume
```

So a patient-app booking eventually decrements the same stock as a walk-in
booking — there's a single source of truth.

### 3.1 Adding new services

`/manager/services` (MANAGER) → **Categories → Services**.

Required fields:
* `code` — UPPERCASE, e.g. `SVC_HYDRAFACIAL`
* `name` (English) + `nameTh`
* `categoryId`
* `procedureCode` (optional but recommended — without it, the service is
  consultation-only and won't deduct stock when booked)
* `durationMin` — used by the appointment slot picker

### 3.2 Pricing display

* Both `priceFrom` and `priceTo` `null` → show `สอบถามราคา` (image 2 in spec).
* `priceFrom == priceTo` → show fixed price.
* Otherwise → range, e.g. `1,200 – 1,500 ฿`.

---

## 4. Cheat-sheet for common operations

| Task                                                | Where                                 |
| --------------------------------------------------- | ------------------------------------- |
| Add a new SKU + set reorder point                   | `/manager/catalog` → New product      |
| Receive stock (shipment in)                         | `/inventory/<sku>` → Receive          |
| Edit BOM for a procedure                            | `/manager/catalog` → BOMs → Edit      |
| Reconcile end-of-day inventory variance             | `/manager/eod` → Inventory Recon tab  |
| Add a new patient-facing service                    | `/manager/services`                     |
| Disable a service (out-of-season etc.)              | `/manager/services` → toggle `active`   |

---

## 5. Glossary (TH ⇄ EN)

| ไทย                  | English             | คำอธิบายสั้น                       |
| -------------------- | ------------------- | ---------------------------------- |
| สูตรตัดสต็อก         | BOM                 | ของที่หัตถการกินเมื่อทำเสร็จ        |
| จุดสั่งซื้อ          | Reorder point       | ยอดที่ระบบเริ่มเตือนของใกล้หมด     |
| สต็อกคงเหลือ         | Stock balance       | ยอดล่าสุดบน `StockLedger.balanceAfter` |
| รหัสหัตถการ          | Procedure code      | `PROC_BTX_FACE` ฯลฯ — ใช้ภายใน     |
| รหัสบริการ           | Service code        | `SVC_BOTOX_FACE` ฯลฯ — ใช้ฝั่งผู้ป่วย |
| คอร์ส (วอลเล็ต)      | Course / wallet     | ซื้อล่วงหน้าหลายเซสชัน             |
