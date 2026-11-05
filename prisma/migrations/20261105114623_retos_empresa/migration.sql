-- FASE 9 · P3 — retos patrocinados propuestos desde el portal de empresa.
--
-- Solo AÑADE: una columna nullable en Challenge (empresaId), la tabla RetoSolicitud y sus indices.
-- SIN BACKFILL, y es correcto: todos los retos de antes, y los patrocinados que el admin crea a mano
-- para marcas sin cuenta, NO tienen empresa (NULL), y no existe ninguna propuesta previa.

-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `empresaId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `RetoSolicitud` (
    `id` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'PENDIENTE',
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `rules` TEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `prizeAmountCents` INTEGER NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `deadline` DATETIME(3) NOT NULL,
    `winnersCount` INTEGER NOT NULL,
    `sponsorLogo` VARCHAR(191) NULL,
    `motivoRechazo` VARCHAR(191) NULL,
    `notaInterna` VARCHAR(500) NULL,
    `revisadaPor` VARCHAR(191) NULL,
    `revisadaEn` DATETIME(3) NULL,
    `challengeId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RetoSolicitud_challengeId_key`(`challengeId`),
    INDEX `RetoSolicitud_estado_createdAt_id_idx`(`estado`, `createdAt`, `id`),
    INDEX `RetoSolicitud_empresaId_createdAt_id_idx`(`empresaId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Challenge_empresaId_createdAt_id_idx` ON `Challenge`(`empresaId`, `createdAt`, `id`);

-- AddForeignKey
ALTER TABLE `Challenge` ADD CONSTRAINT `Challenge_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `Empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RetoSolicitud` ADD CONSTRAINT `RetoSolicitud_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `Empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RetoSolicitud` ADD CONSTRAINT `RetoSolicitud_challengeId_fkey` FOREIGN KEY (`challengeId`) REFERENCES `Challenge`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
