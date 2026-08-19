-- Fase 2 · M3: permiso de crear retos por-usuario. Columna con default (sin backfill): las filas
-- existentes quedan en FALSE (hoy solo el ADMIN crea; el ADMIN no depende del flag, ver permisos.ts).

-- AlterTable
ALTER TABLE `User` ADD COLUMN `puedeCrearRetos` BOOLEAN NOT NULL DEFAULT false;
