-- MODERACIÓN POSTERIOR DE LA PUBLICIDAD (Fase 9 · P8): auto-oculto por umbral, absolución y retirada
-- del admin. Columnas nuevas vacías en todas las filas: ninguna campaña estaba moderada antes.

-- AlterTable
ALTER TABLE `Publicidad` ADD COLUMN `descartadoEn` DATETIME(3) NULL,
    ADD COLUMN `ocultoAutoEn` DATETIME(3) NULL,
    ADD COLUMN `retiradaEn` DATETIME(3) NULL,
    ADD COLUMN `retiradaMotivo` VARCHAR(191) NULL,
    ADD COLUMN `retiradaNota` VARCHAR(500) NULL,
    ADD COLUMN `retiradaPor` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Publicidad_estado_createdAt_id_idx` ON `Publicidad`(`estado`, `createdAt`, `id`);

-- CreateIndex
CREATE INDEX `Publicidad_ocultoAutoEn_idx` ON `Publicidad`(`ocultoAutoEn`);
