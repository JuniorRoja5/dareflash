-- CreateTable
CREATE TABLE `Announcement` (
    `id` VARCHAR(191) NOT NULL,
    `texto` VARCHAR(500) NOT NULL,
    `audiencia` VARCHAR(191) NOT NULL DEFAULT 'TODOS',
    `targetCount` INTEGER NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Announcement_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Announcement_createdAt_id_idx`(`createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Notification_refType_refId_idx` ON `Notification`(`refType`, `refId`);

-- CreateIndex
CREATE INDEX `Notification_createdAt_id_idx` ON `Notification`(`createdAt`, `id`);
