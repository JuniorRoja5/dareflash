-- CreateTable
CREATE TABLE `Withdrawal` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `metodo` VARCHAR(191) NOT NULL,
    `datosPago` TEXT NOT NULL,
    `pista` VARCHAR(16) NOT NULL,
    `red` VARCHAR(16) NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `procesadaPorId` VARCHAR(191) NULL,
    `procesadaEn` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Withdrawal_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Withdrawal_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    INDEX `Withdrawal_status_createdAt_id_idx`(`status`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
