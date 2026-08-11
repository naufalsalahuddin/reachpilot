-- AlterTable
ALTER TABLE `companies` ADD COLUMN `country` VARCHAR(128) NULL,
    ADD COLUMN `postal_code` VARCHAR(32) NULL,
    ADD COLUMN `state` VARCHAR(128) NULL,
    ADD COLUMN `street` VARCHAR(512) NULL;

-- CreateTable
CREATE TABLE `email_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(512) NULL,
    `body` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
