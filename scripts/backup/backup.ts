/**
 * Respaldo de MariaDB — PARTE 1: dump consistente, guardas (sentinela + tamaño),
 * restauracion en una base DESECHABLE y validacion real (tablas criticas + canario).
 *
 * Lo que AUN NO hace (siguientes partes, para revisar por separado): cifrado age,
 * subida a B2, ping a healthchecks.io y la unidad de systemd que lo dispara. Por ahora
 * deja un artefacto .sql.gz validado en local y marca el punto de enganche.
 *
 * Config por entorno (con defaults para el contenedor en la red `internal`):
 *   BACKUP_DB_HOST=mariadb  BACKUP_DB_PORT=3306  BACKUP_DB_NAME=dareflash
 *   BACKUP_DB_USER=root     BACKUP_DB_PASSWORD | MARIADB_ROOT_PASSWORD
 *   BACKUP_OUT_DIR=./backups  BACKUP_VERIFY_DB=dareflash_backup_verify
 *   BACKUP_MIN_BYTES=1024     MARIADB_DUMP_BIN=mariadb-dump  MARIADB_BIN=mariadb
 *
 * El one-off (siguiente parte lo mete en systemd):
 *   docker compose -f docker-compose.prod.yml run --rm migrate npx tsx scripts/backup/backup.ts
 */
import "dotenv/config";

import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";

import { validarCanarioEnBase } from "./canary";
import { dumpPareceCompleto, evaluarTamano, faltanTablasCriticas } from "./checks";

const HOST = process.env["BACKUP_DB_HOST"] ?? "mariadb";
const PORT = process.env["BACKUP_DB_PORT"] ?? "3306";
const DB = process.env["BACKUP_DB_NAME"] ?? process.env["MARIADB_DATABASE"] ?? "dareflash";
const USER = process.env["BACKUP_DB_USER"] ?? "root";
const PASSWORD = process.env["BACKUP_DB_PASSWORD"] ?? process.env["MARIADB_ROOT_PASSWORD"] ?? "";
const OUT_DIR = process.env["BACKUP_OUT_DIR"] ?? "./backups";
const VERIFY_DB = process.env["BACKUP_VERIFY_DB"] ?? "dareflash_backup_verify";
const FLOOR = Number(process.env["BACKUP_MIN_BYTES"] ?? "1024");
const DUMP_BIN = process.env["MARIADB_DUMP_BIN"] ?? "mariadb-dump";
const CLIENT_BIN = process.env["MARIADB_BIN"] ?? "mariadb";
const ESTADO = join(OUT_DIR, "estado.json");

const childEnv = { ...process.env, MYSQL_PWD: PASSWORD };

interface Estado {
  ultimoBuenoBytes?: number;
  ultimoBueno?: string;
  fecha?: string;
}

function fail(msg: string): never {
  throw new Error(msg);
}

/** Ejecuta el cliente mysql/mariadb con una sentencia. La clave va por MYSQL_PWD (no en CLI). */
function ejecutarSql(statement: string): void {
  const r = spawnSync(CLIENT_BIN, ["-h", HOST, "-P", PORT, "-u", USER, "-e", statement], {
    env: childEnv,
    encoding: "utf8",
  });
  if (r.status !== 0) fail(`${CLIENT_BIN} fallo (${r.status}): ${r.stderr ?? ""}`);
}

function recrearVerifyDb(): void {
  ejecutarSql(
    `DROP DATABASE IF EXISTS \`${VERIFY_DB}\`; ` +
      `CREATE DATABASE \`${VERIFY_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
}

function borrarVerifyDb(): void {
  const r = spawnSync(
    CLIENT_BIN,
    ["-h", HOST, "-P", PORT, "-u", USER, "-e", `DROP DATABASE IF EXISTS \`${VERIFY_DB}\`;`],
    {
      env: childEnv,
      encoding: "utf8",
    },
  );
  if (r.status !== 0)
    console.error(`[backup] AVISO: no pude borrar ${VERIFY_DB}: ${r.stderr ?? ""}`);
}

function restaurarEnVerifyDb(sqlPath: string): void {
  const fd = openSync(sqlPath, "r");
  try {
    const r = spawnSync(CLIENT_BIN, ["-h", HOST, "-P", PORT, "-u", USER, VERIFY_DB], {
      env: childEnv,
      stdio: [fd, "inherit", "pipe"],
      encoding: "utf8",
    });
    if (r.status !== 0) fail(`restauracion en ${VERIFY_DB} fallo (${r.status}): ${r.stderr ?? ""}`);
  } finally {
    closeSync(fd);
  }
}

function clienteVerify(): PrismaClient {
  const adapter = new PrismaMariaDb({
    host: HOST,
    port: Number(PORT),
    user: USER,
    password: PASSWORD,
    database: VERIFY_DB,
    timezone: "Z",
  });
  return new PrismaClient({ adapter });
}

