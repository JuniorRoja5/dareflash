-- Fase 2: portada opcional de reto. Columna nullable (sin backfill): los retos existentes quedan sin
-- portada (NULL) -> la tarjeta usa el placeholder.

-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `coverImage` VARCHAR(191) NULL;
