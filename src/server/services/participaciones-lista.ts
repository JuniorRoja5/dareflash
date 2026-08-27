/**
 * PARTICIPACIONES visibles de un reto (Fase 2 · 2d), para el detalle. REGLA DEL MÁS RESTRICTIVO: una
 * participación se ve SOLO si `Submission.status = PUBLISHED` Y `Video.status = PUBLISHED` (si cualquiera
 * de los dos no lo está, no se muestra). Orden por `voteCount` desc y, a igualdad, más nuevas primero
 * (índice [challengeId, voteCount]). Devuelve lo justo para pintar la rejilla y reproducir (el poster lo
 * firma el borde con `bunnyVideoId`; el player usa el `videoId` de BD, que reexige PUBLISHED en servidor).
 *
 * PAGINACIÓN KEYSET, jamás `OFFSET`: con OFFSET, retirar una participación entre dos páginas corre la
 * ventana un puesto y el lector se salta una fila que nunca llegará a ver. Aquí el cursor lleva la
 * TUPLA DE ORDEN COMPLETA (votos, instante de creación, id) y la consulta pide, literalmente, "lo que
 * va estrictamente después de esta tupla". Se piden `limite+1` filas: si viene una de más, hay página
 * siguiente. El índice [challengeId, voteCount] sigue sirviendo (el primer término del WHERE es votos).
 *
 * POR QUÉ NO SE USA EL `cursor` DE PRISMA (como sí hace el feed): comprobado con un test, no de
 * memoria. Prisma resuelve el cursor localizando ESA FILA dentro del conjunto ya filtrado; si la fila
 * del cursor deja de cumplir el `where` —exactamente lo que pasa cuando un admin RETIRA la
 * participación que se acababa de servir— la posición se resuelve mal y la página siguiente se come
 * una participación. Con la tupla explícita eso no puede ocurrir: la referencia es un VALOR de orden,
 * no una fila que tenga que seguir existiendo.
 *
 * El desempate por `id` NO es decorativo: `[voteCount, createdAt]` NO es único (dos participaciones con
 * los mismos votos creadas en el mismo instante —lo normal si dos personas participan a la vez, y
 * seguro en los tests, que insertan con el mismo `now()`— empatan). Sin un tercer criterio ÚNICO el
 * orden no es total, la tupla del cursor es ambigua y la paginación duplica o se salta filas.
 */
import "server-only";

import type { Db } from "@/server/db/types";

export interface ParticipacionVista {
  submissionId: string;
  videoId: string;
  bunnyVideoId: string;
  title: string | null;
  votos: number;
  username: string;
  displayName: string | null;
}

/** Estado de MI participación en el reto (para el dueño): visible / procesando / fallida / retirada. */
export type EstadoMiParticipacion = "publicada" | "procesando" | "fallida" | "retirada";

export interface MiParticipacion {
  submissionId: string;
  videoId: string;
  estado: EstadoMiParticipacion;
}

/** Una página de participaciones. `nextCursor = null` significa "no hay más" (fin de la lista). */
export interface PaginaParticipaciones {
  items: ParticipacionVista[];
  /** Cursor OPACO para la SIGUIENTE página. `null` = no hay más. */
  nextCursor: string | null;
}

/** Tamaño de página del detalle: 12 entra justo en la rejilla (1/2/3 columnas) sin dejar hueco feo. */
export const PARTICIPACIONES_LIMITE_DEFECTO = 12;
/** Tope duro por página: el cliente no elige cuánto le servimos (una página no es un volcado). */
export const PARTICIPACIONES_LIMITE_MAX = 24;

/** Posición exacta en el orden: la TUPLA COMPLETA por la que se ordena, no solo el id. */
interface PosicionCursor {
  votos: number;
  creadoMs: number;
  id: string;
}

/**
 * El cursor viaja al cliente, así que se serializa a un texto plano y se REVALIDA al volver. No lleva
 * nada privado: son los mismos votos, el instante de creación y el id que ya se ven en la página.
 */
function codificarCursor(p: PosicionCursor): string {
  return `${p.votos}.${p.creadoMs}.${p.id}`;
}

