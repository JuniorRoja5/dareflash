/**
 * BÚSQUEDA (Fase 1) — usuarios y retos. Escala y futuro-proof:
 *   - TEXTO por índice FULLTEXT de MariaDB (MATCH..AGAINST), nunca `LIKE '%x%'` (full scan).
 *   - Orden ESTABLE en 4 dimensiones: (1) match EXACTO/PREFIJO, (2) relevancia FULLTEXT, (3)
 *     `scoreAutoridad` DESC (columna indexada que recalcula el worker), (4) `id` (desempate). Las tres
 *     primeras se combinan en un `orden` DESC; la búsqueda LEE `scoreAutoridad`, no lo calcula al vuelo.
 *   - Paginación KEYSET (no OFFSET): el cursor lleva (orden, scoreAutoridad, id) y la página siguiente
 *     filtra "estrictamente después" en ese orden -> no repite ni salta filas al insertarse otras.
 *   - Consulta CORTA (< BUSCAR_MIN_FULLTEXT, bajo el token mínimo de FULLTEXT): usuarios caen a un
 *     PREFIJO indexado sobre `username` (`LIKE 'ab%'`, usa el índice UNIQUE); retos NO (no hay índice
 *     de prefijo sobre `title` -> se evita el full scan devolviendo vacío).
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
 * Busca USUARIOS públicos por `q`. FULLTEXT (>= BUSCAR_MIN_FULLTEXT) con orden exacto/prefijo ->
 * relevancia -> scoreAutoridad -> id (keyset). Consulta corta -> prefijo indexado sobre username.
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

  const interior =
    termino.length < BUSCAR_MIN_FULLTEXT
      ? // FALLBACK corto: prefijo indexado sobre username (usa el UNIQUE, sin full scan). `orden` = 0
        // (constante) -> el keyset degenera a (scoreAutoridad DESC, id ASC).
        Prisma.sql`
          SELECT id, username, displayName, image, scoreAutoridad, CAST(0 AS DOUBLE) AS orden
          FROM \`User\`
          WHERE deletedAt IS NULL AND bannedAt IS NULL AND username IS NOT NULL
            AND username LIKE ${prefijo}`
      : // FULLTEXT: incluye también exactos/prefijos que el fulltext pudiera no capturar.
        Prisma.sql`
          SELECT id, username, displayName, image, scoreAutoridad,
            ((CASE WHEN username = ${termino} THEN 2 WHEN username LIKE ${prefijo} THEN 1 ELSE 0 END)
              * ${RANGO_FACTOR}
              + MATCH(username, displayName) AGAINST (${termino} IN NATURAL LANGUAGE MODE)) AS orden
          FROM \`User\`
          WHERE deletedAt IS NULL AND bannedAt IS NULL AND username IS NOT NULL
            AND (MATCH(username, displayName) AGAINST (${termino} IN NATURAL LANGUAGE MODE)
                 OR username = ${termino} OR username LIKE ${prefijo})`;

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
 * Busca RETOS PUBLISHED por `q`. FULLTEXT sobre `title` con el mismo orden. Consulta corta -> vacío (no
 * hay índice de prefijo sobre `title`; se evita el full scan a propósito).
 */
export async function buscarRetos(
  db: PrismaClient,
  q: string,
  cursor: string | null,
  limite: number = BUSCAR_LIMITE,
): Promise<PaginaBusqueda<RetoBusqueda>> {
  const termino = q.trim();
  if (!termino || termino.length < BUSCAR_MIN_FULLTEXT) return { items: [], proximoCursor: null };
  const c = decodificarCursor(cursor);
  const prefijo = `${escaparLike(termino)}%`;

  const interior = Prisma.sql`
    SELECT id, title, category, prizeAmountCents, prizeCurrency, deadline, scoreAutoridad,
      ((CASE WHEN title = ${termino} THEN 2 WHEN title LIKE ${prefijo} THEN 1 ELSE 0 END)
        * ${RANGO_FACTOR}
        + MATCH(title) AGAINST (${termino} IN NATURAL LANGUAGE MODE)) AS orden
    FROM \`Challenge\`
    WHERE status = 'PUBLISHED'
      AND (MATCH(title) AGAINST (${termino} IN NATURAL LANGUAGE MODE)
           OR title = ${termino} OR title LIKE ${prefijo})`;

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
