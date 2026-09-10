-- CreateTable
CREATE TABLE `RankingMensual` (
    `id` VARCHAR(191) NOT NULL,
    `periodo` CHAR(7) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `victorias` INTEGER NOT NULL DEFAULT 0,
    `actualizadoEn` DATETIME(3) NOT NULL,

    INDEX `RankingMensual_periodo_victorias_userId_idx`(`periodo`, `victorias`, `userId`),
    UNIQUE INDEX `RankingMensual_periodo_userId_key`(`periodo`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
