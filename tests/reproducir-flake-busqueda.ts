/**
 * REPRODUCTOR del flake de `tests/buscar.test.ts` (los 4 casos de `buscarUsuarios` que dependen del
 * FULLTEXT de InnoDB sobre `User`). NO es un test: vitest no lo recoge (solo carga `*.test.ts`).
 *
 * ┌─ PARA QUÉ SIRVE ──────────────────────────────────────────────────────────────────────────────┐
 * │ Esos 4 casos fallaron varias veces en pasadas de la suite completa —nunca en solitario— y       │
 * │ SIEMPRE igual: `MATCH ... AGAINST` no devolvía filas recién insertadas, así que los casos que    │
 * │ dependen del fulltext se quedaban cortos (faltaba `zzz`; o salía `u2` pero no `u1`). Un rojo     │
 * │ intermitente y ajeno al cambio en revisión, que es la peor clase de rojo: entrena a ignorarlos.  │
 * │                                                                                                 │
 * │ Al intentar arreglarlo NO se pudo reproducir en bucle ocioso (0 fallos en 12+ pasadas, en        │
 * │ caliente, tras reiniciar MariaDB y con la CPU saturada). Sin reproducción no se puede demostrar  │
 * │ que un arreglo arregla, así que en vez de blindar a ciegas se dejó ESTA TRAMPA.                  │
 * │                                                                                                 │
 * │ SI VUELVE A CAER: ejecuta esto. Reproduce el escenario exacto de los tests bajo CONTENCIÓN       │
 * │ deliberada y, en cuanto detecta una discrepancia, vuelca la evidencia que aquel día faltó: qué   │
 * │ filas había en `User`, qué devolvió el `MATCH` crudo y qué devolvió el servicio.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * USO (necesita MariaDB de dev levantada, `docker compose -f docker-compose.dev.yml up -d`):
 *
 *   npx tsx --conditions=react-server tests/reproducir-flake-busqueda.ts
 *   npx tsx --conditions=react-server tests/reproducir-flake-busqueda.ts --iteraciones=500 --carga=8
 *
 *   --iteraciones=N   vueltas del escenario (por defecto 300)
 *   --carga=N         procesos quemando CPU en paralelo (por defecto = nº de CPUs)
 *   --sin-carga       sin contención (para comprobar que en reposo pasa siempre)
 *
 * `--conditions=react-server` es obligatorio: el servicio de búsqueda es `server-only` y sin esa
 * condición no se puede importar fuera de RSC (mismo motivo que `npm run worker`).
 *
 * BASE DE DATOS PROPIA (`dareflash_flake`): no comparte tabla con los workers de vitest, así que se
 * puede correr A LA VEZ que la suite —que es justo la contención que se busca— sin pisarse los datos.
 * La crea y la migra él solo la primera vez.
 */
import { execFile, fork } from "node:child_process";
import { cpus } from "node:os";
import { promisify } from "node:util";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import mariadb from "mariadb";

import { PrismaClient } from "../src/generated/prisma/client";
import { buscarUsuarios } from "../src/server/services/buscar";

import { hostBdTest, urlBdTest } from "./helpers/db";

const execFileAsync = promisify(execFile);

/** BD propia del reproductor: no la tocan los workers de vitest. */
const BD = "dareflash_flake";

interface Escenario {
  nombre: string;
  /** Usuarios a sembrar: [username, displayName, scoreAutoridad]. */
  siembra: [string, string | null, number][];
  /** Consulta que se le pasa al fulltext (para el volcado de evidencia). */
  consulta: string;
  /** Ejecuta la comprobación del test real. Devuelve null si va bien, o qué salió mal. */
  verificar: (prisma: PrismaClient) => Promise<string | null>;
}

/**
 * Los CUATRO casos que fallaron, COPIADOS de `tests/buscar.test.ts` (mismos datos, mismas
 * comprobaciones). Si aquel fichero cambia, esto puede quedar desalineado: es una trampa de
 * diagnóstico, no una segunda fuente de verdad.
 */
