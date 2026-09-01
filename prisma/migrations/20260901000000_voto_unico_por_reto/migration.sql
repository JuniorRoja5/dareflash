-- FASE 3 · el voto pasa a ser UNO POR RETO (antes: uno por participacion).
--
-- Se puede aplicar sin cuidado especial: la votacion aun no existe, asi que `Vote` esta VACIA y el
-- UNIQUE nuevo no puede chocar con datos previos. `Challenge.maxVotesPerUser` se elimina con todas
-- sus filas al valor por defecto (1), asi que no hay informacion que perder: nadie llego a
-- configurarlo distinto porque el codigo nunca lo aplico.

-- El unique viejo (un voto por PARTICIPACION) deja de valer: ahora la regla es por RETO.
DROP INDEX `Vote_userId_submissionId_key` ON `Vote`;

-- Este indice lo absorbe el UNIQUE nuevo (mismas columnas, mismo orden): mantenerlo seria pagar
-- dos veces por la misma estructura en cada escritura.
DROP INDEX `Vote_userId_challengeId_idx` ON `Vote`;

-- LA REGLA, en la base de datos: un voto por usuario y reto.
CREATE UNIQUE INDEX `Vote_userId_challengeId_key` ON `Vote`(`userId`, `challengeId`);

-- La politica configurable de votos por reto se retira: la regla es fija (ver el comentario del
-- modelo Vote). Relajarla el dia que haya un evento multivoto es anadir columna, no quitarla.
ALTER TABLE `Challenge` DROP COLUMN `maxVotesPerUser`;