/** Cursor inválido/manipulado -> `null` = primera página. Nunca una excepción por un query param. */
function decodificarCursor(raw: string | null | undefined): PosicionCursor | null {
  if (!raw) return null;
  const m = /^(-?\d{1,10})\.(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  const votos = Number(m[1]);
  const creadoMs = Number(m[2]);
  if (!Number.isSafeInteger(votos) || !Number.isSafeInteger(creadoMs)) return null;
  return { votos, creadoMs, id: m[3] };
}

/**
 * KEYSET explícito: "estrictamente DESPUÉS de esta tupla en el orden [votos ↓, creado ↓, id ↓]". Es la
 * traducción a Prisma de `(voteCount, createdAt, id) < (v, t, i)`. Lo comparten la lista PÚBLICA y la
 * del PANEL: el orden y el cursor son los mismos, solo cambia QUÉ estados entran (el `where` base).
 */
function filtroDespuesDe(desde: PosicionCursor | null) {
  if (!desde) return {};
  return {
    OR: [
      { voteCount: { lt: desde.votos } },
      { voteCount: desde.votos, createdAt: { lt: new Date(desde.creadoMs) } },
      { voteCount: desde.votos, createdAt: new Date(desde.creadoMs), id: { lt: desde.id } },
    ],
  };
}

/** Orden ÚNICO de las participaciones de un reto (público y panel ven el mismo ranking). */
const ORDEN = [{ voteCount: "desc" }, { createdAt: "desc" }, { id: "desc" }] as const;

/**
 * Lista una PÁGINA de participaciones VISIBLES (Submission PUBLISHED + Video PUBLISHED), más votadas
 * primero. La primera página la sirve el Server Component del detalle; las siguientes, el endpoint
 * público `/api/retos/{id}/participaciones?cursor=…`.
 */
export async function listarParticipacionesVisibles(
  db: Db,
  challengeId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<PaginaParticipaciones> {
  const limite = Math.min(
    Math.max(1, Math.floor(opts.limit ?? PARTICIPACIONES_LIMITE_DEFECTO)),
    PARTICIPACIONES_LIMITE_MAX,
  );
  const despuesDe = filtroDespuesDe(decodificarCursor(opts.cursor));

  const filas = await db.submission.findMany({
    where: { challengeId, status: "PUBLISHED", video: { status: "PUBLISHED" }, ...despuesDe },
    // El `id` desempata (orden TOTAL): sin él la tupla del cursor es ambigua. Ver cabecera.
    orderBy: [...ORDEN],
    // Una fila de más = "¿hay página siguiente?" sin un COUNT aparte.
    take: limite + 1,
    select: {
      id: true,
      voteCount: true,
      createdAt: true,
      video: { select: { id: true, bunnyVideoId: true, title: true } },
      user: { select: { username: true, displayName: true } },
    },
  });

  const hayMas = filas.length > limite;
  const visibles = hayMas ? filas.slice(0, limite) : filas;

  const items = visibles.map((f) => ({
    submissionId: f.id,
    videoId: f.video.id,
    bunnyVideoId: f.video.bunnyVideoId,
    title: f.video.title,
    votos: f.voteCount,
    username: f.user.username,
    displayName: f.user.displayName,
  }));

  const ultima = visibles[visibles.length - 1];
  return {
    items,
    nextCursor:
      hayMas && ultima
        ? codificarCursor({
            votos: ultima.voteCount,
            creadoMs: ultima.createdAt.getTime(),
            id: ultima.id,
          })
        : null,
  };
}

/**
 * MI participación en el reto (la del usuario de la sesión), en CUALQUIER estado, para mostrarle su
 * propio progreso (Procesando/No se pudo procesar) y el botón Reemplazar cuando está publicada. `null`
 * si no participa. El estado se deriva del Video de la Submission (el más restrictivo ya se aplicó al
 * repuntar; aquí basta el estado del vídeo actual de la participación).
 */
export async function miParticipacion(
  db: Db,
  challengeId: string,
  userId: string,
): Promise<MiParticipacion | null> {
  const sub = await db.submission.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
    select: { id: true, video: { select: { id: true, status: true } } },
  });
  if (!sub) return null;
  const estado: EstadoMiParticipacion =
    sub.video.status === "PUBLISHED"
      ? "publicada"
      : sub.video.status === "PENDING"
        ? "procesando"
        : sub.video.status === "FAILED"
          ? "fallida"
          : "retirada"; // REMOVED / REJECTED
  return { submissionId: sub.id, videoId: sub.video.id, estado };
}

