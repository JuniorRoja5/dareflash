-- CreateIndex
CREATE INDEX `AuditLog_action_createdAt_id_idx` ON `AuditLog`(`action`, `createdAt`, `id`);

-- CreateIndex
CREATE INDEX `Withdrawal_createdAt_id_idx` ON `Withdrawal`(`createdAt`, `id`);
