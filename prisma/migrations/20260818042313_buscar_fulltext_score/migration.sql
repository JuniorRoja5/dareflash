-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `scoreAutoridad` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `scoreAutoridad` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Challenge_scoreAutoridad_idx` ON `Challenge`(`scoreAutoridad`);

-- CreateIndex
CREATE FULLTEXT INDEX `Challenge_title_idx` ON `Challenge`(`title`);

-- CreateIndex
CREATE INDEX `User_scoreAutoridad_idx` ON `User`(`scoreAutoridad`);

-- CreateIndex
CREATE FULLTEXT INDEX `User_username_displayName_idx` ON `User`(`username`, `displayName`);
