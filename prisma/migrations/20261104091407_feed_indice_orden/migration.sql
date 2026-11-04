-- CreateIndex
CREATE INDEX `Video_status_ocultoAutoEn_reemplazaSubmissionId_createdAt_id_idx` ON `Video`(`status`, `ocultoAutoEn`, `reemplazaSubmissionId`, `createdAt`, `id`);

-- ============================================================================================
-- LAS ESTADISTICAS, AQUI MISMO. El indice de arriba NO SIRVE SOLO.
-- ============================================================================================
-- Medido sobre 6.000 videos y 2.000 usuarios: con el indice y sin estadisticas la consulta del
-- feed sigue tardando 34 ms y arrancando por `User` con filesort — el optimizador IGNORA el
-- indice. El motivo es que `User_deletedAt_idx` cubre el 99 % de la tabla (casi nadie esta
-- borrado) y, sin estadisticas de columna, el optimizador lo lee como un rango estrecho.
--
-- Con las dos piezas: 1,1 ms, arrancando por `Video` y sin filesort.
--
-- VA EN LA MIGRACION y no en un paso manual para que no haya un despliegue en el que el indice
-- exista y las estadisticas no: ese estado es el PEOR de los tres (pagas la escritura del indice
-- y no te llevas nada). `use_stat_tables` ya viene en PREFERABLY_FOR_QUERIES por defecto en
-- MariaDB 11.8, asi que en cuanto existan se usan, sin tocar la configuracion del servidor.
--
-- Solo las CUATRO tablas que deciden este plan, no la base entera. Coste medido: ~300 ms en
-- total con ese volumen, y no se aprecio bloqueo de escrituras.
--
-- Se recalculan periodicamente en el worker (ver `analizarTablasDelFeed`): son una foto y
-- caducan segun crecen los datos.
ANALYZE TABLE `Video` PERSISTENT FOR ALL;
ANALYZE TABLE `User` PERSISTENT FOR ALL;
ANALYZE TABLE `Submission` PERSISTENT FOR ALL;
ANALYZE TABLE `Challenge` PERSISTENT FOR ALL;
