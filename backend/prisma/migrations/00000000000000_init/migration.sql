-- CreateTable
CREATE TABLE `api_keys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider` VARCHAR(32) NOT NULL,
    `label` VARCHAR(255) NULL,
    `key_ciphertext` LONGTEXT NOT NULL,
    `key_hint` VARCHAR(16) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `cooldown_until` DATETIME(0) NULL,
    `last_used` DATETIME(0) NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL,

    INDEX `idx_provider`(`provider`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `audited_at` DATETIME(0) NULL,
    `reachable` TINYINT NULL,
    `blocked` TINYINT NULL,
    `checks_json` LONGTEXT NULL,
    `hook_key` VARCHAR(64) NULL,
    `hook_text` TEXT NULL,
    `hook_evidence` TEXT NULL,
    `pitchable` TINYINT NULL,
    `meta_json` LONGTEXT NULL,
    `platform` VARCHAR(64) NULL,

    INDEX `idx_lead`(`lead_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_accounts` (
    `campaign_id` INTEGER NOT NULL,
    `account_id` INTEGER NOT NULL,

    PRIMARY KEY (`campaign_id`, `account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `industry` VARCHAR(255) NOT NULL,
    `city` VARCHAR(255) NOT NULL,
    `leads_per_run` INTEGER NOT NULL DEFAULT 60,
    `audits_per_run` INTEGER NOT NULL DEFAULT 60,
    `emails_per_day` INTEGER NOT NULL DEFAULT 30,
    `min_reviews` INTEGER NOT NULL DEFAULT 0,
    `require_website` TINYINT NOT NULL DEFAULT 1,
    `delay_ms` INTEGER NOT NULL DEFAULT 1500,
    `ai_provider` VARCHAR(32) NOT NULL DEFAULT 'template',
    `ai_model` VARCHAR(128) NULL,
    `pitch_rules` TEXT NULL,
    `sender_name` VARCHAR(255) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(0) NOT NULL,
    `sending_enabled` TINYINT NOT NULL DEFAULT 0,
    `track_opens` TINYINT NOT NULL DEFAULT 0,
    `track_clicks` TINYINT NOT NULL DEFAULT 0,
    `sender_email` VARCHAR(255) NULL,
    `booking_link` VARCHAR(512) NULL,
    `timezone` VARCHAR(64) NULL,
    `send_start_hour` INTEGER NOT NULL DEFAULT 0,
    `send_end_hour` INTEGER NOT NULL DEFAULT 24,
    `send_weekdays_only` TINYINT NOT NULL DEFAULT 0,
    `include_unsubscribe` TINYINT NULL,
    `source_provider` VARCHAR(32) NOT NULL DEFAULT 'google_places',
    `pagespeed_in_audit` TINYINT NOT NULL DEFAULT 0,
    `attach_report_pdf` TINYINT NOT NULL DEFAULT 0,
    `send_gap_min_sec` INTEGER NOT NULL DEFAULT 120,
    `send_gap_max_sec` INTEGER NOT NULL DEFAULT 600,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `domain` VARCHAR(512) NULL,
    `name` VARCHAR(512) NOT NULL,
    `website` VARCHAR(1024) NULL,
    `phone` VARCHAR(128) NULL,
    `address` VARCHAR(1024) NULL,
    `city` VARCHAR(255) NULL,
    `industry` VARCHAR(255) NULL,
    `rating` FLOAT NULL,
    `review_count` INTEGER NULL,
    `platform` VARCHAR(64) NULL,
    `email` VARCHAR(512) NULL,
    `email_type` VARCHAR(32) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'new',
    `tags` VARCHAR(512) NULL,
    `assigned_to` INTEGER NULL,
    `contract_value` INTEGER NULL,
    `last_activity` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uniq_domain`(`domain`),
    INDEX `idx_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(0) NOT NULL,

    INDEX `idx_company`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drafts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `audit_id` INTEGER NULL,
    `campaign_id` INTEGER NOT NULL,
    `subject` VARCHAR(512) NULL,
    `body` TEXT NULL,
    `hook_key` VARCHAR(64) NULL,
    `flags_json` LONGTEXT NULL,
    `source` VARCHAR(64) NULL,
    `created_at` DATETIME(0) NULL,
    `decision` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `final_subject` VARCHAR(512) NULL,
    `final_body` TEXT NULL,
    `decided_at` DATETIME(0) NULL,
    `preview_text` VARCHAR(255) NULL,
    `attach_pdf` TINYINT NULL,

    INDEX `idx_campaign`(`campaign_id`),
    INDEX `idx_decision`(`decision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inbox_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NULL,
    `lead_id` INTEGER NULL,
    `company_id` INTEGER NULL,
    `send_id` INTEGER NULL,
    `from_email` VARCHAR(255) NULL,
    `subject` VARCHAR(512) NULL,
    `snippet` TEXT NULL,
    `received_at` DATETIME(0) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'unread',
    `created_at` DATETIME(0) NOT NULL,

    INDEX `idx_company`(`company_id`),
    INDEX `idx_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(32) NOT NULL,
    `campaign_id` INTEGER NULL,
    `payload_json` LONGTEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'queued',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `run_after` DATETIME(0) NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `idx_status_run`(`status`, `run_after`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `place_id` VARCHAR(255) NULL,
    `name` VARCHAR(512) NOT NULL,
    `website` VARCHAR(1024) NULL,
    `domain` VARCHAR(512) NULL,
    `phone` VARCHAR(128) NULL,
    `address` VARCHAR(1024) NULL,
    `city` VARCHAR(255) NULL,
    `industry` VARCHAR(255) NULL,
    `rating` FLOAT NULL,
    `review_count` INTEGER NULL,
    `email` VARCHAR(512) NULL,
    `email_type` VARCHAR(32) NULL,
    `email_status` VARCHAR(32) NULL,
    `first_name` VARCHAR(255) NULL,
    `sourced_at` DATETIME(0) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'new',
    `company_id` INTEGER NULL,
    `score` INTEGER NULL,
    `lint_score` INTEGER NULL,

    INDEX `idx_campaign_status`(`campaign_id`, `status`),
    UNIQUE INDEX `uniq_campaign_place`(`campaign_id`, `place_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sending_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `method` VARCHAR(32) NOT NULL,
    `from_name` VARCHAR(255) NULL,
    `from_email` VARCHAR(255) NULL,
    `config_json` LONGTEXT NULL,
    `daily_cap` INTEGER NOT NULL DEFAULT 30,
    `sent_today` INTEGER NOT NULL DEFAULT 0,
    `warmup` TINYINT NOT NULL DEFAULT 0,
    `status` VARCHAR(32) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(0) NOT NULL,
    `last_reset` DATE NULL,
    `last_checked` DATETIME(0) NULL,
    `bounces_today` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sends` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `draft_id` INTEGER NOT NULL,
    `lead_id` INTEGER NOT NULL,
    `campaign_id` INTEGER NOT NULL,
    `account_id` INTEGER NULL,
    `provider_message_id` VARCHAR(255) NULL,
    `tracking_id` VARCHAR(64) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'queued',
    `scheduled_at` DATETIME(0) NULL,
    `sent_at` DATETIME(0) NULL,
    `error` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `step_no` INTEGER NOT NULL DEFAULT 1,
    `subject` VARCHAR(512) NULL,
    `body` TEXT NULL,
    `opened_at` DATETIME(0) NULL,
    `clicked_at` DATETIME(0) NULL,
    `replied_at` DATETIME(0) NULL,
    `open_count` INTEGER NOT NULL DEFAULT 0,
    `click_count` INTEGER NOT NULL DEFAULT 0,
    `subject_variant_id` INTEGER NULL,
    `preview_text` VARCHAR(255) NULL,

    INDEX `idx_status`(`status`),
    INDEX `idx_tracking`(`tracking_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sequence_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `step_no` INTEGER NOT NULL,
    `day_offset` INTEGER NOT NULL DEFAULT 0,
    `subject` VARCHAR(512) NULL,
    `body` TEXT NULL,
    `active` TINYINT NOT NULL DEFAULT 1,

    INDEX `idx_campaign`(`campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `k` VARCHAR(128) NOT NULL,
    `v` TEXT NULL,

    PRIMARY KEY (`k`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subject_variants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `subject` VARCHAR(512) NOT NULL,
    `active` TINYINT NOT NULL DEFAULT 1,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `replied_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL,

    INDEX `idx_campaign`(`campaign_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppression` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `value` VARCHAR(255) NOT NULL,
    `kind` VARCHAR(8) NOT NULL DEFAULT 'email',
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uniq_value`(`value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracking_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `send_id` INTEGER NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `url` VARCHAR(1024) NULL,
    `ip` VARCHAR(64) NULL,
    `ua` VARCHAR(512) NULL,
    `created_at` DATETIME(0) NOT NULL,

    INDEX `idx_send`(`send_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `role` VARCHAR(16) NOT NULL DEFAULT 'admin',
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `last_login` DATETIME(0) NULL,

    UNIQUE INDEX `email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `content_json` LONGTEXT NULL,
    `pagespeed_json` LONGTEXT NULL,
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `lead_id`(`lead_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