const ESCENARIOS: Escenario[] = [
  {
    nombre: "orden: exacto > prefijo > fulltext",
    siembra: [
      ["ana", "Ana G", 0],
      ["anatomia", "sin match", 500],
      ["zzz", "soy ana la crack", 999], // <- SOLO casa por FULLTEXT: es el que desaparecía
    ],
    consulta: "ana",
    verificar: async (p) => {
      const { items } = await buscarUsuarios(p, "ana", null);
      const got = items.map((u) => u.username);
      const esperado = ["ana", "anatomia", "zzz"];
      return JSON.stringify(got) === JSON.stringify(esperado)
        ? null
        : `esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(got)}`;
    },
  },
  {
    nombre: "mismo rango -> scoreAutoridad DESC decide",
    siembra: [
      ["u1", "reto fitness", 10],
      ["u2", "reto fitness", 50],
    ],
    consulta: "fitness", // ambos casan SOLO por fulltext
    verificar: async (p) => {
      const { items } = await buscarUsuarios(p, "fitness", null);
      const got = items.map((u) => u.username);
      const esperado = ["u2", "u1"];
      return JSON.stringify(got) === JSON.stringify(esperado)
        ? null
        : `esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(got)}`;
    },
  },
  {
    nombre: "keyset cruza fronteras de ORDEN distinta",
    siembra: [
      ["ana", "x", 0], // exacto (rango 2)
      ["anabel", "x", 0], // prefijo (rango 1)
      ["z1", "soy ana", 0], // fulltext (rango 0)
      ["z2", "hola ana", 0], // fulltext (rango 0)
    ],
    consulta: "ana",
    verificar: async (p) => {
      const vistos: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 10; i++) {
        const pagina = await buscarUsuarios(p, "ana", cursor, 1);
        vistos.push(...pagina.items.map((u) => u.username ?? "(sin username)"));
        if (!pagina.proximoCursor) break;
        cursor = pagina.proximoCursor;
      }
      if (vistos.length !== 4)
        return `esperaba 4 usuarios paginando, obtuve ${JSON.stringify(vistos)}`;
      if (new Set(vistos).size !== 4) return `repetidos: ${JSON.stringify(vistos)}`;
      if (vistos[0] !== "ana" || vistos[1] !== "anabel") {
        return `orden de rangos roto: ${JSON.stringify(vistos)}`;
      }
      return null;
    },
  },
  {
    nombre: "operadores de BOOLEAN MODE como literal",
    siembra: [["target1", "salto mortal", 0]],
    consulta: "sal",
    verificar: async (p) => {
      for (const q of ["sal*", "+sal -x", 'sal")', "@sal"]) {
        const { items } = await buscarUsuarios(p, q, null);
        if (!items.map((u) => u.username).includes("target1")) {
          return `la consulta ${JSON.stringify(q)} no encontró target1`;
        }
      }
      return null;
    },
  },
];

function arg(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split("=")[1];
}

/** Crea y migra la BD del reproductor (idempotente). */
async function prepararBd(): Promise<void> {
  const conn = await mariadb.createConnection(hostBdTest());
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${BD}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
  await execFileAsync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: urlBdTest(BD) },
    shell: true,
  });
}

function cliente(): PrismaClient {
  const url = new URL(urlBdTest(BD));
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      connectionLimit: 10,
      timezone: "Z",
    }),
  });
}

/**
 * VUELCA LA EVIDENCIA que faltó la primera vez. No basta con "falló": hay que poder distinguir
 * "el MATCH no devolvió nada" de "devolvió parcial" de "la fila ni se insertó".
 */
