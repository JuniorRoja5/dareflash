-- FASE 9 · P4 — creditos de publicidad: saldo en Empresa + CreditoLedger (solo insercion).
--
-- Ademas del esquema, esta migracion RELLENA (backfill, al final): las empresas que ya estaban
-- verificadas antes de esta pieza reciben AQUI su regalo de Socio Fundador. Sin esto se castigaria
-- a las primeras, justo las que el regalo quiere premiar. Ver el bloque BACKFILL.

-- AlterTable
ALTER TABLE `Empresa` ADD COLUMN `creditosSaldo` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `CreditoLedger` (
    `id` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `refType` VARCHAR(191) NULL,
    `refId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `nota` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CreditoLedger_idempotencyKey_key`(`idempotencyKey`),
    INDEX `CreditoLedger_empresaId_createdAt_id_idx`(`empresaId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CreditoLedger` ADD CONSTRAINT `CreditoLedger_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `Empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- BACKFILL ------------------------------------------------------------------------------------------
-- EL REGALO DE SOCIO FUNDADOR para las empresas que ya estaban verificadas.
--
-- QUIEN: toda empresa con `verificadaEn` anterior o igual al cierre del regalo. El instante es
-- SOCIO_FUNDADOR_HASTA_ISO = 2027-06-30T23:59:59.999+02:00 (Madrid) = 2027-06-30 21:59:59.999 UTC, que
-- es como guarda Prisma las fechas. `verificadaEn` se sella UNA vez (la primera verificacion), asi que
-- una empresa verificada y luego rechazada tambien lo tuvo: el regalo es por haberse verificado a tiempo.
--
-- IDEMPOTENTE Y CONVERGENTE, como lo exige el resto de ledgers del repositorio:
--  - `INSERT IGNORE` contra la UNIQUE de `idempotencyKey`, y la clave es la MISMA que usa la app
--    (`socio-fundador:<empresaId>`): si esto corre dos veces, o si la app ya lo acredito, no se duplica;
--  - el saldo se escribe con el VALOR RECONTADO desde el ledger, nunca con un incremento: re-ejecutar
--    converge al mismo numero.
-- El `id` es determinista (no hay generador de cuid en SQL). `tests/creditos` ejecuta este bloque.
INSERT IGNORE INTO `CreditoLedger` (`id`, `empresaId`, `delta`, `reason`, `refType`, `refId`, `idempotencyKey`, `createdAt`)
SELECT
  CONCAT('sf', LEFT(SHA2(CONCAT('socio-fundador:', e.`id`), 256), 23)),
  e.`id`,
  90,
  'SOCIO_FUNDADOR',
  'EMPRESA',
  e.`id`,
  CONCAT('socio-fundador:', e.`id`),
  e.`verificadaEn`
FROM `Empresa` e
WHERE e.`verificadaEn` IS NOT NULL
  AND e.`verificadaEn` <= '2027-06-30 21:59:59.999';

UPDATE `Empresa` e
SET e.`creditosSaldo` = (
  SELECT COALESCE(SUM(l.`delta`), 0) FROM `CreditoLedger` l WHERE l.`empresaId` = e.`id`
);
