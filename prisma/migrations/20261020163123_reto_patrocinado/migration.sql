-- RETO PATROCINADO POR UNA MARCA (Fase 9 · P1).
--
-- ADITIVA Y SIN BACKFILL: `esPatrocinado = false` es lo que los retos existentes YA eran, y los dos
-- campos de la marca son NULL porque no hay marca. El unico con valor es `comisionBps`, y su
-- DEFAULT 2500 en filas que no son patrocinadas no significa nada: la comision solo se calcula
-- cuando `esPatrocinado` es cierto (ver `lib/comision` y la vista de contabilidad).
--
-- SIN INDICE, por ahora a proposito: la unica consulta que filtra por `esPatrocinado` es la de
-- contabilidad del panel, que la hace un admin sobre decenas de filas. Un indice aqui seria coste
-- de escritura en cada reto para una lectura que no esta en ningun camino caliente.
-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `comisionBps` INTEGER NOT NULL DEFAULT 2500,
    ADD COLUMN `esPatrocinado` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sponsorLogo` VARCHAR(191) NULL,
    ADD COLUMN `sponsorNombre` VARCHAR(191) NULL;
