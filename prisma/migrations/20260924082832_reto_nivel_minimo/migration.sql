-- NIVEL MINIMO PARA PARTICIPAR. Una columna y nada mas.
--
-- SIN BACKFILL, y no es un olvido: el DEFAULT 'rookie' se aplica a las filas que ya existen, y rookie
-- es el nivel de cero puntos, o sea "todos". Los retos de antes quedan exactamente como eran: sin
-- restriccion. Es el mismo razonamiento que `minParticipaciones` (ver su comentario en el esquema):
-- cuando la ausencia YA significa lo correcto, rellenar seria inventarse una decision que nadie tomo.
--
-- AlterTable
ALTER TABLE `Challenge` ADD COLUMN `nivelMinimo` VARCHAR(191) NOT NULL DEFAULT 'rookie';
