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

  // 1) RECREAR las BDs desde cero en CADA ejecución: DROP + CREATE, nunca reutilizarlas.
  //
  //    Antes era `CREATE DATABASE IF NOT EXISTS`, así que cada BD de worker vivía para siempre y
  //    arrastraba el estado de todas las ejecuciones anteriores. Para casi todas las tablas eso daba
  //    igual —`resetDb` las vacía antes de cada test—, pero NO para el índice FULLTEXT de InnoDB:
  //    borrar filas no borra sus entradas del índice, solo apunta su DOC_ID en una lista de borrados
  //    que nada purga, y `MATCH ... AGAINST` descarta todo resultado cuyo DOC_ID esté en esa lista.
  //
  //    Medido el 2026-09-11 en `dareflash_test_1`: 6.380 DOC_ID en la lista de borrados, y a una fila
  //    recién insertada InnoDB le asignó el 5882 — que ESTABA en esa lista. La fila existía (LIKE la
  //    veía) pero el FULLTEXT la daba por borrada, así que todo lo que buscaba por FULLTEXT volvía
  //    vacío. Así nació el rojo "intermitente" de `buscar.test.ts`, que acabó siendo permanente en
  //    cuatro de las cinco BDs. En una BD recién creada, la misma búsqueda no falla nunca.
  //
  //    CUÁNDO se recicla un DOC_ID (reproducido en una BD desechable, con control): tras una parada
  //    BRUSCA del servidor —Docker Desktop cerrado con el equipo, un `docker kill`— el índice no
  //    llegó a sincronizarse, y al arrancar InnoDB reanuda el contador por encima de la fila VIVA con
  //    el DOC_ID más alto. En una tabla de test, vaciada por `resetDb`, no queda ninguna: el contador
  //    vuelve atrás y reparte números que siguen en la lista de borrados. Con una parada ordenada
  //    (`docker restart`) el índice se sincroniza antes de parar y no pasa.
  //
  //    POR QUÉ PRODUCCIÓN NO ESTÁ EXPUESTA: ahí nunca se borran FÍSICAMENTE usuarios ni retos (se
  //    anonimizan u ocultan), y editar un nombre o un título da a la fila viva un DOC_ID nuevo y más
  //    alto. Las filas vivas tienen siempre los DOC_ID más altos, así que el contador nunca recicla.
  //    Medido: tras el mismo corte brusco, una tabla que conserva viva su fila más nueva sigue
  //    encontrando las filas nuevas. Si algún día se borraran físicamente esas filas, esto dejaría de
  //    ser cierto.
  //
  //    Recrear cuesta aplicar las migraciones desde cero en cada arranque, en paralelo (~13 s más por
  //    ejecución completa). Es el precio de que ninguna BD de test cargue con estado de ejecuciones
  //    pasadas — que es lo que su nombre promete y lo que `resetDb` por sí solo no garantiza.
  const conn = await mariadb.createConnection(hostBdTest());
  try {
    for (const n of nombres) {
      await conn.query(`DROP DATABASE IF EXISTS \`${n}\``);
      await conn.query(`CREATE DATABASE \`${n}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
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
