-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `closedAt` DATETIME(3) NULL,
    ADD COLUMN `minParticipaciones` INTEGER NULL,
    ADD COLUMN `motivoCierre` VARCHAR(191) NULL,
    ADD COLUMN `premiadosEn` DATETIME(3) NULL;
