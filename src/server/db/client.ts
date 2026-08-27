import "server-only";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { DB_ACQUIRE_TIMEOUT_MS, DB_MINIMUM_IDLE } from "@/config/constants";
import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente Prisma como SINGLETON (patron globalThis) y PEREZOSO (patron Proxy, igual
 * que `env`).
 *
 * Por que perezoso: importar este modulo NO debe construir nada ni leer `env`. El
 * cliente (y con el la lectura de `env.DATABASE_URL`) se crea en el PRIMER acceso real a
 * una propiedad de `prisma`, que siempre ocurre por peticion. Asi, aunque alguien importe
 * `prisma` de forma ESTATICA desde una cadena que Next evalua en `next build` (recogida de
 * datos de pagina), no se lee ninguna variable y el build no revienta. Esto elimina una
 * clase entera de fallo: antes bastaba un import estatico nuevo para tumbar el despliegue
 * (Hostinger/Docker compilan sin variables). `npm run test:build-sin-env` lo vigila.
 *
 * Por que singleton: en desarrollo el hot-reload de Next reevalua los modulos; sin cachear
 * en `globalThis` se crearia un PrismaClient (y un pool) nuevo en cada recarga, agotando el
 * limite de conexiones. Se cachea SIEMPRE en global (tambien en produccion): garantiza un
 * unico cliente por proceso aun con imports perezosos desde varios sitios, y en produccion
 * no hay hot-reload, asi que el global no crece. No se lee `env.NODE_ENV` en ambito de
 * modulo (seria una lectura de `env` al importar, justo lo que evitamos).
 */
function createPrismaClient(): PrismaClient {
  const url = new URL(env.DATABASE_URL);

  // Prisma 7 se conecta con un driver adapter. Construimos el pool con sus limites EXPLICITOS (no el
  // `connection_limit` de la URL, que usa el CLI de migraciones): el pool del runtime es cosa nuestra.
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    // Tamano del pool: del entorno (afinable sin recompilar), con el default de constants.
    connectionLimit: env.DB_CONNECTION_LIMIT,
    // Espera MAXIMA por una conexion libre. EXPLICITO: el default del driver son 10 s, que el usuario
    // lee como un cuelgue. Si el pool se agota, mejor un error rapido y visible en los logs que un
    // "Entrando..." parado diez segundos sin que quede rastro de por que.
    acquireTimeout: DB_ACQUIRE_TIMEOUT_MS,
    // Conexiones ociosas que se mantienen abiertas. EXPLICITO porque el default del driver es
    // `minimumIdle = connectionLimit`: sin esto, el pool abriria y sostendria las 15 aunque no se use
    // ninguna, y el numero de conexiones abiertas dejaria de servir para saber si hay saturacion.
    minimumIdle: DB_MINIMUM_IDLE,
    // Todo en UTC: la conexion no debe reinterpretar fechas segun zona horaria.
    timezone: "Z",
  });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Devuelve el singleton, creandolo PEREZOSAMENTE la primera vez (nunca al importar). */
function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * `prisma` es un Proxy: acceder a cualquier propiedad materializa el cliente real. Los
 * metodos se enlazan al cliente para no perder el `this`; los delegados de modelo
 * (`prisma.user`, ...) se devuelven tal cual (ya llevan su cliente dentro).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    // Reflect.get SIN receiver a proposito: pasar el Proxy como receiver haria que el
    // `this` de un getter fuese el Proxy en vez del cliente real, y si el cliente generado
    // de Prisma 7 usa campos privados en algun getter lanzaria "Cannot read private member"
    // -> en la PRIMERA peticion que toque la BD, no en el build. Con el cliente real como
    // receptor, los getters ven su `this` correcto.
    const value = Reflect.get(client, prop);
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(client)
      : value;
  },
  has(_target, prop) {
    return prop in getPrisma();
  },
});
