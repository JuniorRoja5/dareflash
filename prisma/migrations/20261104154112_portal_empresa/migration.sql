-- ============================================================================================
-- PORTAL DE EMPRESA (Fase 9 · P1): la cuenta de empresa y su verificacion MANUAL.
-- ============================================================================================
-- SIN BACKFILL Y SIN PRECONDICION. Es una tabla nueva y nadie tenia empresa antes: la ausencia de
-- filas YA significa lo correcto. No hay nada que mirar en produccion antes de migrar.
--
-- `ownerUserId` UNIQUE = una persona, una empresa. Es la guarda de idempotencia del alta: un doble
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
-- LO QUE NO TRAE, a proposito: `saldoCreditos` (lo estrena P4, con su ledger) y `ciudadId` (lo
-- estrena P5, cuando exista el catalogo de ciudades). Una columna que nadie escribe es una columna
-- que alguien lee creyendo que significa algo. En P1 la ciudad de un negocio FISICO viaja dentro de
-- `direccion`, que es dato de CONTACTO y no segmenta nada.
-- ============================================================================================

-- CreateTable
CREATE TABLE `Empresa` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `tipoCuenta` VARCHAR(191) NOT NULL,
    `tipoNegocio` VARCHAR(191) NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'PENDIENTE',
    `webUrl` VARCHAR(300) NULL,
    `direccion` VARCHAR(200) NULL,
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
