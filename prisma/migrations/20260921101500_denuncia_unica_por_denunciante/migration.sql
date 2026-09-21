-- CreateIndex
CREATE UNIQUE INDEX `Report_reporterId_targetType_targetId_key` ON `Report`(`reporterId`, `targetType`, `targetId`);
