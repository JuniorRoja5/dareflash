-- PUBLICIDAD (Fase 9 · P6): la campaña, sus países, su radio desplegado y su calendario (ocupación).
-- Arranca a cero LEGÍTIMAMENTE: antes de esta migración no existían ni las campañas ni su calendario,
-- así que no hay backfill que buscar (la regla de la casa sobre cachés no aplica: aquí no hay caché).

-- CreateTable
CREATE TABLE `Publicidad` (
    `id` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'BORRADOR',
    `nombre` VARCHAR(80) NOT NULL,
    `alcance` VARCHAR(191) NOT NULL,
    `ciudadId` INTEGER NULL,
    `estadoCodigo` VARCHAR(20) NULL,
    `imagen` VARCHAR(300) NULL,
    `texto` VARCHAR(125) NOT NULL,
    `destinoUrl` VARCHAR(300) NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `diasContratados` INTEGER NOT NULL,
    `creditosPorDia` INTEGER NULL,
    `activadaEn` DATETIME(3) NULL,
    `pausadaEn` DATETIME(3) NULL,
    `terminadaEn` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Publicidad_empresaId_createdAt_id_idx`(`empresaId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicidadPais` (
    `publicidadId` VARCHAR(191) NOT NULL,
    `paisIso` CHAR(2) NOT NULL,

    INDEX `PublicidadPais_paisIso_idx`(`paisIso`),
    PRIMARY KEY (`publicidadId`, `paisIso`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicidadCiudad` (
    `publicidadId` VARCHAR(191) NOT NULL,
    `ciudadId` INTEGER NOT NULL,

    INDEX `PublicidadCiudad_ciudadId_idx`(`ciudadId`),
    PRIMARY KEY (`publicidadId`, `ciudadId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZonaOcupacion` (
    `id` VARCHAR(191) NOT NULL,
    `zonaClave` VARCHAR(40) NOT NULL,
    `dia` DATE NOT NULL,
    `posicion` INTEGER NOT NULL,
    `publicidadId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ZonaOcupacion_dia_idx`(`dia`),
    UNIQUE INDEX `ZonaOcupacion_zonaClave_dia_posicion_key`(`zonaClave`, `dia`, `posicion`),
    UNIQUE INDEX `ZonaOcupacion_publicidadId_zonaClave_dia_key`(`publicidadId`, `zonaClave`, `dia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Publicidad` ADD CONSTRAINT `Publicidad_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `Empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Publicidad` ADD CONSTRAINT `Publicidad_ciudadId_fkey` FOREIGN KEY (`ciudadId`) REFERENCES `Ciudad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicidadPais` ADD CONSTRAINT `PublicidadPais_publicidadId_fkey` FOREIGN KEY (`publicidadId`) REFERENCES `Publicidad`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicidadCiudad` ADD CONSTRAINT `PublicidadCiudad_publicidadId_fkey` FOREIGN KEY (`publicidadId`) REFERENCES `Publicidad`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZonaOcupacion` ADD CONSTRAINT `ZonaOcupacion_publicidadId_fkey` FOREIGN KEY (`publicidadId`) REFERENCES `Publicidad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
