-- Fase 11 · PC: se retira el cobro en cripto. El unico metodo es BANK y las columnas `red` sobran.
--
-- ANTES DE BORRAR, SE COMPRUEBA. Un DROP COLUMN no se deshace, y si alguna fila no es BANK (o tiene
-- una red escrita) borrar la columna seria perder a donde iba ese dinero. Asi que la migracion se
-- NIEGA a correr y lo dice, en vez de borrar: alguien tiene que decidir que hacer con esa fila.
-- En produccion, el 18 nov 2026: 1 metodo y 3 retiradas, todos BANK y con `red` vacia.
--
-- El bloque va PRIMERO y entero antes de cualquier ALTER: en MariaDB cada ALTER confirma solo, asi
-- que una comprobacion que corriera entre los dos dejaria uno borrado y el otro no.
BEGIN NOT ATOMIC
  IF EXISTS (SELECT 1 FROM `PaymentMethod` WHERE `metodo` <> 'BANK' OR `red` IS NOT NULL)
     OR EXISTS (SELECT 1 FROM `Withdrawal` WHERE `metodo` <> 'BANK' OR `red` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'quitar_red_cripto: hay metodos o retiradas que no son BANK; no se borra nada';
  END IF;
END;

-- AlterTable
ALTER TABLE `PaymentMethod` DROP COLUMN `red`;

-- AlterTable
ALTER TABLE `Withdrawal` DROP COLUMN `red`;
