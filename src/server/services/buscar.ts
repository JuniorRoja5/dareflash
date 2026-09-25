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
 *   - UN SOLO MOTOR para los usuarios: el buscador del PANEL es esta misma consulta con `admin` a
 *     true (ve a los suspendidos, trae rol/estado/alta/cifras, admite filtros). Hubo una segunda
 *     búsqueda para el panel, solo por prefijo y sin normalizar el término, y lo único que consiguió
 *     fue que el back-office encontrara menos y peor que la app. El email NO sale de aquí ni en modo
 *     panel: se pide de uno en uno y deja rastro.
 */
import "server-only";

import { BUSCAR_LIMITE, BUSCAR_MIN_FULLTEXT } from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { EstadoCuenta, RolFiltro } from "@/lib/cuentas-listado";

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
  /** Puntos: el avatar de los resultados deriva de ellos su anillo de nivel. Columna del MISMO
   *  SELECT que ya se hacia — no una consulta por fila. */
  puntos: number;
}

/**
 * UNA CUENTA VISTA DESDE EL PANEL. Vive aquí porque aquí se produce (la búsqueda), y lo importa el
 * listado para producir exactamente lo mismo: las dos maneras de llegar a una cuenta —escribir un
 * nombre o recorrer la lista— tienen que pintar la misma fila, o el moderador vería dos verdades.
 *
 * SIN EMAIL, y no por olvido: es el DTO que viaja a una pantalla que lista a mucha gente a la vez.
 * El email se pide de uno en uno y deja rastro (`emailDeCuenta`).
 */
export interface CuentaPanel {
  id: string;
  username: string;
  displayName: string | null;
  image: string | null;
  /** Código interno del rol; el panel lo traduce a copy humano (`ETIQUETA_ROL`). */
  rol: string;
  suspendida: boolean;
  alta: Date;
  puntos: number;
  victorias: number;
}

