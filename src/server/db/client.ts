import "server-only";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { DB_CONNECTION_LIMIT } from "@/config/constants";
import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente Prisma como SINGLETON (patron globalThis).
 *
 * Por que singleton: en desarrollo, el hot-reload de Next reevalua los modulos
 * en cada cambio. Sin este patron se crearia un PrismaClient nuevo (y un pool
 * nuevo) en cada recarga, agotando el limite de conexiones del plan compartido.
 * Guardando la instancia en `globalThis`, todas las recargas reutilizan la misma.
 *
 * REGLA DE ACCESO (ver src/config/env.ts): este modulo lee `env.DATABASE_URL` y
 * es `server-only`. Solo debe importarse desde codigo de servidor que corre POR
 * PETICION (route handlers, server actions, servicios de `src/server/**`), nunca
 * en el ambito de modulo de algo bajo `src/app/**` que se prerenderice: se
 * evaluaria durante `next build`, donde Hostinger no tiene variables.
 * `npm run test:build-sin-env` vigila que no ocurra.
 */
function createPrismaClient(): PrismaClient {
  const url = new URL(env.DATABASE_URL);

  // Prisma 7 se conecta con un driver adapter. Construimos el pool con un
  // `connectionLimit` EXPLICITO (no el `connection_limit` de la URL, que usa el
  // CLI de migraciones): el pool del runtime es cosa nuestra y debe ser bajo.
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: DB_CONNECTION_LIMIT,
    // Todo en UTC: la conexion no debe reinterpretar fechas segun zona horaria.
    timezone: "Z",
  });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

// Solo se cachea en global fuera de produccion: en produccion cada instancia
// del servidor crea su cliente una vez y no hay hot-reload.
if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
