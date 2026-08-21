-- Fase 2 (2c): categoria de video LIBRE (subida sin reto). Columna nullable (sin backfill): las
-- participaciones y los videos libres antiguos quedan con NULL. La categoria de una participacion es la
-- del RETO (via Submission->Challenge): fuente unica, NO se duplica aqui. La usan solo los videos libres.

-- AlterTable
ALTER TABLE `Video` ADD COLUMN `category` VARCHAR(191) NULL;
