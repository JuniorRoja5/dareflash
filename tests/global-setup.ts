/**
 * globalSetup de vitest — AISLAMIENTO DE LA BD DE TESTS por worker. Se ejecuta UNA vez, en el proceso
 * principal, antes de arrancar los workers. Provisiona:
 *   - `dareflash_test`        -> la usan los meta-tests db-client* (que fijan su propia DATABASE_URL).
 *   - `dareflash_test_1..N`   -> una por worker (cada fork usa la suya por su VITEST_POOL_ID).
 * Para cada una: CREATE DATABASE IF NOT EXISTS + `prisma migrate deploy` (idempotente: solo aplica las
 * migraciones pendientes). Así el paralelismo no contamina entre ficheros. Es SOLO infra de tests;
 * cero cambios de comportamiento de producto.
 *
 * `migrate deploy` lee la URL de `DATABASE_URL` (vía prisma.config.ts), por eso se la pasamos por env
 * a cada invocación. Las migraciones de las N BDs corren en PARALELO (BDs distintas, sin carrera) para
 * no sumar N arranques de la CLI en serie.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import mariadb from "mariadb";

import { hostBdTest, nombreBdBase, urlBdTest } from "./helpers/db";
import { NUM_WORKER_DBS } from "./helpers/workers";

const execFileAsync = promisify(execFile);

export default async function setup(): Promise<void> {
  const base = nombreBdBase();
  const nombres = [base, ...Array.from({ length: NUM_WORKER_DBS }, (_, i) => `${base}_${i + 1}`)];

  // 1) Crear las BDs si no existen (conexión al servidor, sin BD concreta).
  const conn = await mariadb.createConnection(hostBdTest());
  try {
    for (const n of nombres) {
      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`${n}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    }
  } finally {
    await conn.end();
  }

  // 2) Migrar cada BD (idempotente). En paralelo: BDs distintas -> sin carrera. `shell: true` para que
  //    `npx` se resuelva en Windows. Un fallo rechaza -> globalSetup falla y vitest lo muestra.
  await Promise.all(
    nombres.map((n) =>
      execFileAsync("npx", ["prisma", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: urlBdTest(n) },
        shell: true,
      }),
    ),
  );
}
