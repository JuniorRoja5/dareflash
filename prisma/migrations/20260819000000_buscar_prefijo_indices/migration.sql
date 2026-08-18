-- Índices btree para el PREFIJO izquierda-anclado (`col LIKE 'x%'`), que SÍ usa índice. Los FULLTEXT
-- existentes (User username/displayName, Challenge title) se MANTIENEN: son índices distintos y
-- conviven. El de Challenge lleva nombre explícito para no chocar con el FULLTEXT del mismo `title`.

-- CreateIndex
CREATE INDEX `User_displayName_idx` ON `User`(`displayName`);

-- CreateIndex
CREATE INDEX `Challenge_title_btree_idx` ON `Challenge`(`title`);