async function volcarEvidencia(prisma: PrismaClient, e: Escenario, detalle: string): Promise<void> {
  const filas = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true, scoreAutoridad: true },
    orderBy: { username: "asc" },
  });
  // El MATCH CRUDO, sin el resto de la consulta del servicio: separa "el índice no ve la fila" de
  // "el servicio la filtra u ordena mal".
  const expr = `${e.consulta}*`;
  const match = await prisma.$queryRawUnsafe<{ username: string; relevancia: number }[]>(
    "SELECT `username`, MATCH(`username`, `displayName`) AGAINST (? IN BOOLEAN MODE) AS relevancia " +
      "FROM `User` WHERE MATCH(`username`, `displayName`) AGAINST (? IN BOOLEAN MODE)",
    expr,
    expr,
  );

  console.error(`\n${"=".repeat(78)}`);
  console.error(`FALLO REPRODUCIDO — escenario: ${e.nombre}`);
  console.error(`consulta: "${e.consulta}"   (expresión fulltext: "${expr}")`);
  console.error(`discrepancia: ${detalle}`);
  console.error(`\nfilas en User (${filas.length}):`);
  for (const f of filas) {
    console.error(
      `  ${f.username.padEnd(12)} display=${JSON.stringify(f.displayName)} score=${f.scoreAutoridad}`,
    );
  }
  console.error(`\nMATCH crudo devolvió ${match.length} fila(s):`);
  for (const m of match) console.error(`  ${m.username.padEnd(12)} relevancia=${m.relevancia}`);
  console.error(
    match.length === 0
      ? "\n=> El índice FULLTEXT NO ve NINGUNA fila: la caché auxiliar no está sincronizada."
      : match.length < filas.length
        ? "\n=> El índice ve SOLO PARTE de las filas: sincronización PARCIAL de la caché."
        : "\n=> El índice SÍ las ve: el fallo NO es del fulltext, mirar el orden/filtrado del servicio.",
  );
  console.error(`${"=".repeat(78)}\n`);
}

async function main(): Promise<void> {
  const iteraciones = Number(arg("iteraciones") ?? 300);
  const sinCarga = process.argv.includes("--sin-carga");
  const carga = sinCarga ? 0 : Number(arg("carga") ?? cpus().length);

  console.log(`[flake] preparando ${BD}...`);
  await prepararBd();

  // CONTENCIÓN: procesos quemando CPU. El flake solo apareció con la máquina ocupada; en reposo dio
  // 0 fallos en 12+ pasadas, así que un bucle ocioso no prueba nada.
  const quemadores = Array.from({ length: carga }, () =>
    fork(process.argv[1]!, ["--quemar"], { silent: true, execArgv: ["--import", "tsx"] }),
  );
  if (carga > 0) console.log(`[flake] ${carga} procesos de carga en marcha`);

  const prisma = cliente();
  let fallos = 0;
  const inicio = Date.now();

  try {
    for (let i = 1; i <= iteraciones; i++) {
      for (const e of ESCENARIOS) {
        await prisma.$executeRawUnsafe("DELETE FROM `User`");
        for (const [username, displayName, score] of e.siembra) {
          await prisma.user.create({
            data: { username, displayName, scoreAutoridad: score, passwordHash: "x" },
          });
        }

        const fallo = await e.verificar(prisma);
        if (fallo !== null) {
          fallos += 1;
          await volcarEvidencia(prisma, e, fallo);
        }
      }
      if (i % 25 === 0) {
        console.log(`[flake] ${i}/${iteraciones} vueltas · ${fallos} fallo(s)`);
      }
    }
  } finally {
    for (const q of quemadores) q.kill();
    await prisma.$disconnect();
  }

  const seg = Math.round((Date.now() - inicio) / 1000);
  console.log(
    fallos === 0
      ? `\n[flake] ${iteraciones} vueltas x ${ESCENARIOS.length} escenarios en ${seg}s: NO reproducido.`
      : `\n[flake] REPRODUCIDO: ${fallos} fallo(s) en ${iteraciones} vueltas (${seg}s). Evidencia arriba.`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

// Modo "quemador": el propio fichero se re-ejecuta como proceso de carga (sin dependencias extra).
if (process.argv.includes("--quemar")) {
  for (;;) Math.sqrt(Math.random());
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
