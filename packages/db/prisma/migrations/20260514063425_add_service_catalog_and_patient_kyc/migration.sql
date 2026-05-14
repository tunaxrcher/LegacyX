-- AlterTable
ALTER TABLE `patients` ADD COLUMN `kyc_image_url` VARCHAR(191) NULL,
    ADD COLUMN `phone_hash` VARCHAR(191) NULL,
    ADD COLUMN `verification_status` ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'UNVERIFIED';

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

-- CreateIndex
CREATE INDEX `patients_tenant_id_phone_hash_idx` ON `patients`(`tenant_id`, `phone_hash`);

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