/** DTO PÚBLICO de un reto en resultados. `publicCode`+`slug` -> URL canónica /retos/{code}-{slug}. */
export interface RetoBusqueda {
  id: string;
  publicCode: string;
  slug: string;
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
 * Normaliza lo que ESCRIBE una persona para buscar a otra.
 *
 * QUITA UNA `@` INICIAL, y ese detalle era un fallo real: los handles se guardan SIN arroba
 * (`username = "yuyu"`), pero nadie escribe un handle sin ella. Buscar «@yuyu» comparaba literalmente
 * contra «yuyu» y no devolvía nada — con la agravante de que el resultado no parecía un error de
 * escritura, sino una cuenta que no existe.
 *
 * Solo la INICIAL: una `@` en medio no es un adorno de handle, y quitarla cambiaría el término. Las
 * del interior ya las neutraliza `expresionBoolean` para el fulltext.
 */
function normalizarTermino(q: string): string {
  return q.trim().replace(/^@/, "").trim();
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
  pointsBalance: unknown;
};

/** Lo que el modo PANEL trae de más: gobierno de la cuenta y sus cifras. Jamás el email. */
type FilaUsuarioAdmin = FilaUsuario & {
  username: string;
  role: string;
  bannedAt: Date | null;
  createdAt: Date;
  pointsBalance: unknown;
  victoriasTotales: unknown;
};

/**
 * De fila cruda a `CuentaPanel`. Los enteros pasan por `Number` porque el driver devuelve los
 * agregados de una consulta cruda como `BigInt`/`Decimal` según el caso, y un `BigInt` no sobrevive a
 * la serialización de un componente de servidor a cliente.
 */
function filaACuenta(f: FilaUsuarioAdmin): CuentaPanel {
  return {
    id: f.id,
    username: f.username,
    displayName: f.displayName,
    image: f.image,
    rol: f.role,
    suspendida: f.bannedAt !== null,
    alta: f.createdAt,
    puntos: Number(f.pointsBalance),
    victorias: Number(f.victoriasTotales),
  };
}

/** Lo que distingue al modo PANEL del público. Sin nada de esto, la búsqueda es la pública. */
export interface OpcionesBusquedaCuentas {
  /** Filtro por rol exacto. `null` = todos. */
  rol?: RolFiltro | null;
  /** Filtro por estado. `null` = activas y suspendidas juntas. */
  estado?: EstadoCuenta | null;
}

/**
 * EL MOTOR DE LA BÚSQUEDA DE USUARIOS, uno solo. La diferencia entre el buscador público y el del
 * panel es un PARÁMETRO (`admin`), no otra implementación: hubo una segunda —solo prefijo, sin
 * normalizar el término— y su único efecto fue que el panel encontrara menos y peor que la app.
 *
 * Lo que cambia con `admin`:
 *   · VISIBILIDAD: el público esconde a los suspendidos (es su trabajo); el panel los ve, porque son
 *     justo a quienes hay que encontrar para levantarles la suspensión. Lo BORRADO no lo ve nadie.
 *   · COLUMNAS: el panel trae rol, estado, alta y cifras. El email NO sale de aquí ni en modo panel:
 *     es PII y tiene su propia puerta, con rastro (`emailDeCuenta`).
 *   · FILTROS: rol y estado, que solo tienen sentido en el panel.
 *
 * Lo que NO cambia: el orden (exacto/prefijo -> relevancia fulltext -> autoridad -> id), el keyset y
 * la normalización del término. Ahí está el valor de que sea una sola consulta.
 */
async function filasDeUsuarios<F extends FilaUsuario>(
  db: PrismaClient,
  q: string,
  cursor: string | null,
  limite: number,
  admin: boolean,
  filtros: OpcionesBusquedaCuentas,
): Promise<F[]> {
  const termino = normalizarTermino(q);
  if (!termino) return [];
  const c = decodificarCursor(cursor);
  const prefijo = `${escaparLike(termino)}%`;
  const expr = expresionBoolean(termino);
  const usarFulltext = termino.length >= BUSCAR_MIN_FULLTEXT && expr !== "";

  // `username IS NOT NULL` estaba aquí y se ha ido: la columna es NOT NULL desde que el handle se
  // auto-genera en el alta, así que era una condición que nunca podía ser falsa.
  const visibilidad = admin ? Prisma.empty : Prisma.sql`AND bannedAt IS NULL`;
  const filtroRol = filtros.rol ? Prisma.sql`AND role = ${filtros.rol}` : Prisma.empty;
  const filtroEstado =
    filtros.estado === "suspendida"
      ? Prisma.sql`AND bannedAt IS NOT NULL`
      : filtros.estado === "activa"
        ? Prisma.sql`AND bannedAt IS NULL`
        : Prisma.empty;

  const columnas = admin
    ? Prisma.sql`id, username, displayName, image, scoreAutoridad,
        role, bannedAt, createdAt, pointsBalance, victoriasTotales`
    : Prisma.sql`id, username, displayName, image, scoreAutoridad, pointsBalance`;

  // Exactitud: username EXACTO (2) > prefijo en username/displayName (1) > solo por fulltext (0).
  const rango = Prisma.sql`CASE
    WHEN username = ${termino} THEN 2
    WHEN username LIKE ${prefijo} OR displayName LIKE ${prefijo} THEN 1
    ELSE 0 END`;

  const donde = Prisma.sql`WHERE deletedAt IS NULL ${visibilidad} ${filtroRol} ${filtroEstado}`;

  const interior = usarFulltext
    ? // FULLTEXT BOOLEAN word-prefix + prefijo indexado + exacto (relevancia como 2ª dimensión).
      Prisma.sql`
        SELECT ${columnas},
          (${rango} * ${RANGO_FACTOR}
            + MATCH(username, displayName) AGAINST (${expr} IN BOOLEAN MODE)) AS orden
        FROM \`User\`
        ${donde}
          AND (MATCH(username, displayName) AGAINST (${expr} IN BOOLEAN MODE)
               OR username = ${termino} OR username LIKE ${prefijo} OR displayName LIKE ${prefijo})`
    : // CORTO (o término sin contenido para fulltext): solo PREFIJO indexado (username y displayName).
      Prisma.sql`
        SELECT ${columnas},
          (${rango} * ${RANGO_FACTOR}) AS orden
        FROM \`User\`
        ${donde}
          AND (username LIKE ${prefijo} OR displayName LIKE ${prefijo})`;

  // `t.*` y no la lista enumerada: las columnas ya las elige `columnas` según el modo, y repetirlas
  // aquí sería el mismo `if` escrito dos veces esperando a divergir.
  return db.$queryRaw<F[]>(Prisma.sql`
    SELECT t.*
    FROM ( ${interior} ) t
    ${condicionKeyset(c)}
    ORDER BY t.orden DESC, t.scoreAutoridad DESC, t.id ASC
    LIMIT ${limite + 1}`);
}

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
  const filas = await filasDeUsuarios<FilaUsuario>(db, q, cursor, limite, false, {});
  return paginar(filas, limite, (f) => ({
    id: f.id,
    username: f.username,
    displayName: f.displayName,
    image: f.image,
    puntos: Number(f.pointsBalance),
  }));
}

