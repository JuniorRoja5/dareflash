-- FASE 9 · P3 — el reto de una empresa se publica cuando se recibe el pago.
--
-- Solo AÑADE una columna nullable (Challenge.pagoRecibidoEn). SIN BACKFILL: ningun reto anterior
-- tiene empresa, y para los que no la tienen la columna no significa nada.

-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `pagoRecibidoEn` DATETIME(3) NULL;
