-- ============================================================================================
-- PRECONDICION DEL DESPLIEGUE: CERO BOOSTS VIGENTES AL MIGRAR
-- ============================================================================================
-- Esta migracion NO reparte las apariciones que ya estuvieran vigentes: les pone `carril = 0` por
-- el DEFAULT y no les da plaza en `BoostPlaza`. Las consecuencias, mientras les quede hora de vida:
--
--   - todas en el carril 0: saldrian en portada solo cuando abra ese carril, y como mucho cinco
--     de ellas (hay cinco plazas por carril), asi que alguna podria no salir en lo que le queda;
--   - sin plaza ocupada: el cupo las cuenta como si no existieran, y durante esa hora podria haber
--     mas de `BOOST_MAX_SIMULTANEOS` destacados a la vez.
--
-- Ninguna de las dos corrompe nada y las dos se curan solas en una hora, pero hay que mirarlo
-- ANTES de migrar, no despues:
--
--   SELECT COUNT(*) FROM BoostActivation WHERE expiresAt > NOW();   -- tiene que dar 0
--
-- Si diera > 0, lo barato es esperar a que caduquen (maximo una hora) y migrar entonces.
-- Comprobado el 2026-11-03: en produccion hay 0.
-- ============================================================================================

-- AlterTable
ALTER TABLE `BoostActivation` ADD COLUMN `carril` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `BoostPlaza` (
    `id` VARCHAR(191) NOT NULL,
    `carril` INTEGER NOT NULL,
    `posicion` INTEGER NOT NULL,
    `libreDesde` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `activacionId` VARCHAR(191) NULL,

    INDEX `BoostPlaza_libreDesde_posicion_carril_idx`(`libreDesde`, `posicion`, `carril`),
    UNIQUE INDEX `BoostPlaza_carril_posicion_key`(`carril`, `posicion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- LAS 60 PLAZAS, en su migracion: el cupo global no es una comprobacion, son
-- estas filas. No puede haber mas destacados a la vez que plazas, y eso no depende de que nadie se
-- acuerde de comprobar nada. `libreDesde` en la epoca = libre desde siempre.
--
-- Si algun dia cambia `BOOST_MAX_SIMULTANEOS`, hay que anadir o quitar filas aqui con una
-- migracion nueva; `tests/boost-cupo` se pone rojo si las dos cifras dejan de cuadrar.
INSERT INTO `BoostPlaza` (`id`, `carril`, `posicion`, `libreDesde`) VALUES
  ('c0-p0', 0, 0, '1970-01-01 00:00:00.000'),
  ('c1-p0', 1, 0, '1970-01-01 00:00:00.000'),
  ('c2-p0', 2, 0, '1970-01-01 00:00:00.000'),
  ('c3-p0', 3, 0, '1970-01-01 00:00:00.000'),
  ('c4-p0', 4, 0, '1970-01-01 00:00:00.000'),
  ('c5-p0', 5, 0, '1970-01-01 00:00:00.000'),
  ('c6-p0', 6, 0, '1970-01-01 00:00:00.000'),
  ('c7-p0', 7, 0, '1970-01-01 00:00:00.000'),
  ('c8-p0', 8, 0, '1970-01-01 00:00:00.000'),
  ('c9-p0', 9, 0, '1970-01-01 00:00:00.000'),
  ('c10-p0', 10, 0, '1970-01-01 00:00:00.000'),
  ('c11-p0', 11, 0, '1970-01-01 00:00:00.000'),
  ('c0-p1', 0, 1, '1970-01-01 00:00:00.000'),
  ('c1-p1', 1, 1, '1970-01-01 00:00:00.000'),
  ('c2-p1', 2, 1, '1970-01-01 00:00:00.000'),
  ('c3-p1', 3, 1, '1970-01-01 00:00:00.000'),
  ('c4-p1', 4, 1, '1970-01-01 00:00:00.000'),
  ('c5-p1', 5, 1, '1970-01-01 00:00:00.000'),
  ('c6-p1', 6, 1, '1970-01-01 00:00:00.000'),
  ('c7-p1', 7, 1, '1970-01-01 00:00:00.000'),
  ('c8-p1', 8, 1, '1970-01-01 00:00:00.000'),
  ('c9-p1', 9, 1, '1970-01-01 00:00:00.000'),
  ('c10-p1', 10, 1, '1970-01-01 00:00:00.000'),
  ('c11-p1', 11, 1, '1970-01-01 00:00:00.000'),
  ('c0-p2', 0, 2, '1970-01-01 00:00:00.000'),
  ('c1-p2', 1, 2, '1970-01-01 00:00:00.000'),
  ('c2-p2', 2, 2, '1970-01-01 00:00:00.000'),
  ('c3-p2', 3, 2, '1970-01-01 00:00:00.000'),
  ('c4-p2', 4, 2, '1970-01-01 00:00:00.000'),
  ('c5-p2', 5, 2, '1970-01-01 00:00:00.000'),
  ('c6-p2', 6, 2, '1970-01-01 00:00:00.000'),
  ('c7-p2', 7, 2, '1970-01-01 00:00:00.000'),
  ('c8-p2', 8, 2, '1970-01-01 00:00:00.000'),
  ('c9-p2', 9, 2, '1970-01-01 00:00:00.000'),
  ('c10-p2', 10, 2, '1970-01-01 00:00:00.000'),
  ('c11-p2', 11, 2, '1970-01-01 00:00:00.000'),
  ('c0-p3', 0, 3, '1970-01-01 00:00:00.000'),
  ('c1-p3', 1, 3, '1970-01-01 00:00:00.000'),
  ('c2-p3', 2, 3, '1970-01-01 00:00:00.000'),
  ('c3-p3', 3, 3, '1970-01-01 00:00:00.000'),
  ('c4-p3', 4, 3, '1970-01-01 00:00:00.000'),
  ('c5-p3', 5, 3, '1970-01-01 00:00:00.000'),
  ('c6-p3', 6, 3, '1970-01-01 00:00:00.000'),
  ('c7-p3', 7, 3, '1970-01-01 00:00:00.000'),
  ('c8-p3', 8, 3, '1970-01-01 00:00:00.000'),
  ('c9-p3', 9, 3, '1970-01-01 00:00:00.000'),
  ('c10-p3', 10, 3, '1970-01-01 00:00:00.000'),
  ('c11-p3', 11, 3, '1970-01-01 00:00:00.000'),
  ('c0-p4', 0, 4, '1970-01-01 00:00:00.000'),
  ('c1-p4', 1, 4, '1970-01-01 00:00:00.000'),
  ('c2-p4', 2, 4, '1970-01-01 00:00:00.000'),
  ('c3-p4', 3, 4, '1970-01-01 00:00:00.000'),
  ('c4-p4', 4, 4, '1970-01-01 00:00:00.000'),
  ('c5-p4', 5, 4, '1970-01-01 00:00:00.000'),
  ('c6-p4', 6, 4, '1970-01-01 00:00:00.000'),
  ('c7-p4', 7, 4, '1970-01-01 00:00:00.000'),
  ('c8-p4', 8, 4, '1970-01-01 00:00:00.000'),
  ('c9-p4', 9, 4, '1970-01-01 00:00:00.000'),
  ('c10-p4', 10, 4, '1970-01-01 00:00:00.000'),
  ('c11-p4', 11, 4, '1970-01-01 00:00:00.000');
