-- AlterTable
ALTER TABLE `User` ADD COLUMN `victoriasTotales` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `User_createdAt_id_idx` ON `User`(`createdAt`, `id`);

-- CreateIndex
CREATE INDEX `User_pointsBalance_id_idx` ON `User`(`pointsBalance`, `id`);

-- CreateIndex
CREATE INDEX `User_victoriasTotales_id_idx` ON `User`(`victoriasTotales`, `id`);

-- CreateIndex
CREATE INDEX `User_bannedAt_idx` ON `User`(`bannedAt`);

-- RELLENO DEL CACHE. Sin esto, todo el que ya habia ganado un reto aparece con 0 victorias hasta que
-- vuelva a ganar: la columna es un CACHE de `ChallengeResult`, y un cache que arranca mintiendo es
-- peor que no tenerlo. Se escribe el VALOR ABSOLUTO contado, el mismo que escribira despues
-- `recontarVictoriasTotales`, asi que volver a pasar por aqui daria el mismo numero.
-- Solo se tocan las filas que tienen resultados; al resto ya le vale el DEFAULT 0.
UPDATE `User` u
JOIN (SELECT userId, COUNT(*) AS n FROM `ChallengeResult` GROUP BY userId) g ON g.userId = u.id
SET u.victoriasTotales = g.n;
