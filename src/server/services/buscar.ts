/**
 * BÚSQUEDA (Fase 1 + P3: PARCIALES de palabra) — usuarios y retos. Escala y futuro-proof:
 *   - TEXTO indexado, nunca `LIKE '%x%'` (full scan). Dos vías, ambas por índice:
 *       · PREFIJO izquierda-anclado `LIKE 'x%'` sobre `username`/`displayName` (usuarios) y `title`
 *         (retos) -> usa índice btree (UNIQUE de username; `*_idx` de displayName/title, ver migración
 *         `buscar_prefijo_indices`). Encuentra lo que EMPIEZA por el término.
 *       · FULLTEXT en BOOLEAN MODE con WORD-PREFIX `palabra*` (>= BUSCAR_MIN_FULLTEXT) -> encuentra
 *         PALABRAS que empiezan por el término dentro del texto ("sal*" -> "salto"), por índice fulltext.
 *   - Orden ESTABLE en 4 dimensiones: (1) EXACTO/PREFIJO, (2) relevancia FULLTEXT, (3) `scoreAutoridad`
 *     DESC (columna indexada que recalcula el worker), (4) `id` (desempate). Las tres primeras se
 *     combinan en un `orden` DESC; la búsqueda LEE `scoreAutoridad`, no lo calcula al vuelo.
 *   - Paginación KEYSET (no OFFSET): el cursor lleva (orden, scoreAutoridad, id) y la página siguiente
 *     filtra "estrictamente después" en ese orden -> no repite ni salta filas al insertarse otras.
 *   - Consulta CORTA (< BUSCAR_MIN_FULLTEXT, bajo el token mínimo de FULLTEXT): SOLO prefijo indexado
 *     (username/displayName/title); no hay fulltext posible bajo el token mínimo.
 *   - SEGURIDAD FULLTEXT: el término se NEUTRALIZA antes de BOOLEAN MODE (fuera los operadores
 *     `+ - > < ( ) ~ * " @`); el `*` de word-prefix lo añade el servidor. Nunca inyección de sintaxis.
 *   - SOLO contenido PÚBLICO: usuarios con perfil público (no borrados/baneados, con username); retos
 *     PUBLISHED. El DTO expone SOLO campos públicos (jamás email ni campos privados).
 */
import "server-only";

import { BUSCAR_LIMITE, BUSCAR_MIN_FULLTEXT } from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

/** Multiplicador para que la EXACTITUD (rango 0/1/2) domine sobre la relevancia FULLTEXT en `orden`. */
const RANGO_FACTOR = 1_000_000_000;

export interface PaginaBusqueda<T> {
  items: T[];
  /** Cursor keyset opaco para la página siguiente; null si no hay más. */
  proximoCursor: string | null;
}

/** DTO PÚBLICO de un usuario en resultados (jamás email/privados). */
export interface UsuarioBusqueda {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
}

/** DTO PÚBLICO de un reto en resultados. */
export interface RetoBusqueda {
  id: string;
  title: string;
  category: string;
  prizeAmountCents: number;
  prizeCurrency: string;
  deadline: Date;
}

/** Cursor keyset: la tupla de orden de la última fila devuelta. Opaco para el cliente (base64url). */
interface CursorBusqueda {
  o: number; // orden combinado (exactitud*FACTOR + relevancia)
  s: number; // scoreAutoridad
  id: string;
}

function codificarCursor(c: CursorBusqueda): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodificarCursor(raw: string | null): CursorBusqueda | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<CursorBusqueda>;
    if (typeof c.o === "number" && typeof c.s === "number" && typeof c.id === "string") {
      return { o: c.o, s: c.s, id: c.id };
    }
  } catch {
    /* cursor corrupto -> se ignora (primera página) */
  }
  return null;
}

/** Escapa los comodines de LIKE (`% _ \`) para tratar la entrada como literal en un prefijo. */
function escaparLike(v: string): string {
  return v.replace(/[\\%_]/g, "\\$&");
}

