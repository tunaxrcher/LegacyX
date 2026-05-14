/**
 * LegacyX — Initial seed
 * Creates: 1 Tenant, 2 Branches, system Roles + Permissions, 1 Admin user,
 *          a few Products, a sample Procedure BOM, and 1 demo Patient.
 *
 * Run: pnpm db:seed
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

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

const PERMISSIONS: { resource: string; action: string; scope: string }[] = [
  // Identity
  { resource: "user", action: "read", scope: "tenant" },
  { resource: "user", action: "write", scope: "tenant" },
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
];

const ROLE_MATRIX: Record<string, string[]> = {
  ADMIN: PERMISSIONS.map((p) => `${p.resource}:${p.action}:${p.scope}`),
  MANAGER: [
    "user:read:tenant",
    "patient:read:branch",
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
  const DEMO_USERS: Array<{
    email: string;
    fullName: string;
    password: string;
    roleCode: string;
  }> = [
    {
      email: "admin@legacyx.local",
      fullName: "System Administrator",
      password: "admin123!",
      roleCode: "ADMIN",
    },
    {
      email: "manager@legacyx.local",
      fullName: "Manda Manager",
      password: "manager123!",
      roleCode: "MANAGER",
    },
    {
      email: "doctor@legacyx.local",
      fullName: "Dr. Daniel Doctor",
      password: "doctor123!",
      roleCode: "DOCTOR",
    },
    {
      email: "nurse@legacyx.local",
      fullName: "Nina Nurse",
      password: "nurse123!",
      roleCode: "NURSE",
    },
    {
      email: "reception@legacyx.local",
      fullName: "Rita Reception",
      password: "reception123!",
      roleCode: "RECEPTION",
    },
    {
      email: "pharmacist@legacyx.local",
      fullName: "Phil Pharmacist",
      password: "pharmacist123!",
      roleCode: "PHARMACIST",
    },
  ];

  for (const du of DEMO_USERS) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: tenant.id, code: du.roleCode } },
    });
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: du.email } },
      update: {
        passwordHash: hashPassword(du.password),
        status: "ACTIVE",
        fullName: du.fullName,
      },
      create: {
        tenantId: tenant.id,
        email: du.email,
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
    console.log(`  ✓ User: ${du.email} (${du.roleCode}) / ${du.password}`);
  }

  const admin = await prisma.user.findUniqueOrThrow({
    where: {
      tenantId_email: { tenantId: tenant.id, email: "admin@legacyx.local" },
    },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: tenant.id, code: "ADMIN" } },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });
  for (const b of branches) {
    await prisma.userBranchAccess.upsert({
      where: { userId_branchId: { userId: admin.id, branchId: b.id } },
      update: {},
      create: { userId: admin.id, branchId: b.id },
    });
  }
  console.log(`  ✓ Admin user: admin@legacyx.local / admin123!`);

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

  // ----- Sample Patient -----
  await prisma.patient.upsert({
    where: { tenantId_hn: { tenantId: tenant.id, hn: "HN-0000001" } },
    update: { lineUserId: "U_demo_line_0000001" },
    create: {
      tenantId: tenant.id,
      hn: "HN-0000001",
      firstName: "Demo",
      lastName: "Patient",
      gender: "FEMALE",
      dob: new Date("1990-05-15"),
      homeBranchId: branches[0]!.id,
      lineUserId: "U_demo_line_0000001",
      status: "ACTIVE",
    },
  });
  console.log(`  ✓ Demo Patient: HN-0000001 (LINE: U_demo_line_0000001)`);

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
