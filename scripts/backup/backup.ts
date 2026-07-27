/**
 * Respaldo de MariaDB — PARTE 1: dump consistente (por FLUJO, sin texto plano en disco ni
 * en memoria), guardas (sentinela + tamaño + disco + lock + timeouts), restauracion en una
 * base DESECHABLE y validacion real (tablas == produccion, suelo critico, conteos de filas
 * y canario integro).
 *
 * MINIMO PRIVILEGIO (defensa ESTRUCTURAL, no solo comparaciones de cadena):
 *   - Volcado:      usuario de SOLO LECTURA sobre `dareflash`. No puede escribir en nada.
 *   - Verificacion: usuario con ALL SOLO sobre la base desechable. No puede tocar produccion.
 * Verificado empiricamente: el DROP de produccion con cualquiera de los dos = Access denied.
 * Las GRANT estan en scripts/backup/README.md.
 *
 * Lo que AUN NO hace (siguientes partes): cifrado age, subida a B2, poda de .gz antiguos,
 * healthchecks.io y la unidad de systemd. Deja un .sql.gz validado en OUT_DIR (que DEBE ser
 * un volumen del anfitrion 0700) y marca el punto de enganche.
 *
 * Config por entorno:
 *   BACKUP_DB_HOST=mariadb  BACKUP_DB_PORT=3306  BACKUP_DB_NAME=dareflash
 *   BACKUP_DUMP_USER / BACKUP_DUMP_PASSWORD          (solo lectura sobre dareflash)
 *   BACKUP_VERIFY_USER / BACKUP_VERIFY_PASSWORD      (ALL solo sobre la base desechable)
 *   BACKUP_OUT_DIR=/backups  BACKUP_VERIFY_DB=dareflash_backup_verify
 *   BACKUP_MIN_BYTES=1024  BACKUP_TIMEOUT_MS=1800000  BACKUP_RESTORE_MARGIN=3
 *   MARIADB_DUMP_BIN=mariadb-dump  MARIADB_BIN=mariadb
 */
import "dotenv/config";

import { spawn } from "node:child_process";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  rmSync,
  statfsSync,
  statSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createGunzip, createGzip } from "node:zlib";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";

import { validarCanarioEnBase } from "./canary";
import {
  dumpPareceCompleto,
  evaluarTamano,
  faltanRespectoAProduccion,
  faltanTablasCriticas,
  filasInsuficientes,
} from "./checks";
import { guardarEstado, leerEstado } from "./estado";

const HOST = process.env["BACKUP_DB_HOST"] ?? "mariadb";
const PORT = process.env["BACKUP_DB_PORT"] ?? "3306";
const DB = process.env["BACKUP_DB_NAME"] ?? process.env["MARIADB_DATABASE"] ?? "dareflash";
const DUMP_USER = process.env["BACKUP_DUMP_USER"] ?? "";
const DUMP_PASSWORD = process.env["BACKUP_DUMP_PASSWORD"] ?? "";
const VERIFY_USER = process.env["BACKUP_VERIFY_USER"] ?? "";
const VERIFY_PASSWORD = process.env["BACKUP_VERIFY_PASSWORD"] ?? "";
const OUT_DIR = process.env["BACKUP_OUT_DIR"] ?? "./backups";
const VERIFY_DB = process.env["BACKUP_VERIFY_DB"] ?? "dareflash_backup_verify";
const FLOOR = Number(process.env["BACKUP_MIN_BYTES"] ?? "1024");
const TIMEOUT_MS = Number(process.env["BACKUP_TIMEOUT_MS"] ?? String(30 * 60 * 1000));
// La COPIA RESTAURADA (InnoDB + indices) pesa MAS que el SQL plano; el .gz comprime 5-10x.
// Estimamos el tamaño real de produccion (data+index) y exigimos ese tamaño x este margen
// libre, para cubrir la copia restaurada + el .gz + el overhead de undo/redo del restore.
const RESTORE_MARGIN = Number(process.env["BACKUP_RESTORE_MARGIN"] ?? "3");
const DISK_MIN_BYTES = Number(process.env["BACKUP_DISK_MIN_BYTES"] ?? String(500 * 1024 * 1024));
const LOCK_STALE_MS = Number(process.env["BACKUP_LOCK_STALE_MS"] ?? String(3 * 60 * 60 * 1000));
const DUMP_BIN = process.env["MARIADB_DUMP_BIN"] ?? "mariadb-dump";
const CLIENT_BIN = process.env["MARIADB_BIN"] ?? "mariadb";