/**
 * Convierte el término en una EXPRESIÓN segura para MATCH..AGAINST(... IN BOOLEAN MODE) con word-prefix:
 * NEUTRALIZA los operadores de BOOLEAN MODE (`+ - > < ( ) ~ * " @`) sustituyéndolos por espacio (así el
 * usuario no inyecta sintaxis fulltext), colapsa espacios y añade el `*` de word-prefix por PALABRA
 * (`salto* caja*`). Devuelve "" si tras limpiar no queda nada (p.ej. el término eran solo operadores):
 * en ese caso el que llama cae a solo-prefijo.
 */
function expresionBoolean(termino: string): string {
  const limpio = termino
    .replace(/[+\-><()~*"@]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpio) return "";
  return limpio
    .split(" ")
    .map((palabra) => `${palabra}*`)
    .join(" ");
}

/** Condición keyset "estrictamente después de `c`" sobre (orden DESC, scoreAutoridad DESC, id ASC). */
function condicionKeyset(c: CursorBusqueda | null): Prisma.Sql {
  if (!c) return Prisma.empty;
  return Prisma.sql`WHERE (t.orden < ${c.o}
    OR (t.orden = ${c.o} AND t.scoreAutoridad < ${c.s})
    OR (t.orden = ${c.o} AND t.scoreAutoridad = ${c.s} AND t.id > ${c.id}))`;
}

/** Fila cruda común (con las columnas de orden internas, que NO salen en el DTO). */
type FilaOrden = { orden: unknown; scoreAutoridad: unknown; id: string };

/** Construye la página + el próximo cursor a partir de las filas (se pide una de más para saber si hay más). */
function paginar<F extends FilaOrden, T>(
  filas: F[],
  limite: number,
  aDto: (f: F) => T,
): PaginaBusqueda<T> {
  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  const ultima = pagina[pagina.length - 1];
  const proximoCursor =
    hayMas && ultima
      ? codificarCursor({
          o: Number(ultima.orden),
          s: Number(ultima.scoreAutoridad),
          id: ultima.id,
        })
      : null;
  return { items: pagina.map(aDto), proximoCursor };
}

// ============================================================================
// USUARIOS
// ============================================================================

type FilaUsuario = FilaOrden & {
  username: string | null;
  displayName: string | null;
  image: string | null;
};

/**
 * Busca USUARIOS públicos por `q`. PREFIJO indexado (username y displayName) + FULLTEXT BOOLEAN
 * word-prefix (>= BUSCAR_MIN_FULLTEXT); orden exacto/prefijo -> relevancia -> scoreAutoridad -> id
 * (keyset). Consulta corta -> solo prefijo (username y displayName).
 */
export async function buscarUsuarios(
  db: PrismaClient,
  q: string,
  cursor: string | null,
  limite: number = BUSCAR_LIMITE,
): Promise<PaginaBusqueda<UsuarioBusqueda>> {
  const termino = q.trim();
  if (!termino) return { items: [], proximoCursor: null };
  const c = decodificarCursor(cursor);
  const prefijo = `${escaparLike(termino)}%`;
  const expr = expresionBoolean(termino);
  const usarFulltext = termino.length >= BUSCAR_MIN_FULLTEXT && expr !== "";

  // Exactitud: username EXACTO (2) > prefijo en username/displayName (1) > solo por fulltext (0).
  const rango = Prisma.sql`CASE
    WHEN username = ${termino} THEN 2
    WHEN username LIKE ${prefijo} OR displayName LIKE ${prefijo} THEN 1
    ELSE 0 END`;

  const interior = usarFulltext
    ? // FULLTEXT BOOLEAN word-prefix + prefijo indexado + exacto (relevancia como 2ª dimensión).
      Prisma.sql`
        SELECT id, username, displayName, image, scoreAutoridad,
          (${rango} * ${RANGO_FACTOR}
            + MATCH(username, displayName) AGAINST (${expr} IN BOOLEAN MODE)) AS orden
        FROM \`User\`
        WHERE deletedAt IS NULL AND bannedAt IS NULL AND username IS NOT NULL
          AND (MATCH(username, displayName) AGAINST (${expr} IN BOOLEAN MODE)
               OR username = ${termino} OR username LIKE ${prefijo} OR displayName LIKE ${prefijo})`
    : // CORTO (o término sin contenido para fulltext): solo PREFIJO indexado (username y displayName).
      Prisma.sql`
        SELECT id, username, displayName, image, scoreAutoridad,
          (${rango} * ${RANGO_FACTOR}) AS orden
        FROM \`User\`
        WHERE deletedAt IS NULL AND bannedAt IS NULL AND username IS NOT NULL
          AND (username LIKE ${prefijo} OR displayName LIKE ${prefijo})`;

  const filas = await db.$queryRaw<FilaUsuario[]>(Prisma.sql`
    SELECT t.id, t.username, t.displayName, t.image, t.orden, t.scoreAutoridad
    FROM ( ${interior} ) t
    ${condicionKeyset(c)}
    ORDER BY t.orden DESC, t.scoreAutoridad DESC, t.id ASC
    LIMIT ${limite + 1}`);

  return paginar(filas, limite, (f) => ({
    id: f.id,
    username: f.username,
    displayName: f.displayName,
    image: f.image,
  }));
}

// ============================================================================
// RETOS
// ============================================================================

type FilaReto = FilaOrden & {
  title: string;
  category: string;
  prizeAmountCents: unknown;
  prizeCurrency: string;
  deadline: Date;
};

/**
 * Busca RETOS PUBLISHED por `q`. PREFIJO indexado sobre `title` (`LIKE 'x%'`) + FULLTEXT BOOLEAN
 * word-prefix (>= BUSCAR_MIN_FULLTEXT), mismo orden. Consulta CORTA -> solo prefijo (ya indexado con el
 * btree de `title`), NO vacío.
 */
export async function buscarRetos(
  db: PrismaClient,
  q: string,
  cursor: string | null,
  limite: number = BUSCAR_LIMITE,
): Promise<PaginaBusqueda<RetoBusqueda>> {
  const termino = q.trim();
  if (!termino) return { items: [], proximoCursor: null };
  const c = decodificarCursor(cursor);
  const prefijo = `${escaparLike(termino)}%`;
  const expr = expresionBoolean(termino);
  const usarFulltext = termino.length >= BUSCAR_MIN_FULLTEXT && expr !== "";

  const rango = Prisma.sql`CASE
    WHEN title = ${termino} THEN 2
    WHEN title LIKE ${prefijo} THEN 1
    ELSE 0 END`;

  const interior = usarFulltext
    ? Prisma.sql`
        SELECT id, title, category, prizeAmountCents, prizeCurrency, deadline, scoreAutoridad,
          (${rango} * ${RANGO_FACTOR} + MATCH(title) AGAINST (${expr} IN BOOLEAN MODE)) AS orden
        FROM \`Challenge\`
        WHERE status = 'PUBLISHED'
          AND (MATCH(title) AGAINST (${expr} IN BOOLEAN MODE)
               OR title = ${termino} OR title LIKE ${prefijo})`
    : Prisma.sql`
        SELECT id, title, category, prizeAmountCents, prizeCurrency, deadline, scoreAutoridad,
          (${rango} * ${RANGO_FACTOR}) AS orden
        FROM \`Challenge\`
        WHERE status = 'PUBLISHED' AND title LIKE ${prefijo}`;

  const filas = await db.$queryRaw<FilaReto[]>(Prisma.sql`
    SELECT t.id, t.title, t.category, t.prizeAmountCents, t.prizeCurrency, t.deadline, t.orden,
      t.scoreAutoridad
    FROM ( ${interior} ) t
    ${condicionKeyset(c)}
    ORDER BY t.orden DESC, t.scoreAutoridad DESC, t.id ASC
    LIMIT ${limite + 1}`);

  return paginar(filas, limite, (f) => ({
    id: f.id,
    title: f.title,
    category: f.category,
    prizeAmountCents: Number(f.prizeAmountCents),
    prizeCurrency: f.prizeCurrency,
    deadline: f.deadline,
  }));
}
