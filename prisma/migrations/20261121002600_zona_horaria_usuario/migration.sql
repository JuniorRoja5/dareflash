-- Fase 11 · P2: la zona horaria del usuario, para MOSTRAR horas (nunca para calcular dias).
--
-- ADITIVA A PROPOSITO: columna nueva y NULL, sin DEFAULT ni relleno. NULL es "no la sabemos" —la
-- verdad para todas las cuentas de hoy—, y la escribe la propia app en la siguiente visita de cada
-- usuario (`validateSession`). Por eso el codigo anterior arranca igual sobre esta base: no lee la
-- columna ni la exige, y una vuelta atras no tiene que deshacer nada.
-- AlterTable
ALTER TABLE `User` ADD COLUMN `zonaHoraria` VARCHAR(64) NULL;
