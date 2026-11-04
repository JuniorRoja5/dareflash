-- ============================================================================================
-- PORTAL DE EMPRESA (Fase 9 · P1): la cuenta de empresa, su verificacion MANUAL, y el candado
-- de que una cuenta de empresa NO PARTICIPA.
-- ============================================================================================
-- SIN PRECONDICION. Tabla nueva y columna nueva: no hay nada que mirar en produccion antes de
-- migrar. Y el alta de una empresa crea SIEMPRE una cuenta desde cero, asi que ninguna cuenta
-- existente cambia de naturaleza al desplegar esto.
--
-- `ownerUserId` UNIQUE = una cuenta, una empresa. Es la guarda de idempotencia del alta: un doble
-- clic o dos pestañas no crean dos empresas, lo impide el indice y no un `if` en el servicio.
--
-- FK con ON DELETE RESTRICT, como `Subscription` y el resto del material comercial: borrar la
-- cuenta no se lleva por delante una empresa con historial.
--
-- EL INDICE [estado, createdAt, id] ES LA COLA DEL PANEL: filtra por estado y pagina por keyset
-- sobre (createdAt, id), los dos DESC. El `id` va detras porque el keyset necesita un orden TOTAL
-- —sin el, dos empresas registradas en el mismo milisegundo se repetirian entre paginas— y las tres
-- columnas en el MISMO indice es lo que hace que filtrar y ordenar sea una sola pasada.
--
-- `User.esCuentaEmpresa` ES UN CACHE de "tiene fila en Empresa", y por eso esta migracion lo
-- RELLENA desde `Empresa` en vez de dejarlo todo a `false`. Hoy no hay ni una empresa y el UPDATE
-- no toca nada; se escribe igual porque un cache que arranca a cero miente sin que nada falle, y
-- porque asi reejecutar la migracion sobre una base con datos converge. Es columna y no JOIN
-- porque se lee en CADA peticion autenticada (dentro de `validateSession`).
--
-- LO QUE NO TRAE, a proposito: `saldoCreditos` (lo estrena P4, con su ledger) y `ciudadId` (P5,
-- cuando exista el catalogo de ciudades). Una columna que nadie escribe es una columna que alguien
-- lee creyendo que significa algo. Hasta P5 la ciudad es TEXTO LIBRE y solo sirve para verificar.
-- ============================================================================================

-- CreateTable
CREATE TABLE `Empresa` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `tipoCuenta` VARCHAR(191) NOT NULL,
    `tipoNegocio` VARCHAR(191) NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'PENDIENTE',
    `paisIso` CHAR(2) NOT NULL,
    `ciudadTexto` VARCHAR(120) NULL,
    `personaContacto` VARCHAR(120) NOT NULL,
    `webUrl` VARCHAR(300) NULL,
    `redes` VARCHAR(300) NULL,
    `direccion` VARCHAR(200) NULL,
    `fiscalId` VARCHAR(60) NULL,
    `fiscalPaisIso` CHAR(2) NULL,
    `verificadaEn` DATETIME(3) NULL,
    `verificadaPor` VARCHAR(191) NULL,
    `motivoRechazo` VARCHAR(191) NULL,
    `notaInterna` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Empresa_ownerUserId_key`(`ownerUserId`),
    INDEX `Empresa_estado_createdAt_id_idx`(`estado`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Empresa` ADD CONSTRAINT `Empresa_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: la marca que lee `validateSession` en cada peticion.
ALTER TABLE `User` ADD COLUMN `esCuentaEmpresa` BOOLEAN NOT NULL DEFAULT false;

-- Backfill del cache desde la verdad (hoy, cero filas; la regla es la regla).
UPDATE `User` `u`
   JOIN `Empresa` `e` ON `e`.`ownerUserId` = `u`.`id`
   SET `u`.`esCuentaEmpresa` = true;