function fail(msg: string): never {
  throw new Error(msg);
}

function envConClave(password: string): NodeJS.ProcessEnv {
  // La clave viaja por MYSQL_PWD, nunca en la linea de comandos (visible en `ps`).
  return { ...process.env, MYSQL_PWD: password };
}

function argsConexion(user: string): string[] {
  return ["-h", HOST, "-P", PORT, "-u", user];
}

interface Resultado {
  code: number | null;
  error?: Error;
  stderr: string;
}

/**
 * Lanza un proceso con TIMEOUT y (opcionalmente) una entrada por flujo. Surfacea SIEMPRE
 * `error` del spawn: si el binario no existe, code es null y el motivo esta ahi (ENOENT),
 * no en un `null: undefined` inutil.
 */
function correr(
  bin: string,
  args: string[],
  opts: { env: NodeJS.ProcessEnv; stdin?: NodeJS.ReadableStream },
): Promise<Resultado> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { env: opts.env });
    let stderr = "";
    let spawnError: Error | undefined;
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const killer = setTimeout(() => {
      spawnError = new Error(`timeout tras ${TIMEOUT_MS} ms`);
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.on("error", (e) => (spawnError = e));
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ code, stderr, error: spawnError });
    });
    if (opts.stdin) {
      opts.stdin.on("error", (e) => (spawnError = e));
      opts.stdin.pipe(child.stdin);
    } else {
      child.stdin.end();
    }
  });
}

function comprobar(r: Resultado, que: string): void {
  if (r.error) {
    fail(
      `${que}: ${r.error.message} (¿falta el cliente de MariaDB 'mariadb-dump'/'mariadb' en la imagen?)`,
    );
  }
  if (r.code !== 0) fail(`${que} salio con codigo ${r.code}: ${r.stderr.trim()}`);
}

async function sqlComoVerify(statement: string): Promise<void> {
  const r = await correr(CLIENT_BIN, [...argsConexion(VERIFY_USER), "-e", statement], {
    env: envConClave(VERIFY_PASSWORD),
  });
  comprobar(r, `${CLIENT_BIN} (${statement.slice(0, 40)}...)`);
}

function clientePrisma(user: string, password: string, database: string): PrismaClient {
  const adapter = new PrismaMariaDb({
    host: HOST,
    port: Number(PORT),
    user,
    password,
    database,
    timezone: "Z",
  });
  return new PrismaClient({ adapter });
}

async function tablasDe(prisma: PrismaClient, schema: string): Promise<string[]> {
  const filas = (await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    schema,
  )) as Array<{ t: string }>;
  return filas.map((f) => f.t);
}

/** Conteo de filas de las tablas append-only clave (para cazar volcados vacios/incompletos). */
async function contarClave(prisma: PrismaClient): Promise<Record<string, number>> {
  const [user, walletLedger, pointsLedger] = await Promise.all([
    prisma.user.count(),
    prisma.walletLedger.count(),
    prisma.pointsLedger.count(),
  ]);
  return { User: user, WalletLedger: walletLedger, PointsLedger: pointsLedger };
}

// --- Guardas de arranque (disco + lock) ---------------------------------------------

