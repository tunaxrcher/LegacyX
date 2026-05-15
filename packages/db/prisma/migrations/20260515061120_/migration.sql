-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `plan` VARCHAR(191) NULL,
    `settings` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Bangkok',
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `branches_tenant_id_status_idx`(`tenant_id`, `status`),
    UNIQUE INDEX `branches_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `phone_hash` VARCHAR(191) NULL,
    `primary_role_code` VARCHAR(191) NULL,
    `password_hash` VARCHAR(191) NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `avatar_url` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `mfa_enabled` BOOLEAN NOT NULL DEFAULT false,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `users_tenant_id_phone_hash_idx`(`tenant_id`, `phone_hash`),
    INDEX `users_tenant_id_status_idx`(`tenant_id`, `status`),
    UNIQUE INDEX `users_tenant_id_phone_primary_role_code_key`(`tenant_id`, `phone`, `primary_role_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `roles_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(191) NOT NULL,
    `resource` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `permissions_resource_action_scope_key`(`resource`, `action`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` VARCHAR(191) NOT NULL,
    `permission_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_branch_access` (
    `user_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`user_id`, `branch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `user_agent` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_token_hash_key`(`token_hash`),
    INDEX `sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `resource_type` VARCHAR(191) NOT NULL,
    `resource_id` VARCHAR(191) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `reason` TEXT NULL,
    `correlation_id` VARCHAR(191) NULL,
    `ip` VARCHAR(191) NULL,
    `user_agent` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_tenant_id_branch_id_created_at_idx`(`tenant_id`, `branch_id`, `created_at`),
    INDEX `audit_logs_resource_type_resource_id_idx`(`resource_type`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `break_glass_overrides` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `actor_user_id` VARCHAR(191) NOT NULL,
    `approved_by` VARCHAR(191) NOT NULL,
    `resource_type` VARCHAR(191) NOT NULL,
    `resource_id` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `payload` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `break_glass_overrides_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `document_type` VARCHAR(191) NOT NULL,
    `document_version` VARCHAR(191) NOT NULL,
    `content_hash` VARCHAR(191) NOT NULL,
    `signed_at` DATETIME(3) NOT NULL,
    `signed_by_name` VARCHAR(191) NOT NULL,
    `signature_url` VARCHAR(191) NULL,
    `pdf_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consent_snapshots_tenant_id_patient_id_idx`(`tenant_id`, `patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patients` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `hn` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(191) NOT NULL,
    `last_name` VARCHAR(191) NOT NULL,
    `nickname_enc` VARCHAR(191) NULL,
    `national_id_enc` VARCHAR(191) NULL,
    `dob` DATETIME(3) NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED') NULL,
    `phone_enc` VARCHAR(191) NULL,
    `email_enc` VARCHAR(191) NULL,
    `blood_type` VARCHAR(191) NULL,
    `allergies` JSON NULL,
    `chronic_conditions` JSON NULL,
    `home_branch_id` VARCHAR(191) NULL,
    `line_user_id` VARCHAR(191) NULL,
    `line_display_name` VARCHAR(191) NULL,
    `line_picture_url` TEXT NULL,
    `line_linked_at` DATETIME(3) NULL,
    `line_notifications_opt_in` BOOLEAN NOT NULL DEFAULT true,
    `line_friend_status` ENUM('UNKNOWN', 'FRIEND', 'BLOCKED') NOT NULL DEFAULT 'UNKNOWN',
    `kyc_image_url` VARCHAR(191) NULL,
    `verification_status` ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'UNVERIFIED',
    `phone_hash` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'MERGED') NOT NULL DEFAULT 'ACTIVE',
    `merged_into_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `patients_tenant_id_last_name_first_name_idx`(`tenant_id`, `last_name`, `first_name`),
    INDEX `patients_tenant_id_phone_hash_idx`(`tenant_id`, `phone_hash`),
    UNIQUE INDEX `patients_tenant_id_hn_key`(`tenant_id`, `hn`),
    UNIQUE INDEX `patients_tenant_id_line_user_id_key`(`tenant_id`, `line_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patient_line_link_states` (
    `state` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `code_verifier` TEXT NOT NULL,
    `redirect_uri` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,

    INDEX `patient_line_link_states_expires_at_idx`(`expires_at`),
    INDEX `patient_line_link_states_patient_id_idx`(`patient_id`),
    PRIMARY KEY (`state`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patient_merge_logs` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `from_patient_id` VARCHAR(191) NOT NULL,
    `into_patient_id` VARCHAR(191) NOT NULL,
    `performed_by` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `diff` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patient_photos` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `visit_id` VARCHAR(191) NULL,
    `kind` ENUM('KYC_ID', 'KYC_SELFIE', 'BEFORE', 'AFTER', 'PROCEDURE', 'OTHER') NOT NULL,
    `storage_key` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `region` VARCHAR(191) NULL,
    `analysis` JSON NULL,
    `note` TEXT NULL,
    `uploaded_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `patient_photos_tenant_id_patient_id_kind_idx`(`tenant_id`, `patient_id`, `kind`),
    INDEX `patient_photos_tenant_id_visit_id_idx`(`tenant_id`, `visit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emrs` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `visit_id` VARCHAR(191) NULL,
    `current_version` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('DRAFT', 'SIGNED', 'AMENDED') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `emrs_visit_id_key`(`visit_id`),
    INDEX `emrs_tenant_id_branch_id_patient_id_idx`(`tenant_id`, `branch_id`, `patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emr_versions` (
    `id` VARCHAR(191) NOT NULL,
    `emr_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `content_enc` LONGTEXT NOT NULL,
    `content_hash` VARCHAR(191) NOT NULL,
    `signed_by` VARCHAR(191) NULL,
    `signed_at` DATETIME(3) NULL,
    `amendment_of` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `emr_versions_emr_id_version_key`(`emr_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lab_orders` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `visit_id` VARCHAR(191) NOT NULL,
    `ordered_by` VARCHAR(191) NOT NULL,
    `panel` VARCHAR(191) NOT NULL,
    `status` ENUM('ORDERED', 'COLLECTED', 'PROCESSING', 'RESULTED', 'CANCELLED') NOT NULL DEFAULT 'ORDERED',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lab_orders_tenant_id_patient_id_status_idx`(`tenant_id`, `patient_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lab_results` (
    `id` VARCHAR(191) NOT NULL,
    `lab_order_id` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `file_url` VARCHAR(191) NULL,
    `resulted_at` DATETIME(3) NOT NULL,
    `resulted_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `appointments` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `doctor_id` VARCHAR(191) NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `duration_min` INTEGER NOT NULL DEFAULT 30,
    `channel` ENUM('WALKIN', 'ONLINE', 'LIFF', 'PHONE') NOT NULL DEFAULT 'WALKIN',
    `status` ENUM('BOOKED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'BOOKED',
    `reason` TEXT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `appointments_tenant_id_branch_id_scheduled_at_idx`(`tenant_id`, `branch_id`, `scheduled_at`),
    INDEX `appointments_tenant_id_patient_id_status_idx`(`tenant_id`, `patient_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visits` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `appointment_id` VARCHAR(191) NULL,
    `checked_in_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `visits_tenant_id_branch_id_status_idx`(`tenant_id`, `branch_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resources` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `type` ENUM('ROOM', 'MACHINE', 'THERAPIST', 'LASER', 'OTHER') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 1,
    `attributes` JSON NULL,
    `status` ENUM('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RETIRED') NOT NULL DEFAULT 'AVAILABLE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `resources_tenant_id_branch_id_type_status_idx`(`tenant_id`, `branch_id`, `type`, `status`),
    UNIQUE INDEX `resources_tenant_id_branch_id_code_key`(`tenant_id`, `branch_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resource_reservations` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `resource_id` VARCHAR(191) NOT NULL,
    `appointment_id` VARCHAR(191) NULL,
    `procedure_id` VARCHAR(191) NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `status` ENUM('HELD', 'CONFIRMED', 'RELEASED', 'CONSUMED') NOT NULL DEFAULT 'HELD',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `resource_reservations_resource_id_starts_at_ends_at_idx`(`resource_id`, `starts_at`, `ends_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resource_maintenance` (
    `id` VARCHAR(191) NOT NULL,
    `resource_id` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NULL,
    `performed_by` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `visit_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `ordered_by` VARCHAR(191) NOT NULL,
    `status` ENUM('CREATED', 'CONFIRMED', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'CREATED',
    `total_amount` DECIMAL(12, 2) NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `orders_tenant_id_branch_id_status_idx`(`tenant_id`, `branch_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `item_type` ENUM('PROCEDURE', 'PRODUCT', 'MEDICATION', 'COURSE', 'OTHER') NOT NULL,
    `ref_id` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `metadata` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `procedures` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `performed_by` VARCHAR(191) NULL,
    `assisted_by` JSON NULL,
    `procedure_code` VARCHAR(191) NOT NULL,
    `status` ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` TEXT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `procedures_tenant_id_branch_id_status_idx`(`tenant_id`, `branch_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pharmacy_dispenses` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PREPARING', 'READY', 'DISPENSED', 'CANCELLED') NOT NULL DEFAULT 'PREPARING',
    `prepared_by` VARCHAR(191) NULL,
    `dispensed_by` VARCHAR(191) NULL,
    `dispensed_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pharmacy_dispenses_tenant_id_branch_id_status_idx`(`tenant_id`, `branch_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `doctor_fees` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `procedure_id` VARCHAR(191) NOT NULL,
    `doctor_id` VARCHAR(191) NOT NULL,
    `fee_amount` DECIMAL(12, 2) NOT NULL,
    `commission_pct` DECIMAL(5, 2) NULL,
    `status` ENUM('ACCRUED', 'SETTLED', 'REVERSED') NOT NULL DEFAULT 'ACCRUED',
    `settled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `visit_id` VARCHAR(191) NULL,
    `order_id` VARCHAR(191) NULL,
    `number` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'VOIDED') NOT NULL DEFAULT 'DRAFT',
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `tax` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'THB',
    `voided_at` DATETIME(3) NULL,
    `void_reason` TEXT NULL,
    `issued_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `invoices_tenant_id_branch_id_status_idx`(`tenant_id`, `branch_id`, `status`),
    UNIQUE INDEX `invoices_tenant_id_number_key`(`tenant_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `invoice_id` VARCHAR(191) NOT NULL,
    `method` ENUM('CASH', 'CARD', 'QR_PROMPTPAY', 'TRANSFER', 'WALLET', 'OTHER') NOT NULL,
    `state` ENUM('AUTHORIZED', 'COMPLETED', 'SETTLED', 'FAILED', 'REFUNDED', 'VOIDED') NOT NULL DEFAULT 'AUTHORIZED',
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'THB',
    `gateway` VARCHAR(191) NULL,
    `gateway_ref` VARCHAR(191) NULL,
    `authorized_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `settled_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `refund_of_id` VARCHAR(191) NULL,
    `failure_reason` TEXT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payments_tenant_id_branch_id_state_idx`(`tenant_id`, `branch_id`, `state`),
    INDEX `payments_gateway_ref_idx`(`gateway_ref`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `balance` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wallet_accounts_tenant_id_patient_id_idx`(`tenant_id`, `patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `wallet_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `entry_type` ENUM('PURCHASE', 'USE', 'REVERSAL', 'ADJUSTMENT', 'EXPIRY') NOT NULL,
    `delta` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `ref_type` VARCHAR(191) NULL,
    `ref_id` VARCHAR(191) NULL,
    `reversal_of_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NULL,

    INDEX `wallet_ledger_tenant_id_wallet_id_created_at_idx`(`tenant_id`, `wallet_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promotions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('TIER', 'BUNDLE', 'PACKAGE_DISCOUNT', 'VOUCHER') NOT NULL,
    `config` JSON NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `promotions_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('MEDICATION', 'SUPPLY', 'DEVICE', 'COSMETIC', 'COURSE', 'OTHER') NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'pcs',
    `track_stock` BOOLEAN NOT NULL DEFAULT true,
    `reorder_level` INTEGER NOT NULL DEFAULT 0,
    `attributes` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `products_tenant_id_category_idx`(`tenant_id`, `category`),
    UNIQUE INDEX `products_tenant_id_sku_key`(`tenant_id`, `sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_categories` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `name_th` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `description_th` TEXT NULL,
    `image_url` VARCHAR(191) NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `service_categories_tenant_id_active_display_order_idx`(`tenant_id`, `active`, `display_order`),
    UNIQUE INDEX `service_categories_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `services` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `category_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `name_th` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `description_th` TEXT NULL,
    `price_from` DECIMAL(12, 2) NULL,
    `price_to` DECIMAL(12, 2) NULL,
    `duration_min` INTEGER NOT NULL DEFAULT 30,
    `image_url` VARCHAR(191) NULL,
    `procedure_code` VARCHAR(191) NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `services_tenant_id_category_id_active_display_order_idx`(`tenant_id`, `category_id`, `active`, `display_order`),
    UNIQUE INDEX `services_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `boms` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `owner_type` ENUM('PROCEDURE', 'PRODUCT') NOT NULL,
    `owner_ref` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `boms_tenant_id_owner_type_owner_ref_idx`(`tenant_id`, `owner_type`, `owner_ref`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bom_items` (
    `id` VARCHAR(191) NOT NULL,
    `bom_id` VARCHAR(191) NOT NULL,
    `component_product_id` VARCHAR(191) NOT NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'pcs',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `entry_type` ENUM('RECEIVE', 'DISPENSE', 'BOM_USAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'REVERSAL', 'EXPIRY') NOT NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `balance_after` DECIMAL(12, 3) NOT NULL,
    `unit_cost` DECIMAL(12, 2) NULL,
    `lot_no` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NULL,
    `ref_type` VARCHAR(191) NULL,
    `ref_id` VARCHAR(191) NULL,
    `reversal_of_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_ledger_tenant_id_branch_id_product_id_created_at_idx`(`tenant_id`, `branch_id`, `product_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_reconciliations` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `system_qty` DECIMAL(12, 3) NOT NULL,
    `counted_qty` DECIMAL(12, 3) NOT NULL,
    `variance` DECIMAL(12, 3) NOT NULL,
    `reason` TEXT NULL,
    `override_id` VARCHAR(191) NULL,
    `performed_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_reconciliations_tenant_id_branch_id_product_id_idx`(`tenant_id`, `branch_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `type` ENUM('CONSENT', 'MEDICAL_CERT', 'E_RECEIPT', 'TAX_INVOICE', 'PRESCRIPTION', 'REPORT', 'OTHER') NOT NULL,
    `ref_type` VARCHAR(191) NULL,
    `ref_id` VARCHAR(191) NULL,
    `template_code` VARCHAR(191) NOT NULL,
    `template_version` VARCHAR(191) NOT NULL,
    `storage_key` VARCHAR(191) NOT NULL,
    `content_hash` VARCHAR(191) NOT NULL,
    `status` ENUM('REQUESTED', 'GENERATED', 'FAILED', 'ARCHIVED') NOT NULL DEFAULT 'GENERATED',
    `signed_url` VARCHAR(191) NULL,
    `signed_url_exp` DATETIME(3) NULL,
    `generated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `documents_tenant_id_ref_type_ref_id_idx`(`tenant_id`, `ref_type`, `ref_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_logs` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `channel` ENUM('LINE', 'SMS', 'EMAIL', 'PUSH', 'IN_APP') NOT NULL,
    `template_code` VARCHAR(191) NOT NULL,
    `recipient_ref` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `provider_ref` VARCHAR(191) NULL,
    `attempt` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `sent_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_logs_tenant_id_status_channel_idx`(`tenant_id`, `status`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_drafts` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `type` ENUM('INTAKE_SUMMARY', 'VOICE_TO_NOTE', 'VISION_REPORT') NOT NULL,
    `ref_type` VARCHAR(191) NULL,
    `ref_id` VARCHAR(191) NULL,
    `input_hash` VARCHAR(191) NOT NULL,
    `model_name` VARCHAR(191) NOT NULL,
    `model_version` VARCHAR(191) NOT NULL,
    `draft` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EDITED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_drafts_tenant_id_ref_type_ref_id_idx`(`tenant_id`, `ref_type`, `ref_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_approval_logs` (
    `id` VARCHAR(191) NOT NULL,
    `draft_id` VARCHAR(191) NOT NULL,
    `reviewed_by` VARCHAR(191) NOT NULL,
    `action` ENUM('APPROVE', 'REJECT', 'EDIT_AND_APPROVE') NOT NULL,
    `diff` JSON NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_events` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `event_name` VARCHAR(191) NOT NULL,
    `event_version` VARCHAR(191) NOT NULL DEFAULT 'v1',
    `event_id` VARCHAR(191) NOT NULL,
    `correlation_id` VARCHAR(191) NULL,
    `causation_id` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `metadata` JSON NOT NULL,
    `status` ENUM('PENDING', 'DISPATCHED', 'FAILED', 'DEAD') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dispatched_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `outbox_events_event_id_key`(`event_id`),
    INDEX `outbox_events_status_available_at_idx`(`status`, `available_at`),
    INDEX `outbox_events_tenant_id_event_name_created_at_idx`(`tenant_id`, `event_name`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `processed_events` (
    `event_id` VARCHAR(191) NOT NULL,
    `handler_name` VARCHAR(191) NOT NULL,
    `status` ENUM('SUCCESS', 'FAILED') NOT NULL,
    `result_hash` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`event_id`, `handler_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dead_letters` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NULL,
    `queue_name` VARCHAR(191) NOT NULL,
    `event_name` VARCHAR(191) NOT NULL,
    `event_id` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `metadata` JSON NOT NULL,
    `error` TEXT NOT NULL,
    `attempts` INTEGER NOT NULL,
    `status` ENUM('NEW', 'REPLAYED', 'DISCARDED') NOT NULL DEFAULT 'NEW',
    `reprocessed_at` DATETIME(3) NULL,
    `reprocessed_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dead_letters_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shifts` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `opened_by` VARCHAR(191) NOT NULL,
    `closed_by` VARCHAR(191) NULL,
    `opened_at` DATETIME(3) NOT NULL,
    `closed_at` DATETIME(3) NULL,
    `cash_opening` DECIMAL(12, 2) NOT NULL,
    `cash_counted` DECIMAL(12, 2) NULL,
    `cash_expected` DECIMAL(12, 2) NULL,
    `variance` DECIMAL(12, 2) NULL,
    `notes` TEXT NULL,

    INDEX `shifts_tenant_id_branch_id_opened_at_idx`(`tenant_id`, `branch_id`, `opened_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `branches_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_branch_access` ADD CONSTRAINT `user_branch_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_snapshots` ADD CONSTRAINT `consent_snapshots_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_merge_logs` ADD CONSTRAINT `patient_merge_logs_from_patient_id_fkey` FOREIGN KEY (`from_patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_merge_logs` ADD CONSTRAINT `patient_merge_logs_into_patient_id_fkey` FOREIGN KEY (`into_patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_photos` ADD CONSTRAINT `patient_photos_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emrs` ADD CONSTRAINT `emrs_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emrs` ADD CONSTRAINT `emrs_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emr_versions` ADD CONSTRAINT `emr_versions_emr_id_fkey` FOREIGN KEY (`emr_id`) REFERENCES `emrs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_results` ADD CONSTRAINT `lab_results_lab_order_id_fkey` FOREIGN KEY (`lab_order_id`) REFERENCES `lab_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visits` ADD CONSTRAINT `visits_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visits` ADD CONSTRAINT `visits_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resource_reservations` ADD CONSTRAINT `resource_reservations_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resource_reservations` ADD CONSTRAINT `resource_reservations_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resource_maintenance` ADD CONSTRAINT `resource_maintenance_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procedures` ADD CONSTRAINT `procedures_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `doctor_fees` ADD CONSTRAINT `doctor_fees_procedure_id_fkey` FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ledger` ADD CONSTRAINT `wallet_ledger_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ledger` ADD CONSTRAINT `wallet_ledger_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `boms` ADD CONSTRAINT `boms_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bom_items` ADD CONSTRAINT `bom_items_bom_id_fkey` FOREIGN KEY (`bom_id`) REFERENCES `boms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bom_items` ADD CONSTRAINT `bom_items_component_product_id_fkey` FOREIGN KEY (`component_product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_approval_logs` ADD CONSTRAINT `ai_approval_logs_draft_id_fkey` FOREIGN KEY (`draft_id`) REFERENCES `ai_drafts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
