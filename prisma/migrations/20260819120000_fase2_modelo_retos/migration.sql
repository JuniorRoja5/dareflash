-- Fase 2: cimiento de datos de retos. Añade a Challenge: slug + publicCode (URL), rules, winnersCount,
-- maxVotesPerUser. Patrón del username: nullable -> backfill -> NOT NULL + UNIQUE.

-- 1) Columnas nuevas nullables (slug/publicCode) + las de default/nullable (sin backfill).
ALTER TABLE `Challenge`
  ADD COLUMN `slug` VARCHAR(191) NULL,
  ADD COLUMN `publicCode` VARCHAR(191) NULL,
  ADD COLUMN `rules` TEXT NULL,
  ADD COLUMN `winnersCount` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `maxVotesPerUser` INTEGER NOT NULL DEFAULT 1;

-- 2) Backfill de filas existentes. En producción la tabla Challenge está VACÍA (aún no hay flujo de
--    creación) -> afecta a 0 filas; es defensivo por si hubiera filas (seed/legacy):
--    · slug: derivado del título en SQL (minúsculas, no-alfanumérico -> '-', sin guiones en extremos).
--      Los retos NUEVOS lo generan en la app con `slugDesdeTitulo` (que además quita acentos).
--    · publicCode: determinista y único desde el `id` (ya único). Los retos NUEVOS usan el generador
--      base32 con reintento (server/services/reto-codigo).
UPDATE `Challenge` SET
  `slug` = TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(`title`, '[^a-zA-Z0-9]+', '-'))),
  `publicCode` = LEFT(SHA2(`id`, 224), 8)
WHERE `publicCode` IS NULL;

-- Salvaguarda: si el título no dejó ningún carácter válido, el slug quedaría vacío -> usa el publicCode.
UPDATE `Challenge` SET `slug` = `publicCode` WHERE `slug` IS NULL OR `slug` = '';

-- 3) NOT NULL en ambos + UNIQUE(publicCode).
ALTER TABLE `Challenge`
  MODIFY `slug` VARCHAR(191) NOT NULL,
  MODIFY `publicCode` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Challenge_publicCode_key` ON `Challenge`(`publicCode`);