async function comprobarEspacio(prismaProd: PrismaClient): Promise<void> {
  const st = statfsSync(OUT_DIR);
  const libre = Number(st.bavail) * Number(st.bsize);
  // El gran consumidor NO es el .gz sino la COPIA RESTAURADA en el volumen de datos de
  // MariaDB. Preguntamos al SERVIDOR el tamaño real de produccion (data+index).
  // OJO: statfs mide OUT_DIR; en un VPS de disco unico es el mismo volumen que los datos de
  // MariaDB. Con volumenes separados, el operador debe garantizar espacio en el de datos.
  const filas = (await prismaProd.$queryRawUnsafe(
    `SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
    DB,
  )) as Array<{ bytes: number | bigint | string }>;
  const tamProd = Number(filas[0]?.bytes ?? 0);
  const necesario = tamProd * RESTORE_MARGIN + DISK_MIN_BYTES;
  if (libre < necesario) {
    fail(
      `espacio insuficiente: ${libre} B libres en ${OUT_DIR} < ${necesario} B ` +
        `(copia restaurada ~${tamProd} B x${RESTORE_MARGIN} + margen). ` +
        `Abortando para no llenar el disco de produccion.`,
    );
  }
}

/** Lock ATOMICO por el sistema de ficheros (openSync 'wx'): existsSync+write tendria carrera. */
function crearLock(lockPath: string): void {
  const fd = openSync(lockPath, "wx"); // falla con EEXIST si ya existe
  writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
  closeSync(fd);
}

function adquirirLock(): string {
  const lockPath = join(OUT_DIR, ".backup.lock");
  try {
    crearLock(lockPath);
    return lockPath;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const edadMs = Date.now() - statSync(lockPath).mtimeMs;
    if (edadMs < LOCK_STALE_MS) {
      fail(`ya hay un respaldo en marcha (${lockPath}); abortando para no pisarlo.`);
    }
    console.error(
      `[backup] AVISO: lock huerfano (${Math.round(edadMs / 60000)} min) -> lo tomo por caido.`,
    );
    rmSync(lockPath, { force: true });
    crearLock(lockPath); // reintento atomico
    return lockPath;
  }
}

// --- Volcado por flujo + sentinela --------------------------------------------------

let colaPlano = Buffer.alloc(0);
const MAX_COLA = 8192;

/** Vuelca `dareflash` y lo comprime AL VUELO a gzPath. Sin .sql plano en disco ni en RAM. */
async function volcarYComprimir(gzPath: string): Promise<void> {
  const dump = spawn(
    DUMP_BIN,
    [
      "--single-transaction",
      "--no-tablespaces",
      "--default-character-set=utf8mb4",
      "--triggers",
      "--routines",
      "--events",
      ...argsConexion(DUMP_USER),
      DB,
    ],
    { env: envConClave(DUMP_PASSWORD) },
  );
  let stderr = "";
  let spawnError: Error | undefined;
  dump.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  dump.on("error", (e) => (spawnError = e));
  const exit = new Promise<number | null>((res) => dump.on("close", res));
  const killer = setTimeout(() => {
    spawnError = new Error(`timeout tras ${TIMEOUT_MS} ms`);
    dump.kill("SIGKILL");
  }, TIMEOUT_MS);

  // Tap: guarda solo la COLA del texto plano (para el sentinela), sin acumular el dump.
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      colaPlano = Buffer.concat([colaPlano, chunk]);
      if (colaPlano.length > MAX_COLA) colaPlano = colaPlano.subarray(colaPlano.length - MAX_COLA);
      cb(null, chunk);
    },
  });

  try {
    await pipeline(dump.stdout, tap, createGzip(), createWriteStream(gzPath));
  } catch (e) {
    clearTimeout(killer);
    if (spawnError) comprobar({ code: null, error: spawnError, stderr }, DUMP_BIN);
    fail(`fallo el volcado/compresion: ${(e as Error).message} ${stderr.trim()}`);
  }
  const code = await exit;
  clearTimeout(killer);
  comprobar({ code, error: spawnError, stderr }, DUMP_BIN);
}

async function restaurarEnVerify(gzPath: string): Promise<void> {
  const entrada = createReadStream(gzPath).pipe(createGunzip());
  const r = await correr(CLIENT_BIN, [...argsConexion(VERIFY_USER), VERIFY_DB], {
    env: envConClave(VERIFY_PASSWORD),
    stdin: entrada,
  });
  comprobar(r, `restauracion en ${VERIFY_DB}`);
}

// --- Orquestacion -------------------------------------------------------------------

async function main(): Promise<void> {
  if (!DUMP_USER || !DUMP_PASSWORD) fail("Faltan BACKUP_DUMP_USER / BACKUP_DUMP_PASSWORD.");
  if (!VERIFY_USER || !VERIFY_PASSWORD) fail("Faltan BACKUP_VERIFY_USER / BACKUP_VERIFY_PASSWORD.");
  if (!/^[A-Za-z0-9_]+$/.test(VERIFY_DB)) fail(`BACKUP_VERIFY_DB invalida: ${VERIFY_DB}`);
  if (VERIFY_DB === DB) fail("BACKUP_VERIFY_DB no puede ser la base de produccion.");

  mkdirSync(OUT_DIR, { recursive: true });
  const lockPath = adquirirLock();
  const prismaProd = clientePrisma(DUMP_USER, DUMP_PASSWORD, DB); // solo lectura
  let gzPath: string | undefined;

  try {
    await comprobarEspacio(prismaProd);

    // Conteos y tablas de produccion ANTES del volcado. Append-only: la restaurada no puede
    // tener MENOS filas que produccion al volcar (aunque la viva crezca despues).
    const conteosProd = await contarClave(prismaProd);
    const tablasProd = await tablasDe(prismaProd, DB);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    gzPath = join(OUT_DIR, `dareflash-${stamp}.sql.gz`);

    // 1) DUMP + compresion por flujo.
    console.log(`[backup] Volcando '${DB}' desde ${HOST} (usuario de solo lectura)...`);
    await volcarYComprimir(gzPath);

    // 2) GUARDA sentinela sobre la cola del texto plano.
    if (!dumpPareceCompleto(colaPlano.toString("utf8"))) {
      fail("dump truncado: falta el sentinela '-- Dump completed' (posible corte a mitad).");
    }

    // 3) RESTAURAR en base desechable (usuario que NO puede tocar produccion) y VALIDAR.
    console.log(`[backup] Restaurando en '${VERIFY_DB}' y validando...`);
    await sqlComoVerify(`DROP DATABASE IF EXISTS \`${VERIFY_DB}\`;`);
    await sqlComoVerify(
      `CREATE DATABASE \`${VERIFY_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    );

    const prismaVerify = clientePrisma(VERIFY_USER, VERIFY_PASSWORD, VERIFY_DB);
    try {
      await restaurarEnVerify(gzPath);

      const restauradas = await tablasDe(prismaVerify, VERIFY_DB);
      const faltanSuelo = faltanTablasCriticas(restauradas);
      if (faltanSuelo.length) fail(`faltan tablas del suelo critico: ${faltanSuelo.join(", ")}`);

      const faltanVsProd = faltanRespectoAProduccion(tablasProd, restauradas);
      if (faltanVsProd.length) {
        fail(
          `la restaurada NO tiene tablas que SI estan en produccion: ${faltanVsProd.join(", ")}`,
        );
      }

      // Conteos: caza un volcado de SOLO ESTRUCTURA (tablas presentes pero 0 filas).
      const conteosRest = await contarClave(prismaVerify);
      const insuficientes = filasInsuficientes(conteosProd, conteosRest);
      if (insuficientes.length) {
        fail(`la restaurada tiene MENOS filas que produccion: ${insuficientes.join("; ")}`);
      }

      const canario = await validarCanarioEnBase(prismaVerify);
      if (!canario.ok) fail(`validacion del canario fallida: ${canario.motivos.join("; ")}`);

      console.log(
        `[backup] Validacion OK: ${restauradas.length} tablas (== produccion); ` +
          `User=${conteosRest.User} WalletLedger=${conteosRest.WalletLedger} ` +
          `PointsLedger=${conteosRest.PointsLedger} (>= produccion); canario integro.`,
      );
    } finally {
      await prismaVerify.$disconnect();
      await sqlComoVerify(`DROP DATABASE IF EXISTS \`${VERIFY_DB}\`;`); // limpiar SIEMPRE
    }

    // 4) GUARDA de tamaño (vs el ultimo bueno, que persiste en OUT_DIR).
    const bytes = statSync(gzPath).size;
    const previo = leerEstado(OUT_DIR).ultimoBuenoBytes ?? 0;
    const t = evaluarTamano({ bytes, previoBytes: previo, sueloBytes: FLOOR });
    if (t.sospechoso)
      fail(`dump comprimido sospechosamente pequeño: ${t.motivo}. NO se marca como bueno.`);

    // 5) OK. (Siguiente parte: cifrar con age -> subir a B2 -> borrar el .gz local + poda.)
    guardarEstado(OUT_DIR, { ultimoBuenoBytes: bytes, ultimoBueno: gzPath, fecha: stamp });
    console.log(`[backup] OK: ${gzPath} (${bytes} B). Previo bueno: ${previo} B.`);
    console.log(
      "[backup] PENDIENTE (siguiente parte): cifrado age -> subida a B2 -> borrado del .gz local.",
    );
  } catch (e) {
    // Cualquier fallo (codigo != 0, timeout, sentinela, validacion, tamaño) borra el .gz de
    // ESTA ejecucion: nunca dejamos artefactos parciales que parezcan respaldos buenos.
    if (gzPath && existsSync(gzPath)) rmSync(gzPath, { force: true });
    throw e;
  } finally {
    await prismaProd.$disconnect();
    rmSync(lockPath, { force: true });
  }
}

main().catch((e) => {
  console.error(`\n[backup] FALLO: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