/**
 * LA MISMA BÚSQUEDA, vista desde el panel: encuentra también a las cuentas suspendidas y trae con qué
 * decidir (rol, estado, alta, puntos y victorias). Acepta los filtros del listado para que buscar
 * dentro de un filtro siga respetándolo.
 */
export async function buscarCuentas(
  db: PrismaClient,
  q: string,
  cursor: string | null,
  limite: number = BUSCAR_LIMITE,
  filtros: OpcionesBusquedaCuentas = {},
): Promise<PaginaBusqueda<CuentaPanel>> {
  const filas = await filasDeUsuarios<FilaUsuarioAdmin>(db, q, cursor, limite, true, filtros);
  return paginar(filas, limite, filaACuenta);
}

// ============================================================================
// RETOS
// ============================================================================

type FilaReto = FilaOrden & {
  publicCode: string;
  slug: string;
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
        SELECT id, publicCode, slug, title, category, prizeAmountCents, prizeCurrency, deadline, scoreAutoridad,
          (${rango} * ${RANGO_FACTOR} + MATCH(title) AGAINST (${expr} IN BOOLEAN MODE)) AS orden
        FROM \`Challenge\`
        WHERE status = 'PUBLISHED' AND deletedAt IS NULL AND eliminacionProgramadaEn IS NULL
          AND (MATCH(title) AGAINST (${expr} IN BOOLEAN MODE)
               OR title = ${termino} OR title LIKE ${prefijo})`
    : Prisma.sql`
        SELECT id, publicCode, slug, title, category, prizeAmountCents, prizeCurrency, deadline, scoreAutoridad,
          (${rango} * ${RANGO_FACTOR}) AS orden
        FROM \`Challenge\`
        WHERE status = 'PUBLISHED' AND deletedAt IS NULL AND eliminacionProgramadaEn IS NULL AND title LIKE ${prefijo}`;

  const filas = await db.$queryRaw<FilaReto[]>(Prisma.sql`
    SELECT t.id, t.publicCode, t.slug, t.title, t.category, t.prizeAmountCents, t.prizeCurrency,
      t.deadline, t.orden, t.scoreAutoridad
    FROM ( ${interior} ) t
    ${condicionKeyset(c)}
    ORDER BY t.orden DESC, t.scoreAutoridad DESC, t.id ASC
    LIMIT ${limite + 1}`);

  return paginar(filas, limite, (f) => ({
    id: f.id,
    publicCode: f.publicCode,
    slug: f.slug,
    title: f.title,
    category: f.category,
    prizeAmountCents: Number(f.prizeAmountCents),
    prizeCurrency: f.prizeCurrency,
    deadline: f.deadline,
  }));
}