/**
 * Estado de una participación tal y como lo lee el ADMIN en el panel. Es la MISMA derivación que ve el
 * dueño en su detalle, pero nombrada desde la moderación. Copy humano, nunca PENDING/FAILED/REMOVED.
 */
export type EstadoParticipacionAdmin = "visible" | "procesando" | "no-publicada" | "retirada";

export interface ParticipacionAdmin extends ParticipacionVista {
  estado: EstadoParticipacionAdmin;
  creadaEn: Date;
  /** Solo un vídeo PUBLISHED es reproducible (lo reexige el endpoint firmado); el resto, no. */
  reproducible: boolean;
}

export interface PaginaParticipacionesAdmin {
  items: ParticipacionAdmin[];
  nextCursor: string | null;
}

/**
 * Deriva el estado visible para el panel. REMOVED en cualquiera de los dos manda (una participación
 * retirada está retirada, aunque su vídeo siguiera publicado y al revés). Después, el vídeo decide.
 */
function estadoAdmin(sub: string, video: string): EstadoParticipacionAdmin {
  if (sub === "REMOVED" || video === "REMOVED") return "retirada";
  if (video === "PUBLISHED") return sub === "PUBLISHED" ? "visible" : "procesando";
  if (video === "PENDING") return "procesando";
  return "no-publicada"; // FAILED / REJECTED
}

/**
 * Lista una PÁGINA de participaciones de un reto PARA EL PANEL: TODAS, en cualquier estado (visibles,
 * en proceso, no publicadas y retiradas). Es la diferencia con la lista pública, que solo devuelve las
 * visibles — moderar exige ver también lo que el público NO ve, y comprobar que una retirada sigue
 * retirada.
 *
 * MISMO orden y MISMO cursor que la pública (se comparten `ORDEN` y `filtroDespuesDe`): el admin ve el
 * ranking en el mismo orden que la gente, con las ocultas intercaladas donde les toca.
 *
 * El GUARD de rol NO vive aquí: lo pone el endpoint (`requireRole("ADMIN")`), como el resto de
 * servicios. Este módulo solo consulta.
 */
export async function listarParticipacionesAdmin(
  db: Db,
  challengeId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<PaginaParticipacionesAdmin> {
  const limite = Math.min(
    Math.max(1, Math.floor(opts.limit ?? PARTICIPACIONES_LIMITE_DEFECTO)),
    PARTICIPACIONES_LIMITE_MAX,
  );
  const despuesDe = filtroDespuesDe(decodificarCursor(opts.cursor));

  const filas = await db.submission.findMany({
    where: { challengeId, ...despuesDe },
    orderBy: [...ORDEN],
    take: limite + 1,
    select: {
      id: true,
      status: true,
      voteCount: true,
      createdAt: true,
      video: { select: { id: true, bunnyVideoId: true, title: true, status: true } },
      user: { select: { username: true, displayName: true } },
    },
  });

  const hayMas = filas.length > limite;
  const visibles = hayMas ? filas.slice(0, limite) : filas;

  const items: ParticipacionAdmin[] = visibles.map((f) => ({
    submissionId: f.id,
    videoId: f.video.id,
    bunnyVideoId: f.video.bunnyVideoId,
    title: f.video.title,
    votos: f.voteCount,
    username: f.user.username,
    displayName: f.user.displayName,
    estado: estadoAdmin(f.status, f.video.status),
    creadaEn: f.createdAt,
    reproducible: f.video.status === "PUBLISHED",
  }));

  const ultima = visibles[visibles.length - 1];
  return {
    items,
    nextCursor:
      hayMas && ultima
        ? codificarCursor({
            votos: ultima.voteCount,
            creadoMs: ultima.createdAt.getTime(),
            id: ultima.id,
          })
        : null,
  };
}
