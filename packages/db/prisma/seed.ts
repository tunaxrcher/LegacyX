/**
 * LegacyX — Initial seed
 * Creates: 1 Tenant, 2 Branches, system Roles + Permissions, 1 Admin user,
 *          a few Products, a sample Procedure BOM, and 1 demo Patient.
 *
 * Run: pnpm db:seed
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  createCipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
// Import from the package's own src so seed and runtime hash phones identically.
// If you ever see "login: phone not found" right after seeding, suspect this
// drift first.
import { normalizePhone, searchableHash } from "../src/identity";

const prisma = new PrismaClient();

// ----- helpers -----
// Format must match apps/api-server/src/shared/password.ts (scrypt$N$r$p$salt$hash)
function hashPassword(plain: string): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// Mirror of apps/api-server/src/shared/crypto.ts — keep in sync. Seed needs to
// write phoneEnc/emailEnc that the runtime can later decrypt via the same
// ENCRYPTION_MASTER_KEY. Algorithm: AES-256-GCM, "v1:" + base64(iv||tag||ct).
function encryptField(plaintext: string): string {
  const raw = process.env.ENCRYPTION_MASTER_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY not set — required to seed encrypted patient PII.",
    );
  }
  const key = createHash("sha256").update(raw).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v1:" + Buffer.concat([iv, tag, ct]).toString("base64");
}

const PERMISSIONS: { resource: string; action: string; scope: string }[] = [
  // Identity
  { resource: "user", action: "read", scope: "tenant" },
  { resource: "user", action: "write", scope: "tenant" },
  // Branch CRUD (ADMIN only — see ROLE_MATRIX). Read is implicit via the
  // session's branch list, so only the write permission is enforced.
  { resource: "branch", action: "write", scope: "tenant" },
  // Patient
  { resource: "patient", action: "read", scope: "branch" },
  { resource: "patient", action: "write", scope: "branch" },
  { resource: "patient", action: "merge", scope: "tenant" },
  // EMR
  { resource: "emr", action: "read", scope: "branch" },
  { resource: "emr", action: "write", scope: "branch" },
  { resource: "emr", action: "sign", scope: "self" },
  // Appointment
  { resource: "appointment", action: "read", scope: "branch" },
  { resource: "appointment", action: "write", scope: "branch" },
  // Order / Procedure
  { resource: "order", action: "read", scope: "branch" },
  { resource: "order", action: "write", scope: "branch" },
  { resource: "procedure", action: "perform", scope: "branch" },
  // Financial
  { resource: "payment", action: "read", scope: "branch" },
  { resource: "payment", action: "write", scope: "branch" },
  { resource: "payment", action: "void", scope: "tenant" },
  { resource: "payment", action: "settle", scope: "tenant" },
  { resource: "invoice", action: "void", scope: "tenant" },
  { resource: "wallet", action: "read", scope: "branch" },
  // Shift / End-of-Day
  { resource: "shift", action: "open", scope: "branch" },
  { resource: "shift", action: "close", scope: "branch" },
  { resource: "shift", action: "read", scope: "branch" },
  // Inventory
  { resource: "inventory", action: "read", scope: "branch" },
  { resource: "inventory", action: "write", scope: "branch" },
  { resource: "inventory", action: "reconcile", scope: "branch" },
  // Resource (rooms/machines/therapists)
  { resource: "resource", action: "read", scope: "branch" },
  { resource: "resource", action: "write", scope: "branch" },
  { resource: "resource", action: "release", scope: "branch" },
  { resource: "resource", action: "maintain", scope: "branch" },
  // Pharmacy
  { resource: "pharmacy", action: "dispense", scope: "branch" },
  // Catalog master data (products, courses, BOMs) — tenant-wide config, not
  // per-branch stock. Distinct from `inventory:write` which is for stock moves.
  { resource: "catalog", action: "manage", scope: "tenant" },
  // Admin
  { resource: "audit", action: "read", scope: "tenant" },
  { resource: "break_glass", action: "approve", scope: "tenant" },
  // Phase K — PDPA / Data Subject Rights. Tenant-scoped.
  //   - export    → MANAGER. Read-only DSR delivery (≤30-day legal SLA);
  //     MANAGER already holds `patient:merge` + `audit:read` so this does
  //     not expand their PII blast radius.
  //   - anonymize → MANAGER (irreversible business decision — clinic owner
  //     responds to the data-subject's request to be forgotten). UI gates
  //     it behind a confirmation + reason ≥ 8 chars and audit-logs every
  //     run; ADMIN keeps the same permission as a system-recovery escape
  //     hatch but in normal operation this is a Manager action.
  { resource: "pdpa", action: "export", scope: "tenant" },
  { resource: "pdpa", action: "anonymize", scope: "tenant" },
  // Phase O — Promotion / voucher engine. CRUD is a tenant-wide config
  // (Manager) but the redeem action runs at the desk so it's branch-scoped.
  { resource: "promotion", action: "read", scope: "tenant" },
  { resource: "promotion", action: "write", scope: "tenant" },
  { resource: "promotion", action: "redeem", scope: "branch" },
  // Phase M — Lab orders & results. Doctor orders (write), nurse collects
  // (collect), and lab tech / outsourced lab posts results (result). Read is
  // branch-wide for clinical staff.
  { resource: "lab", action: "read", scope: "branch" },
  { resource: "lab", action: "write", scope: "branch" },
  { resource: "lab", action: "collect", scope: "branch" },
  { resource: "lab", action: "result", scope: "branch" },
];

const ROLE_MATRIX: Record<string, string[]> = {
  ADMIN: PERMISSIONS.map((p) => `${p.resource}:${p.action}:${p.scope}`),
  MANAGER: [
    // Phase Q — Manager owns operational staff lifecycle. The api-server
    // service layer enforces a *role-allowlist* (DOCTOR / NURSE / RECEPTION /
    // PHARMACIST only) so a Manager can never escalate themselves or create
    // another ADMIN / MANAGER / sysadmin. Privilege creation stays with ADMIN.
    "user:read:tenant",
    "user:write:tenant",
    "patient:read:branch",
    // Phase K — Manager runs the duplicate-detection / merge UI. Doctor or
    // Reception cannot merge (high-impact, cross-branch action).
    "patient:merge:tenant",
    "appointment:read:branch",
    "appointment:write:branch",
    "payment:read:branch",
    "payment:write:branch",
    "payment:void:tenant",
    "payment:settle:tenant",
    "invoice:void:tenant",
    "order:read:branch",
    "inventory:read:branch",
    "inventory:reconcile:branch",
    "wallet:read:branch",
    "resource:read:branch",
    "resource:write:branch",
    "resource:release:branch",
    "resource:maintain:branch",
    "catalog:manage:tenant",
    "audit:read:tenant",
    "break_glass:approve:tenant",
    // EoD
    "shift:open:branch",
    "shift:close:branch",
    "shift:read:branch",
    // Phase O — promotion / voucher engine
    "promotion:read:tenant",
    "promotion:write:tenant",
    "promotion:redeem:branch",
    // Phase M — Lab read for oversight; result is a separate sub-flow
    // they don't normally do themselves.
    "lab:read:branch",
    // Phase K — PDPA DSR. Manager handles BOTH the "give me a copy of my
    // data" (export, ≤30-day legal SLA) and the "forget me" (anonymise).
    // Anonymise is irreversible so the UI requires a typed reason ≥ 8 chars
    // and a confirm dialog; every action is audit-logged with the actor.
    // ADMIN retains the same permission but only as a recovery escape hatch.
    "pdpa:export:tenant",
    "pdpa:anonymize:tenant",
  ],
  DOCTOR: [
    "patient:read:branch",
    "patient:write:branch",
    "emr:read:branch",
    "emr:write:branch",
    "emr:sign:self",
    "appointment:read:branch",
    // Doctors run the visit lifecycle (start exam / close case) and may
    // create invoice + accept payment in single-doctor practices.
    "appointment:write:branch",
    "payment:read:branch",
    "payment:write:branch",
    "order:read:branch",
    "order:write:branch",
    "procedure:perform:branch",
    "resource:read:branch",
    "resource:release:branch",
    "wallet:read:branch",
    // Phase M — Doctor orders labs (write) and reads results.
    "lab:read:branch",
    "lab:write:branch",
  ],
  NURSE: [
    "patient:read:branch",
    "emr:read:branch",
    "appointment:read:branch",
    // Nurses send patients in/out of exam rooms (visit start/complete) and
    // execute procedures the doctor ordered — so they must READ orders to know
    // what to start/complete, but cannot CREATE orders. Read payment status
    // so they know the visit is settled before discharging the patient.
    "appointment:write:branch",
    "order:read:branch",
    "payment:read:branch",
    "procedure:perform:branch",
    "inventory:read:branch",
    "resource:read:branch",
    "resource:release:branch",
    // Phase M — Nurse collects samples (collect) and may post external lab
    // results into the system (result). Cannot order tests.
    "lab:read:branch",
    "lab:collect:branch",
    "lab:result:branch",
  ],
  RECEPTION: [
    "patient:read:branch",
    "patient:write:branch",
    "appointment:read:branch",
    "appointment:write:branch",
    "payment:read:branch",
    "payment:write:branch",
    // Reception needs to see orders to bill the visit at check-out.
    "order:read:branch",
    "resource:read:branch",
    "resource:release:branch",
    // Reception opens/closes their cash drawer at start/end of shift; manager
    // still owns gateway settle + variance reconcile.
    "shift:open:branch",
    "shift:close:branch",
    "shift:read:branch",
    // Phase O — Reception applies promotions at the desk (read + redeem)
    // but cannot create/edit promotions (that's Manager's tenant config).
    "promotion:read:tenant",
    "promotion:redeem:branch",
  ],
  PHARMACIST: [
    "patient:read:branch",
    "pharmacy:dispense:branch",
    // Pharmacist needs to verify invoice is paid before handing out medication.
    "payment:read:branch",
    "inventory:read:branch",
    "inventory:write:branch",
  ],
};

async function main() {
  console.log("🌱 Seeding LegacyX...");

  // ----- Tenant + Branches -----
  const tenant = await prisma.tenant.upsert({
    where: { slug: "legacyx" },
    update: {},
    create: {
      slug: "legacyx",
      name: "LegacyX Demo Clinic Group",
      plan: "PRO",
      settings: { currency: "THB", locale: "th-TH" },
    },
  });
  console.log(`  ✓ Tenant: ${tenant.slug}`);

  const branches = await Promise.all(
    [
      { code: "br_01", name: "LegacyX Sukhumvit" },
      { code: "br_02", name: "LegacyX Thonglor" },
    ].map((b) =>
      prisma.branch.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: b.code } },
        update: {},
        create: { ...b, tenantId: tenant.id },
      }),
    ),
  );
  console.log(`  ✓ Branches: ${branches.map((b) => b.code).join(", ")}`);

  // ----- Permissions -----
  const permRows = await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: {
          resource_action_scope: { resource: p.resource, action: p.action, scope: p.scope },
        },
        update: {},
        create: p,
      }),
    ),
  );
  const permByKey = new Map(
    permRows.map((p) => [`${p.resource}:${p.action}:${p.scope}`, p.id]),
  );
  console.log(`  ✓ Permissions: ${permRows.length}`);

  // ----- Roles + Role-Permission -----
  for (const [roleCode, permKeys] of Object.entries(ROLE_MATRIX)) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: roleCode } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: roleCode,
        name: roleCode,
        isSystem: true,
      },
    });
    for (const key of permKeys) {
      const pid = permByKey.get(key);
      if (!pid) {
        console.warn(`    ! Missing permission key: ${key}`);
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: pid } },
        update: {},
        create: { roleId: role.id, permissionId: pid },
      });
    }
    console.log(`  ✓ Role: ${roleCode} (${permKeys.length} perms)`);
  }

  // ----- Demo users (one per role) -----
  // Each user gets full UserBranchAccess to all branches + their primary role.
  // Login is now phone-based (OTP-only — passwords still seeded for legacy
  // tooling but the backoffice UI no longer prompts for them).
  //
  // Note the dual-role example at the bottom: phone 0888888888 is registered
  // BOTH as a DOCTOR and as a MANAGER. The login flow detects this and shows
  // a role-picker before the OTP step.
  const DEMO_USERS: Array<{
    phone: string;
    fullName: string;
    password: string;
    roleCode: string;
  }> = [
    {
      phone: "0800000001",
      fullName: "System Administrator",
      password: "admin123!",
      roleCode: "ADMIN",
    },
    {
      phone: "0800000002",
      fullName: "Manda Manager",
      password: "manager123!",
      roleCode: "MANAGER",
    },
    {
      phone: "0800000003",
      fullName: "Dr. Daniel Doctor",
      password: "doctor123!",
      roleCode: "DOCTOR",
    },
    {
      phone: "0800000004",
      fullName: "Nina Nurse",
      password: "nurse123!",
      roleCode: "NURSE",
    },
    {
      phone: "0800000005",
      fullName: "Rita Reception",
      password: "reception123!",
      roleCode: "RECEPTION",
    },
    {
      phone: "0800000006",
      fullName: "Phil Pharmacist",
      password: "pharmacist123!",
      roleCode: "PHARMACIST",
    },
    // Multi-role demo — same phone, two different roles. Login flow will
    // present a role picker.
    {
      phone: "0888888888",
      fullName: "Dr. Dual (Doctor side)",
      password: "dual123!",
      roleCode: "DOCTOR",
    },
    {
      phone: "0888888888",
      fullName: "Dr. Dual (Manager side)",
      password: "dual123!",
      roleCode: "MANAGER",
    },
    // Phase Q — System-Owner dual-role demo. The clinic owner often wears
    // BOTH the Admin (system) and Manager (business) hats; this account lets
    // them pick on each login. Useful when QA-ing SoD: log in as ADMIN to
    // review system tiles, then re-login as MANAGER to verify the staff
    // management/PDPA/finance flows look right.
    {
      phone: "0900000000",
      fullName: "Owner-Admin (System side)",
      password: "owner123!",
      roleCode: "ADMIN",
    },
    {
      phone: "0900000000",
      fullName: "Owner-Manager (Business side)",
      password: "owner123!",
      roleCode: "MANAGER",
    },
    // Phase Q — All-Ops demo. Same phone registered as every operational
    // role so a single QA session can quickly cycle through DOCTOR / NURSE
    // / RECEPTION / PHARMACIST without juggling test accounts. The role
    // picker on the login screen lets you switch.
    {
      phone: "0999999999",
      fullName: "All-Ops (Doctor side)",
      password: "allops123!",
      roleCode: "DOCTOR",
    },
    {
      phone: "0999999999",
      fullName: "All-Ops (Nurse side)",
      password: "allops123!",
      roleCode: "NURSE",
    },
    {
      phone: "0999999999",
      fullName: "All-Ops (Reception side)",
      password: "allops123!",
      roleCode: "RECEPTION",
    },
    {
      phone: "0999999999",
      fullName: "All-Ops (Pharmacist side)",
      password: "allops123!",
      roleCode: "PHARMACIST",
    },
  ];

  for (const du of DEMO_USERS) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: tenant.id, code: du.roleCode } },
    });
    const phone = normalizePhone(du.phone);
    const phoneHash = searchableHash(tenant.id, phone);
    // Uniqueness: (tenantId, phone, primaryRoleCode). Same phone may be
    // registered under different roles (different rows).
    const existing = await prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        phone,
        primaryRoleCode: du.roleCode,
      },
    });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            phone,
            phoneHash,
            primaryRoleCode: du.roleCode,
            fullName: du.fullName,
            passwordHash: hashPassword(du.password),
            status: "ACTIVE",
          },
        })
      : await prisma.user.create({
          data: {
            tenantId: tenant.id,
            phone,
            phoneHash,
            primaryRoleCode: du.roleCode,
            fullName: du.fullName,
            passwordHash: hashPassword(du.password),
            status: "ACTIVE",
          },
        });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    for (const b of branches) {
      await prisma.userBranchAccess.upsert({
        where: { userId_branchId: { userId: user.id, branchId: b.id } },
        update: {},
        create: { userId: user.id, branchId: b.id },
      });
    }
    console.log(
      `  ✓ User: ${du.phone} ${du.fullName} (${du.roleCode}) / OTP=123456`,
    );
  }

  // ----- Products (medications, supplies, courses) -----
  // Price is stored in `attributes.price` (JSON) since the schema doesn't have
  // a price column yet. Order service reads it from there when auto-filling
  // unit_price.
  type SeedProduct = {
    sku: string;
    name: string;
    category: "MEDICATION" | "SUPPLY" | "DEVICE" | "COSMETIC" | "COURSE" | "OTHER";
    unit: string;
    price: number;
    reorderLevel?: number;
    // Optional course metadata: number of sessions included + default linked
    // procedure the course is used against (stored in attributes for reference).
    courseSessions?: number;
    coursesProcedureCode?: string;
  };

  const PRODUCT_SEED: SeedProduct[] = [
    // --- Medications (injectables) ---
    { sku: "BTX-100U", name: "Botulinum Toxin 100 Units (Botox)", category: "MEDICATION", unit: "vial", price: 7500, reorderLevel: 5 },
    { sku: "HA-1ML", name: "Hyaluronic Acid Filler 1 ml", category: "MEDICATION", unit: "syringe", price: 8500, reorderLevel: 5 },
    { sku: "LIDOCAINE-10ML", name: "Lidocaine 2% 10ml Vial", category: "MEDICATION", unit: "vial", price: 120, reorderLevel: 20 },
    { sku: "VIT-C-5G", name: "Vitamin C 5g Ampoule", category: "MEDICATION", unit: "amp", price: 450, reorderLevel: 15 },
    { sku: "VIT-B-COMP", name: "Vitamin B Complex Ampoule", category: "MEDICATION", unit: "amp", price: 180, reorderLevel: 15 },
    { sku: "GLUTATHIONE-600", name: "Glutathione 600 mg", category: "MEDICATION", unit: "amp", price: 800, reorderLevel: 10 },
    { sku: "NACL-500ML", name: "Normal Saline 500 ml", category: "MEDICATION", unit: "bag", price: 45, reorderLevel: 30 },

    // --- Oral medications (pharmacy dispense) ---
    { sku: "PARA-500", name: "Paracetamol 500 mg", category: "MEDICATION", unit: "tab", price: 2, reorderLevel: 200 },
    { sku: "IBU-400", name: "Ibuprofen 400 mg", category: "MEDICATION", unit: "tab", price: 5, reorderLevel: 100 },
    { sku: "CETIRIZINE-10", name: "Cetirizine 10 mg", category: "MEDICATION", unit: "tab", price: 8, reorderLevel: 60 },
    { sku: "AMOX-500", name: "Amoxicillin 500 mg", category: "MEDICATION", unit: "cap", price: 6, reorderLevel: 80 },
    { sku: "OMEPRAZOLE-20", name: "Omeprazole 20 mg", category: "MEDICATION", unit: "cap", price: 10, reorderLevel: 60 },

    // --- Supplies (consumables) ---
    { sku: "NEEDLE-30G", name: "Disposable Needle 30G", category: "SUPPLY", unit: "pcs", price: 5, reorderLevel: 500 },
    { sku: "NEEDLE-27G", name: "Disposable Needle 27G", category: "SUPPLY", unit: "pcs", price: 6, reorderLevel: 300 },
    { sku: "SYRINGE-3ML", name: "Syringe 3 ml", category: "SUPPLY", unit: "pcs", price: 8, reorderLevel: 300 },
    { sku: "SYRINGE-5ML", name: "Syringe 5 ml", category: "SUPPLY", unit: "pcs", price: 10, reorderLevel: 300 },
    { sku: "GAUZE-PK", name: "Sterile Gauze 4x4 Pack", category: "SUPPLY", unit: "pack", price: 15, reorderLevel: 100 },
    { sku: "ALCOHOL-SWAB", name: "Alcohol Prep Swab", category: "SUPPLY", unit: "pcs", price: 1, reorderLevel: 500 },
    { sku: "GLOVE-M", name: "Nitrile Glove (M) Pair", category: "SUPPLY", unit: "pair", price: 5, reorderLevel: 500 },
    { sku: "IV-SET", name: "IV Administration Set", category: "SUPPLY", unit: "pcs", price: 35, reorderLevel: 80 },
    { sku: "COTTON-BALL", name: "Sterile Cotton Ball", category: "SUPPLY", unit: "pcs", price: 1, reorderLevel: 500 },

    // --- Cosmetics (aftercare / retail) ---
    { sku: "SPF-50", name: "Medical SPF50+ Sunscreen", category: "COSMETIC", unit: "tube", price: 650, reorderLevel: 20 },
    { sku: "CICA-CREAM", name: "Post-procedure Cica Cream", category: "COSMETIC", unit: "tube", price: 480, reorderLevel: 20 },

    // --- Courses (prepaid packages) ---
    // Cheaper-per-session than ad-hoc; uses the linked procedure's BOM.
    { sku: "COURSE-BTX-4", name: "Botox Full Face Course x4", category: "COURSE", unit: "session", price: 34000, courseSessions: 4, coursesProcedureCode: "PROC_BTX_FACE" },
    { sku: "COURSE-LASER-10", name: "Laser Hair Removal Course x10", category: "COURSE", unit: "session", price: 12000, courseSessions: 10, coursesProcedureCode: "PROC_LASER_HAIR" },
    { sku: "COURSE-FACIAL-6", name: "Signature Facial Course x6", category: "COURSE", unit: "session", price: 6500, courseSessions: 6, coursesProcedureCode: "PROC_FACIAL_BASIC" },
    { sku: "COURSE-IV-5", name: "Vitamin IV Drip Course x5", category: "COURSE", unit: "session", price: 11500, courseSessions: 5, coursesProcedureCode: "PROC_VITAMIN_IV" },
    { sku: "COURSE-FILLER-2", name: "HA Filler Cheek Course x2", category: "COURSE", unit: "session", price: 22000, courseSessions: 2, coursesProcedureCode: "PROC_FILLER_CHEEK" },
  ];

  const products = await Promise.all(
    PRODUCT_SEED.map((p) =>
      prisma.product.upsert({
        where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
        update: {
          name: p.name,
          attributes: {
            price: p.price,
            ...(p.courseSessions ? { sessions: p.courseSessions } : {}),
            ...(p.coursesProcedureCode ? { procedureCode: p.coursesProcedureCode } : {}),
          },
          reorderLevel: p.reorderLevel ?? 0,
        },
        create: {
          tenantId: tenant.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          unit: p.unit,
          trackStock: p.category !== "COURSE",
          reorderLevel: p.reorderLevel ?? 0,
          attributes: {
            price: p.price,
            ...(p.courseSessions ? { sessions: p.courseSessions } : {}),
            ...(p.coursesProcedureCode ? { procedureCode: p.coursesProcedureCode } : {}),
          },
        },
      }),
    ),
  );
  console.log(`  ✓ Products: ${products.length} (meds + supplies + cosmetics + courses)`);

  // ----- BOMs per procedure (what gets consumed from stock each session) -----
  // Each key is a procedure code (matches catalog.service.ts) mapped to its
  // materials list. On procedure.completed the worker reads this and posts
  // immutable BOM_USAGE rows in the StockLedger.
  const productIds = Object.fromEntries(products.map((p) => [p.sku, p.id]));
  const BOM_SEED: Record<string, Array<{ sku: string; qty: string; unit: string }>> = {
    PROC_BTX_FACE: [
      { sku: "BTX-100U", qty: "0.5", unit: "vial" },
      { sku: "NEEDLE-30G", qty: "4", unit: "pcs" },
      { sku: "SYRINGE-3ML", qty: "2", unit: "pcs" },
      { sku: "ALCOHOL-SWAB", qty: "6", unit: "pcs" },
      { sku: "GAUZE-PK", qty: "1", unit: "pack" },
      { sku: "GLOVE-M", qty: "1", unit: "pair" },
    ],
    PROC_BTX_FOREHEAD: [
      { sku: "BTX-100U", qty: "0.2", unit: "vial" },
      { sku: "NEEDLE-30G", qty: "2", unit: "pcs" },
      { sku: "SYRINGE-3ML", qty: "1", unit: "pcs" },
      { sku: "ALCOHOL-SWAB", qty: "3", unit: "pcs" },
      { sku: "GLOVE-M", qty: "1", unit: "pair" },
    ],
    PROC_FILLER_CHEEK: [
      { sku: "HA-1ML", qty: "1", unit: "syringe" },
      { sku: "LIDOCAINE-10ML", qty: "0.1", unit: "vial" },
      { sku: "NEEDLE-27G", qty: "2", unit: "pcs" },
      { sku: "ALCOHOL-SWAB", qty: "4", unit: "pcs" },
      { sku: "GAUZE-PK", qty: "1", unit: "pack" },
      { sku: "GLOVE-M", qty: "1", unit: "pair" },
    ],
    PROC_LASER_HAIR: [
      { sku: "ALCOHOL-SWAB", qty: "2", unit: "pcs" },
      { sku: "CICA-CREAM", qty: "0.1", unit: "tube" },
      { sku: "GLOVE-M", qty: "1", unit: "pair" },
    ],
    PROC_FACIAL_BASIC: [
      { sku: "GAUZE-PK", qty: "1", unit: "pack" },
      { sku: "COTTON-BALL", qty: "10", unit: "pcs" },
      { sku: "CICA-CREAM", qty: "0.1", unit: "tube" },
    ],
    PROC_VITAMIN_IV: [
      { sku: "VIT-C-5G", qty: "1", unit: "amp" },
      { sku: "VIT-B-COMP", qty: "1", unit: "amp" },
      { sku: "GLUTATHIONE-600", qty: "1", unit: "amp" },
      { sku: "NACL-500ML", qty: "1", unit: "bag" },
      { sku: "IV-SET", qty: "1", unit: "pcs" },
      { sku: "NEEDLE-27G", qty: "1", unit: "pcs" },
      { sku: "SYRINGE-5ML", qty: "3", unit: "pcs" },
      { sku: "ALCOHOL-SWAB", qty: "3", unit: "pcs" },
      { sku: "GLOVE-M", qty: "1", unit: "pair" },
    ],
    PROC_CONSULT: [
      // Consultation: no material consumption
    ],
  };

  let bomCount = 0;
  for (const [procCode, items] of Object.entries(BOM_SEED)) {
    if (items.length === 0) continue;
    const existing = await prisma.bOM.findFirst({
      where: { tenantId: tenant.id, ownerType: "PROCEDURE", ownerRef: procCode, active: true },
    });
    if (existing) continue;
    await prisma.bOM.create({
      data: {
        tenantId: tenant.id,
        ownerType: "PROCEDURE",
        ownerRef: procCode,
        version: 1,
        items: {
          create: items
            .filter((it) => productIds[it.sku])
            .map((it) => ({
              componentProductId: productIds[it.sku]!,
              qty: it.qty,
              unit: it.unit,
            })),
        },
      },
    });
    bomCount++;
  }
  console.log(`  ✓ BOMs: ${bomCount} procedure recipes`);

  // ----- Sample Resources (rooms + therapist + laser) -----
  const ROOM_TEMPLATE: Array<{
    code: string;
    name: string;
    type: "ROOM" | "MACHINE" | "THERAPIST" | "LASER";
    floor: number;
    subtype: string;
  }> = [
    { code: "ROOM-301", name: "ห้อง 301", type: "ROOM", floor: 3, subtype: "Dental Room" },
    { code: "ROOM-302", name: "ห้อง 302", type: "ROOM", floor: 3, subtype: "Dental Room" },
    { code: "ROOM-303", name: "ห้อง 303", type: "ROOM", floor: 3, subtype: "Spa/Aesthetic" },
    { code: "ROOM-304", name: "ห้อง 304", type: "ROOM", floor: 3, subtype: "Spa/Aesthetic" },
    { code: "ROOM-305", name: "ห้อง 305", type: "ROOM", floor: 3, subtype: "VIP Suite" },
    { code: "ROOM-401", name: "ห้อง 401", type: "ROOM", floor: 4, subtype: "Laser Room" },
    { code: "ROOM-402", name: "ห้อง 402", type: "ROOM", floor: 4, subtype: "Consultation" },
    { code: "LASER-ND01", name: "ND-YAG #1", type: "LASER", floor: 4, subtype: "ND-YAG" },
  ];
  for (const b of branches) {
    for (const t of ROOM_TEMPLATE) {
      await prisma.resource.upsert({
        where: {
          tenantId_branchId_code: { tenantId: tenant.id, branchId: b.id, code: t.code },
        },
        update: {
          name: t.name,
          type: t.type,
          attributes: { floor: t.floor, subtype: t.subtype } as object,
        },
        create: {
          tenantId: tenant.id,
          branchId: b.id,
          type: t.type,
          code: t.code,
          name: t.name,
          status: "AVAILABLE",
          attributes: { floor: t.floor, subtype: t.subtype } as object,
        },
      });
    }
  }
  // Keep ROOM-01 alive so existing appointments still work
  for (const b of branches) {
    await prisma.resource.upsert({
      where: { tenantId_branchId_code: { tenantId: tenant.id, branchId: b.id, code: "ROOM-01" } },
      update: {},
      create: {
        tenantId: tenant.id,
        branchId: b.id,
        type: "ROOM",
        code: "ROOM-01",
        name: "Treatment Room 1 (legacy)",
        status: "AVAILABLE",
        attributes: { floor: 1, subtype: "General" } as object,
      },
    });
  }
  console.log(`  ✓ Resources: ${ROOM_TEMPLATE.length + 1} per branch (rooms + laser)`);

  // ----- Sample Patients -----
  // A small but realistic mix so the backoffice search / appointment booking
  // / EMR demo flows have meaningful data right after `pnpm db:seed`.
  //   * Branches alternate between Sukhumvit (br_01) and Thonglor (br_02)
  //   * Genders mixed; ages span 20s-60s for clinical realism
  //   * `phone` (when present) is encrypted at rest (phoneEnc) AND indexed via
  //     phoneHash so guest-booking / OTP lookup / dedupe all work.
  //   * `lineUserId` populated for two patients to exercise the LINE LIFF flow
  //     (one verified, one unverified).
  type SeedPatient = {
    hn: string;
    firstName: string;
    lastName: string;
    gender: "MALE" | "FEMALE" | "OTHER" | "UNDISCLOSED";
    dob: string; // ISO date
    branchIdx: 0 | 1; // index into `branches`
    phone?: string; // raw, will be normalised + hashed + encrypted
    email?: string;
    nickname?: string;
    lineUserId?: string;
    bloodType?: string;
    allergies?: string[];
    chronicConditions?: string[];
    verificationStatus?: "UNVERIFIED" | "PENDING" | "VERIFIED";
  };

  const PATIENT_SEED: SeedPatient[] = [
    // Original demo patient — kept for backwards compatibility with any test
    // fixtures that hardcode HN-0000001.
    {
      hn: "HN-0000001",
      firstName: "Demo",
      lastName: "Patient",
      gender: "FEMALE",
      dob: "1990-05-15",
      branchIdx: 0,
      lineUserId: "U_demo_line_0000001",
      verificationStatus: "VERIFIED",
    },
    {
      hn: "HN-0000002",
      firstName: "สมชาย",
      lastName: "ใจดี",
      nickname: "ชาย",
      gender: "MALE",
      dob: "1985-03-22",
      branchIdx: 0,
      phone: "0812345678",
      email: "somchai.j@example.com",
      bloodType: "O+",
      allergies: ["Penicillin"],
      chronicConditions: ["Hypertension"],
      verificationStatus: "VERIFIED",
    },
    {
      hn: "HN-0000003",
      firstName: "พิมพ์ใจ",
      lastName: "วงศ์สวัสดิ์",
      nickname: "พิม",
      gender: "FEMALE",
      dob: "1995-11-08",
      branchIdx: 1,
      phone: "0898765432",
      email: "pim.w@example.com",
      lineUserId: "U_demo_line_0000003",
      bloodType: "A+",
      allergies: ["Lidocaine"],
      verificationStatus: "VERIFIED",
    },
    {
      hn: "HN-0000004",
      firstName: "อรุณรัตน์",
      lastName: "ทองเจริญ",
      nickname: "อร",
      gender: "FEMALE",
      dob: "1978-07-30",
      branchIdx: 0,
      phone: "0865551234",
      bloodType: "B+",
      chronicConditions: ["Diabetes Type 2", "Hyperlipidemia"],
      verificationStatus: "PENDING",
    },
    {
      hn: "HN-0000005",
      firstName: "ธนกร",
      lastName: "พิทักษ์ชาติ",
      nickname: "บอส",
      gender: "MALE",
      dob: "2000-01-19",
      branchIdx: 1,
      phone: "0823334455",
      email: "thanakorn.p@example.com",
      bloodType: "AB-",
      verificationStatus: "UNVERIFIED",
    },
    {
      hn: "HN-0000006",
      firstName: "Jennifer",
      lastName: "Anderson",
      nickname: "Jen",
      gender: "FEMALE",
      dob: "1992-09-12",
      branchIdx: 1,
      phone: "0911112222",
      email: "jen.anderson@example.com",
      bloodType: "O-",
      allergies: ["Shellfish", "Aspirin"],
      verificationStatus: "VERIFIED",
    },
  ];

  for (const p of PATIENT_SEED) {
    const branchId = branches[p.branchIdx]!.id;
    const phone = p.phone ? normalizePhone(p.phone) : null;
    const phoneHash = phone ? searchableHash(tenant.id, phone) : null;
    const phoneEnc = phone ? encryptField(phone) : null;
    const emailEnc = p.email ? encryptField(p.email) : null;
    const nicknameEnc = p.nickname ? encryptField(p.nickname) : null;
    const verificationStatus = p.verificationStatus ?? "UNVERIFIED";

    await prisma.patient.upsert({
      where: { tenantId_hn: { tenantId: tenant.id, hn: p.hn } },
      update: {
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender,
        dob: new Date(p.dob),
        homeBranchId: branchId,
        phoneEnc,
        phoneHash,
        emailEnc,
        nicknameEnc,
        bloodType: p.bloodType ?? null,
        allergies: p.allergies ?? Prisma.DbNull,
        chronicConditions: p.chronicConditions ?? Prisma.DbNull,
        lineUserId: p.lineUserId ?? null,
        verificationStatus,
      },
      create: {
        tenantId: tenant.id,
        hn: p.hn,
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender,
        dob: new Date(p.dob),
        homeBranchId: branchId,
        phoneEnc,
        phoneHash,
        emailEnc,
        nicknameEnc,
        bloodType: p.bloodType ?? null,
        allergies: p.allergies ?? Prisma.DbNull,
        chronicConditions: p.chronicConditions ?? Prisma.DbNull,
        lineUserId: p.lineUserId ?? null,
        verificationStatus,
        status: "ACTIVE",
      },
    });
  }
  console.log(`  ✓ Patients: ${PATIENT_SEED.length} (HN-0000001..${PATIENT_SEED.at(-1)!.hn})`);

  // ----- Patient-facing Service Catalog -----
  // 3 categories matching image 1 (Dental / Beauty & Spa / Wellness).
  // Demo images reference public Unsplash photos — swap for real branded
  // assets in production. `procedureCode` ties back to the staff catalog so
  // a guest booking eventually emits the same downstream events.
  const CATEGORIES: Array<{
    code: string;
    name: string;
    nameTh: string;
    description: string;
    descriptionTh: string;
    imageUrl: string;
    displayOrder: number;
  }> = [
    {
      code: "dental",
      name: "Dental",
      nameTh: "ทันตกรรม",
      description: "Comprehensive dental care from check-ups to Invisalign.",
      descriptionTh: "ศูนย์ทันตกรรมเฉพาะทาง",
      imageUrl: "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=800&q=80",
      displayOrder: 1,
    },
    {
      code: "beauty",
      name: "Beauty & Spa",
      nameTh: "ความงามและสปา",
      description: "Aesthetic treatments — facial, botox, filler, laser.",
      descriptionTh: "ศูนย์ผิวพรรณและความงาม",
      imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80",
      displayOrder: 2,
    },
    {
      code: "wellness",
      name: "Wellness",
      nameTh: "เวชศาสตร์ชะลอวัย",
      description: "Anti-aging, vitamin IV drips, hormone therapy.",
      descriptionTh: "เวชศาสตร์ชะลอวัย",
      imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80",
      displayOrder: 3,
    },
  ];

  const categoryByCode: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const row = await prisma.serviceCategory.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
      update: {
        name: c.name,
        nameTh: c.nameTh,
        description: c.description,
        descriptionTh: c.descriptionTh,
        imageUrl: c.imageUrl,
        displayOrder: c.displayOrder,
      },
      create: {
        tenantId: tenant.id,
        code: c.code,
        name: c.name,
        nameTh: c.nameTh,
        description: c.description,
        descriptionTh: c.descriptionTh,
        imageUrl: c.imageUrl,
        displayOrder: c.displayOrder,
      },
    });
    categoryByCode[c.code] = row.id;
  }
  console.log(`  ✓ Service categories: ${CATEGORIES.length}`);

  const SERVICES: Array<{
    categoryCode: string;
    code: string;
    name: string;
    nameTh: string;
    description: string;
    descriptionTh: string;
    priceFrom: number | null;
    priceTo: number | null;
    durationMin: number;
    imageUrl: string;
    procedureCode: string | null;
    displayOrder: number;
  }> = [
    // ----- Dental -----
    {
      categoryCode: "dental",
      code: "SVC_DENTAL_CHECKUP",
      name: "Dental Check-up",
      nameTh: "ตรวจสุขภาพฟัน",
      description: "Digital oral exam by a specialist dentist.",
      descriptionTh: "ตรวจเช็คสุขภาพช่องปากโดยทันตแพทย์เฉพาะทางด้วยระบบดิจิทัล",
      priceFrom: 0,
      priceTo: null,
      durationMin: 30,
      imageUrl: "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=600&q=80",
      procedureCode: "PROC_CONSULT",
      displayOrder: 1,
    },
    {
      categoryCode: "dental",
      code: "SVC_DENTAL_SCALING",
      name: "Scaling & Polishing",
      nameTh: "ขูดหินปูนและขัดฟัน",
      description: "Air-flow tartar removal for healthy gums.",
      descriptionTh: "ขจัดคราบหินปูนเพื่อสุขภาพเหงือกที่ดีด้วยเทคโนโลยี Air-flow",
      priceFrom: 1200,
      priceTo: 1500,
      durationMin: 45,
      imageUrl: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=600&q=80",
      procedureCode: null,
      displayOrder: 2,
    },
    {
      categoryCode: "dental",
      code: "SVC_DENTAL_INVISALIGN",
      name: "Invisalign",
      nameTh: "จัดฟันใส Invisalign",
      description: "Clear aligner treatment planning with iTero scanner.",
      descriptionTh: "วางแผนการจัดฟันแบบใสด้วยเทคโนโลยี iTero Element Scanner",
      priceFrom: null, // "สอบถามราคา"
      priceTo: null,
      durationMin: 60,
      imageUrl: "https://images.unsplash.com/photo-1581585504432-7c8e89f9d39a?w=600&q=80",
      procedureCode: null,
      displayOrder: 3,
    },
    // ----- Beauty & Spa -----
    {
      categoryCode: "beauty",
      code: "SVC_BTX_FACE",
      name: "Botox Full Face",
      nameTh: "โบท็อกซ์ทั้งใบหน้า",
      description: "Wrinkle smoothing with 50 units across forehead, brows and eye area.",
      descriptionTh: "ฉีดโบท็อกซ์ลดริ้วรอย 50 ยูนิตทั้งหน้าผาก หางตา และระหว่างคิ้ว",
      priceFrom: 9500,
      priceTo: 9500,
      durationMin: 30,
      imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=80",
      procedureCode: "PROC_BTX_FACE",
      displayOrder: 1,
    },
    {
      categoryCode: "beauty",
      code: "SVC_FILLER_CHEEK",
      name: "HA Filler — Cheek",
      nameTh: "ฟิลเลอร์โหนกแก้ม",
      description: "1 cc Hyaluronic acid filler for cheek volume.",
      descriptionTh: "ฉีดฟิลเลอร์กรดไฮยาลูโรนิก 1 cc เพิ่มวอลุ่มโหนกแก้ม",
      priceFrom: 12000,
      priceTo: 12000,
      durationMin: 45,
      imageUrl: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=600&q=80",
      procedureCode: "PROC_FILLER_CHEEK",
      displayOrder: 2,
    },
    {
      categoryCode: "beauty",
      code: "SVC_LASER_HAIR",
      name: "Laser Hair Removal",
      nameTh: "เลเซอร์ขนรักแร้",
      description: "Painless underarm hair removal with diode laser.",
      descriptionTh: "เลเซอร์กำจัดขนรักแร้ด้วยเทคโนโลยี diode",
      priceFrom: 1500,
      priceTo: 1500,
      durationMin: 30,
      imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80",
      procedureCode: "PROC_LASER_HAIR",
      displayOrder: 3,
    },
    {
      categoryCode: "beauty",
      code: "SVC_FACIAL_BASIC",
      name: "Basic Facial",
      nameTh: "ทรีตเมนต์ผิวหน้าพื้นฐาน",
      description: "Cleansing facial with steam and serum massage.",
      descriptionTh: "ทำความสะอาดผิวหน้า สตีม และมาสซาจเซรั่มบำรุงผิว",
      priceFrom: 1200,
      priceTo: 1500,
      durationMin: 60,
      imageUrl: "https://images.unsplash.com/photo-1620331317660-46bf4b3ce4f8?w=600&q=80",
      procedureCode: "PROC_FACIAL_BASIC",
      displayOrder: 4,
    },
    // ----- Wellness -----
    {
      categoryCode: "wellness",
      code: "SVC_VITAMIN_IV",
      name: "Vitamin IV Drip",
      nameTh: "วิตามินดริปทางหลอดเลือดดำ",
      description: "Vit-C + B-complex + Glutathione for skin brightening.",
      descriptionTh: "วิตามินซี + บีรวม + กลูตาไธโอนทางหลอดเลือดดำ บำรุงผิวกระจ่างใส",
      priceFrom: 2500,
      priceTo: 3500,
      durationMin: 45,
      imageUrl: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&q=80",
      procedureCode: "PROC_VITAMIN_IV",
      displayOrder: 1,
    },
    {
      categoryCode: "wellness",
      code: "SVC_CONSULT_AGE",
      name: "Anti-Aging Consultation",
      nameTh: "ปรึกษาเวชศาสตร์ชะลอวัย",
      description: "Initial consultation with anti-aging specialist.",
      descriptionTh: "ปรึกษาแพทย์เฉพาะทางด้านชะลอวัย ประเมินสุขภาพและวางแผนรักษา",
      priceFrom: 500,
      priceTo: 500,
      durationMin: 30,
      imageUrl: "https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=600&q=80",
      procedureCode: "PROC_CONSULT",
      displayOrder: 2,
    },
    {
      categoryCode: "wellness",
      code: "SVC_HORMONE_PANEL",
      name: "Hormone Health Panel",
      nameTh: "ตรวจระดับฮอร์โมน",
      description: "Comprehensive hormonal blood panel.",
      descriptionTh: "ตรวจระดับฮอร์โมนแบบครบวงจร พร้อมแปลผลโดยแพทย์",
      priceFrom: null,
      priceTo: null,
      durationMin: 30,
      imageUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&q=80",
      procedureCode: null,
      displayOrder: 3,
    },
  ];

  for (const s of SERVICES) {
    const categoryId = categoryByCode[s.categoryCode];
    if (!categoryId) continue;
    await prisma.service.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: s.code } },
      update: {
        categoryId,
        name: s.name,
        nameTh: s.nameTh,
        description: s.description,
        descriptionTh: s.descriptionTh,
        priceFrom: s.priceFrom !== null ? s.priceFrom : null,
        priceTo: s.priceTo !== null ? s.priceTo : null,
        durationMin: s.durationMin,
        imageUrl: s.imageUrl,
        procedureCode: s.procedureCode,
        displayOrder: s.displayOrder,
      },
      create: {
        tenantId: tenant.id,
        categoryId,
        code: s.code,
        name: s.name,
        nameTh: s.nameTh,
        description: s.description,
        descriptionTh: s.descriptionTh,
        priceFrom: s.priceFrom !== null ? s.priceFrom : null,
        priceTo: s.priceTo !== null ? s.priceTo : null,
        durationMin: s.durationMin,
        imageUrl: s.imageUrl,
        procedureCode: s.procedureCode,
        displayOrder: s.displayOrder,
      },
    });
  }
  console.log(`  ✓ Services: ${SERVICES.length} across ${CATEGORIES.length} categories`);

  // ----- Phase O — Demo promotions -----
  // Three flavours so the UI can show realistic data right after a fresh seed.
  // Schema lives in Promotion table; the redeem flow lives in promotion service.
  const PROMOS: Array<{
    code: string;
    name: string;
    type: "VOUCHER" | "PACKAGE_DISCOUNT" | "TIER";
    config: Record<string, unknown>;
    startsAt: Date;
    endsAt: Date | null;
  }> = [
    {
      code: "WELCOME10",
      name: "Welcome 10% off (first visit)",
      type: "VOUCHER",
      config: {
        // Voucher rules. min_spend is THB; percent is 0-100; max_uses_per_patient
        // is checked at redeem time via audit-log lookup.
        kind: "percent",
        percent: 10,
        min_spend: 1000,
        max_uses_per_patient: 1,
      },
      startsAt: new Date("2025-01-01T00:00:00Z"),
      endsAt: new Date("2026-12-31T23:59:59Z"),
    },
    {
      code: "NEWYEAR2026",
      name: "New Year 2026 — flat ฿500 off",
      type: "VOUCHER",
      config: {
        kind: "amount",
        amount: 500,
        min_spend: 2000,
        max_uses_per_patient: 1,
      },
      startsAt: new Date("2025-12-15T00:00:00Z"),
      endsAt: new Date("2026-02-15T23:59:59Z"),
    },
    {
      code: "BTX-FIRST",
      name: "First-time BTX 10% bundle",
      type: "PACKAGE_DISCOUNT",
      config: {
        // Applies % off whenever the invoice contains ANY of these SKUs.
        kind: "percent",
        percent: 10,
        applies_to_skus: ["BTX-25U", "BTX-50U", "BTX-100U"],
        max_uses_per_patient: 1,
      },
      startsAt: new Date("2025-01-01T00:00:00Z"),
      endsAt: null,
    },
  ];
  for (const p of PROMOS) {
    await prisma.promotion.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
      update: {
        name: p.name,
        type: p.type,
        config: p.config as Prisma.InputJsonValue,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        active: true,
      },
      create: {
        tenantId: tenant.id,
        code: p.code,
        name: p.name,
        type: p.type,
        config: p.config as Prisma.InputJsonValue,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        active: true,
      },
    });
  }
  console.log(`  ✓ Promotions: ${PROMOS.length} (WELCOME10 / NEWYEAR2026 / BTX-FIRST)`);

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
