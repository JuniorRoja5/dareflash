-- Fase 9 · P10: las cifras de cada campana por dia (vistas y clics), materializadas desde Redis.

-- CreateTable
CREATE TABLE `PublicidadMetricaDia` (
    `publicidadId` VARCHAR(191) NOT NULL,
    `dia` DATE NOT NULL,
    `vistas` INTEGER NOT NULL DEFAULT 0,
    `clics` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`publicidadId`, `dia`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PublicidadMetricaDia` ADD CONSTRAINT `PublicidadMetricaDia_publicidadId_fkey` FOREIGN KEY (`publicidadId`) REFERENCES `Publicidad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
