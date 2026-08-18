/**
 * Helper de la BASE DE DATOS DE TESTS (separada de la de desarrollo, para poder
 * truncar sin miedo). No usa el singleton `server-only`: crea su propio cliente
 * con el driver adapter, como la semilla.
 *
 * AISLAMIENTO POR WORKER: la URL base (env o default) apunta al servidor local (mismas credenciales
 * que docker-compose.dev.yml, no son secretos). El NOMBRE de BD se SUFIJA con el id del worker de
 * vitest (`_<VITEST_POOL_ID>`), así cada worker usa `dareflash_test_<id>` y NO se comparte una única
 * BD -> se elimina la contaminación cruzada y se puede correr en paralelo. El globalSetup crea y migra
 * `dareflash_test` (para los meta-tests db-client) y `dareflash_test_1..N` (workers).
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";

/** URL BASE (servidor + BD base). Se puede sobreescribir con TEST_DATABASE_URL (p.ej. en CI). */
export const TEST_DATABASE_URL_BASE =
  process.env["TEST_DATABASE_URL"] ??
  "mysql://dareflash:dareflash_dev@127.0.0.1:3307/dareflash_test";

/** Datos de conexión al SERVIDOR de tests (sin BD concreta): para crear las BDs por worker. */
export function hostBdTest(): { host: string; port: number; user: string; password: string } {
  const url = new URL(TEST_DATABASE_URL_BASE);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/** Nombre de la BD base (`dareflash_test`), del que derivan las de worker. */
export function nombreBdBase(): string {
  return new URL(TEST_DATABASE_URL_BASE).pathname.replace(/^\//, "");
}

/** URL de conexión a la BD `nombre` en el mismo servidor de tests. */
export function urlBdTest(nombre: string): string {
  const url = new URL(TEST_DATABASE_URL_BASE);
  url.pathname = `/${nombre}`;
  return url.toString();
}

/** Id del worker de vitest (1..N); fuera de vitest (o sin pool) -> "1". */
function poolId(): string {
  return process.env["VITEST_POOL_ID"] ?? "1";
}

/** Nombre de la BD de ESTE worker: `<base>_<poolId>`. */
export function nombreBdWorker(): string {
  return `${nombreBdBase()}_${poolId()}`;
}

/**
 * Tablas en orden SEGURO de FK para borrar (hijos antes que padres). Se usa DELETE
 * en vez de TRUNCATE + SET FOREIGN_KEY_CHECKS=0 porque esa variable es de SESION y
 * cada consulta del pool usa una conexion distinta: el TRUNCATE correria en otra
 * conexion con las FK aun activas. Con el orden correcto no hace falta desactivarlas.
 */
const DELETE_ORDER = [
  "Vote",
  "ChallengeResult",
  "Submission",
  "Challenge",
  "Video",
  "Account",
  "Session",
  "PointsLedger",
  "WalletLedger",
  "BoostLedger",
  "BoostActivation",
  "Report",
  "AuditLog",
  "RateLimit",
  "Job",
  "SystemState",
  "VerificationToken",
  "User",
];

/**
 * Crea un cliente para tests. `poolLimit` alto a proposito: en los tests de
 * concurrencia no queremos que el cuello de botella sea el pool, sino el bloqueo
 * de filas que estamos probando.
 */
export function createTestPrisma(poolLimit = 25): PrismaClient {
  const url = new URL(urlBdTest(nombreBdWorker()));
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: poolLimit,
    timezone: "Z",
  });
  return new PrismaClient({ adapter });
}

/** Vacia todas las tablas en orden seguro de FK. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  for (const table of DELETE_ORDER) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }
}

/** Crea un usuario minimo valido y devuelve su id. */
export async function crearUsuario(
  prisma: PrismaClient,
  overrides: { pointsBalance?: number; walletBalanceCents?: number; boostBalance?: number } = {},
): Promise<string> {
  const u = await prisma.user.create({
    data: {
      pointsBalance: overrides.pointsBalance ?? 0,
      walletBalanceCents: overrides.walletBalanceCents ?? 0,
      boostBalance: overrides.boostBalance ?? 0,
    },
    select: { id: true },
  });
  return u.id;
}
