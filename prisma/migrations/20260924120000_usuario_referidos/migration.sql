-- REFERIDOS: el codigo de invitacion propio y quien te invito.
--
-- Escrita A MANO y no por `migrate dev`: anadir una columna NOT NULL + UNIQUE a una tabla con filas
-- exige decidir que valor reciben esas filas, y esa decision es justo el relleno de abajo.

-- 1. Las dos columnas, de momento NULL: no se puede poner NOT NULL antes de rellenar.
ALTER TABLE `User` ADD COLUMN `referralCode` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `referredById` VARCHAR(191) NULL;

-- 2. RELLENO de las cuentas que ya existian. Sin esto no podrian invitar a nadie: su enlace no
--    existiria, y la columna es obligatoria a partir de aqui.
--
--    DERIVADO DEL ID, no aleatorio: en SQL no hay forma razonable de generar base32 por fila, y un
--    `RAND()` no garantiza unicidad. El hash del id SI la garantiza (el id es unico y la funcion es
--    determinista), y ademas hace el relleno REPETIBLE: volver a ejecutarlo da el mismo valor.
--
--    Los dos REPLACE mapean los unicos caracteres hexadecimales que NO estan en el alfabeto base32
--    del proyecto (sin confusos: fuera l, o, 0, 1) a dos que si lo estan. El mapeo es INYECTIVO
--    —'w' y 'x' no aparecen en hexadecimal, asi que cada salida vuelve a una unica entrada—, o sea
--    que no puede fabricar colisiones que el hash no tuviera ya.
--
--    Si aun asi dos hashes chocaran, el UNIQUE del paso 4 hace fallar la migracion ENTERA y en voz
--    alta. Es lo correcto: mejor un despliegue detenido que dos personas compartiendo enlace.
UPDATE `User`
SET `referralCode` = REPLACE(REPLACE(SUBSTRING(SHA2(CONCAT('ref:', `id`), 256), 1, 12), '0', 'w'), '1', 'x')
WHERE `referralCode` IS NULL;

-- 3. Ya con valor en todas las filas, la columna pasa a ser obligatoria.
ALTER TABLE `User` MODIFY `referralCode` VARCHAR(191) NOT NULL;

-- 4. CreateIndex
CREATE UNIQUE INDEX `User_referralCode_key` ON `User`(`referralCode`);

-- 5. CreateIndex: "a quien he invitado yo" es la unica consulta por esta columna.
CREATE INDEX `User_referredById_idx` ON `User`(`referredById`);
