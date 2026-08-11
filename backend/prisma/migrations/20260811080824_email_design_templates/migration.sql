-- AlterTable
ALTER TABLE `campaigns` ADD COLUMN `email_template_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `email_templates` ADD COLUMN `html` LONGTEXT NULL;
