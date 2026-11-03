-- DropIndex
DROP INDEX `BoostActivation_startsAt_expiresAt_idx` ON `BoostActivation`;

-- CreateIndex
CREATE INDEX `BoostActivation_expiresAt_userId_startsAt_idx` ON `BoostActivation`(`expiresAt`, `userId`, `startsAt`);
