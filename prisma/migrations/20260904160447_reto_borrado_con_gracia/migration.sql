-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `eliminacionProgramadaEn` DATETIME(3) NULL;
