-- POR QUE se retiro una participacion: MODERACION (bloquea re-participar) o DUENO (no bloquea).
--
-- Antes esto se DEDUCIA de `Video.status = 'REMOVED'`, al que se llega por los dos caminos, asi que
-- borrar tu propio video te vetaba del reto para siempre. Con este campo el estado ambiguo deja de
-- ser representable: o hay motivo explicito, o la participacion no esta retirada.

ALTER TABLE `Submission`
  ADD COLUMN `retiradaMotivo` ENUM('MODERACION', 'DUENO') NULL,
  ADD COLUMN `retiradaEn` DATETIME(3) NULL;

-- ---------------------------------------------------------------------------------------------
-- BACKFILL — basado en EVIDENCIA, no en una suposicion.
--
-- Las filas que ya existen no llevan motivo, pero SI se puede saber cual fue: el unico camino que
-- ponia `Submission.status = 'REMOVED'` era `retirarParticipacion`, o sea la retirada de un ADMIN.
-- El borrado del dueno solo tocaba el Video y dejaba la Submission intacta. Asi que:
--
--   Submission.status = 'REMOVED'  ->  hubo moderacion  ->  MODERACION (sigue bloqueando, correcto)
--   cualquier otro estado         ->  no hay evidencia  ->  NULL (no bloquea a nadie)
--
-- El segundo caso incluye a quien borro su propio video (Submission viva apuntando a un Video
-- REMOVED), que es justo a quien habia que desbloquear. Y en el peor caso —una retirada de
-- moderacion que por algun camino no marcase la Submission— el error seria DEJAR PARTICIPAR a
-- alguien, no vetarlo: se elige equivocarse del lado que no castiga a un inocente, y un admin
-- siempre puede volver a retirar.
--
-- `retiradaEn` se rellena con `updatedAt`, que es lo mas cercano al instante de la retirada que
-- consta en la fila. Es una aproximacion y se marca como tal: sirve para auditar, no para contar
-- plazos.
UPDATE `Submission`
SET `retiradaMotivo` = 'MODERACION', `retiradaEn` = `updatedAt`
WHERE `status` = 'REMOVED';

-- Se consulta al iniciar una participacion ("¿puede volver a participar?").
CREATE INDEX `Submission_retiradaMotivo_idx` ON `Submission`(`retiradaMotivo`);
