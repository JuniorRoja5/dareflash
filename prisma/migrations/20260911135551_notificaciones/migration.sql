-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `refType` VARCHAR(191) NOT NULL,
    `refId` VARCHAR(191) NOT NULL,
    `datos` JSON NULL,
    `leidaEn` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    INDEX `Notification_userId_leidaEn_idx`(`userId`, `leidaEn`),
    UNIQUE INDEX `Notification_userId_tipo_refType_refId_key`(`userId`, `tipo`, `refType`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
