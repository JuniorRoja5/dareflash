-- Fase 2 (2b): reemplazo robusto de participacion. Columna nullable (sin backfill): los videos
-- existentes quedan con NULL (video normal). Un Video de REEMPLAZO apunta aqui a la Submission que
-- sustituira; se crea SIN Submission propia, asi respeta el @@unique([challengeId,userId]). Mientras
-- este seteado el video NO sale en el feed; el swap (cliente o worker) lo repunta y limpia el puntero.

-- AlterTable
ALTER TABLE `Video` ADD COLUMN `reemplazaSubmissionId` VARCHAR(191) NULL;

-- CreateIndex (el worker busca PUBLISHED con este puntero seteado para completar reemplazos abandonados)
CREATE INDEX `Video_reemplazaSubmissionId_idx` ON `Video`(`reemplazaSubmissionId`);
