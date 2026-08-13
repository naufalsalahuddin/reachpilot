-- AlterTable
ALTER TABLE `campaigns` ADD COLUMN `flow_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `jobs` ADD COLUMN `node_id` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `leads` ADD COLUMN `flow_node_id` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `sends` ADD COLUMN `flow_node_id` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `flows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `graph_json` LONGTEXT NOT NULL,
    `is_template` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_flow` ON `campaigns`(`flow_id`);

-- CreateIndex
CREATE INDEX `idx_campaign_flow_node` ON `leads`(`campaign_id`, `flow_node_id`);

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_flow_id_fkey` FOREIGN KEY (`flow_id`) REFERENCES `flows`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
