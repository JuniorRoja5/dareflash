-- DropIndex
DROP INDEX `PointsLedger_userId_idx` ON `PointsLedger`;

-- AlterTable
ALTER TABLE `PointsLedger` ADD COLUMN `nota` VARCHAR(500) NULL;

-- CreateIndex
CREATE INDEX `PointsLedger_userId_createdAt_id_idx` ON `PointsLedger`(`userId`, `createdAt`, `id`);
