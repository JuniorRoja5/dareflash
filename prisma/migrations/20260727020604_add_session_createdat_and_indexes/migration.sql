-- AlterTable
ALTER TABLE `Session` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE INDEX `Session_userId_createdAt_idx` ON `Session`(`userId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Session_expires_idx` ON `Session`(`expires`);