async function tablasPresentes(prisma: PrismaClient): Promise<string[]> {
  const filas = (await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    VERIFY_DB,
  )) as Array<{ t: string }>;
  return filas.map((f) => f.t);
}

/** Lee las ultimas `n` bytes del fichero (el sentinela va al final; no leemos dumps enteros). */
function leerCola(path: string, n: number): string {
  const size = statSync(path).size;
  const len = Math.min(size, n);
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function leerEstado(): Estado {
  try {
    return JSON.parse(readFileSync(ESTADO, "utf8")) as Estado;
  } catch {
    return {};
  }
}

function guardarEstado(estado: Estado): void {
  writeFileSync(ESTADO, JSON.stringify(estado, null, 2));
}

async function main(): Promise<void> {
  if (!PASSWORD) fail("Falta la contrasena de BD (BACKUP_DB_PASSWORD o MARIADB_ROOT_PASSWORD).");
  // La base de verificacion se DROPea: jamas puede ser la de produccion, ni un identificador raro.
  if (!/^[A-Za-z0-9_]+$/.test(VERIFY_DB)) fail(`BACKUP_VERIFY_DB invalida: ${VERIFY_DB}`);
  if (VERIFY_DB === DB) fail("BACKUP_VERIFY_DB no puede ser la base de produccion.");

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sqlPath = join(OUT_DIR, `dareflash-${stamp}.sql`);

  try {
    // 1) DUMP consistente -> fichero (stdout al fd; stderr capturado).
    console.log(`[backup] Volcando '${DB}' desde ${HOST}...`);
    const fd = openSync(sqlPath, "w");
    let dump;
    try {
      dump = spawnSync(
        DUMP_BIN,
        [
          "--single-transaction",
          "--routines",
          "--triggers",
          "--events",
          "--no-tablespaces",
          "--default-character-set=utf8mb4",
          "-h",
          HOST,
          "-P",
          PORT,
          "-u",
          USER,
          DB,
        ],
        { env: childEnv, stdio: ["ignore", fd, "pipe"], encoding: "utf8" },
      );
    } finally {
      closeSync(fd);
    }
    if (!dump || dump.status !== 0)
      fail(`mariadb-dump devolvio ${dump?.status}: ${dump?.stderr ?? ""}`);

    // 2) GUARDA sentinela: un dump truncado (disco lleno, matado) no lo tiene.
    if (!dumpPareceCompleto(leerCola(sqlPath, 8192))) {
      fail("dump truncado: falta el sentinela '-- Dump completed' (posible corte a mitad).");
    }

    // 3) RESTAURAR en base desechable y VALIDAR de verdad.
    console.log(`[backup] Restaurando en '${VERIFY_DB}' y validando...`);
    recrearVerifyDb();
    const prisma = clienteVerify();
    try {
      restaurarEnVerifyDb(sqlPath);

      const faltan = faltanTablasCriticas(await tablasPresentes(prisma));
      if (faltan.length) fail(`la base restaurada NO tiene tablas criticas: ${faltan.join(", ")}`);

      const canario = await validarCanarioEnBase(prisma);
      if (!canario.ok) fail(`validacion del canario fallida: ${canario.motivos.join("; ")}`);

      const usuarios = await prisma.user.count();
      console.log(
        `[backup] Validacion OK: ${usuarios} usuarios, canario integro, tablas criticas presentes.`,
      );
    } finally {
      await prisma.$disconnect();
      borrarVerifyDb(); // la base desechable se limpia SIEMPRE
    }

    // 4) COMPRIMIR + GUARDA de tamaño (vs el ultimo bueno).
    const gzPath = `${sqlPath}.gz`;
    writeFileSync(gzPath, gzipSync(readFileSync(sqlPath)));
    const bytes = statSync(gzPath).size;
    const previo = leerEstado().ultimoBuenoBytes ?? 0;
    const t = evaluarTamano({ bytes, previoBytes: previo, sueloBytes: FLOOR });
    if (t.sospechoso) {
      rmSync(gzPath, { force: true });
      fail(`dump comprimido sospechosamente pequeño: ${t.motivo}. NO se marca como bueno.`);
    }

    // 5) OK. (Siguiente parte: cifrar con age, subir a B2, borrar el .gz local.)
    guardarEstado({ ultimoBuenoBytes: bytes, ultimoBueno: gzPath, fecha: stamp });
    console.log(`[backup] OK: ${gzPath} (${bytes} B).`);
    console.log(
      "[backup] PENDIENTE (siguiente parte): cifrado age -> subida a B2 -> borrado del .gz local.",
    );
  } finally {
    // El .sql en texto plano es intermedio y NUNCA debe quedarse en disco.
    if (existsSync(sqlPath)) rmSync(sqlPath, { force: true });
  }
}

main().catch((e) => {
  console.error(`\n[backup] FALLO: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
