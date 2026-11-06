-- Fase 9 · P9: el cobro diario de la publicidad.

-- AlterTable: el dia de campana que cobra (CONSUMO) o devuelve (DEVOLUCION) cada movimiento.
ALTER TABLE `CreditoLedger` ADD COLUMN `dia` DATE NULL,
    ADD COLUMN `publicidadId` VARCHAR(191) NULL;

-- CreateIndex: un cobro y una devolucion, como mucho, por campana y dia.
CREATE UNIQUE INDEX `CreditoLedger_publicidadId_dia_reason_key` ON `CreditoLedger`(`publicidadId`, `dia`, `reason`);

-- AddForeignKey
ALTER TABLE `CreditoLedger` ADD CONSTRAINT `CreditoLedger_publicidadId_fkey` FOREIGN KEY (`publicidadId`) REFERENCES `Publicidad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- EL PRIMER DIA QUE SE COBRA: el SIGUIENTE al de esta migracion (en UTC, la zona de los dias de la
-- ocupacion). Los dias mostrados antes de P9 no se cobran nunca (acordado en P6/P7), y el de hoy ya se
-- ha mostrado en parte gratis: tampoco. Lo fija la BASE al desplegar, no una fecha escrita en el codigo,
-- porque nadie sabe en el codigo que dia se despliega. Lo lee `inicioDelCobro`.
INSERT IGNORE INTO `SystemState` (`key`, `value`, `updatedAt`)
VALUES ('publicidad.cobro-desde', DATE_FORMAT(UTC_DATE() + INTERVAL 1 DAY, '%Y-%m-%d'), NOW(3));
