-- Backfill: todo `username` NULL recibe un handle unico y determinista derivado del `id` (cuid, ya
-- unico y no-nulo). `user_` + cuid cumple el formato `^[a-z0-9._]{3,30}$` (cuid es [a-z0-9], <=25 chars).
UPDATE `User` SET `username` = CONCAT('user_', `id`) WHERE `username` IS NULL;

-- AlterTable: `username` pasa a NOT NULL (el UNIQUE `User_username_key` se mantiene). A partir de aqui
-- el handle es ESTRUCTURALMENTE obligatorio: toda alta lo asigna (ver server/auth/handle.ts).
ALTER TABLE `User` MODIFY `username` VARCHAR(191) NOT NULL;
