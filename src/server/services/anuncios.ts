/**
 * ANUNCIOS DEL ADMIN (panel, Fase 4): enviar, repartir y revisar.
 *
 * ENVIAR NO ES REPARTIR. La petición del admin crea el `Announcement` y encola UN job FANOUT_ANUNCIO,
 * en la MISMA transacción (nunca uno sin el otro), y responde. Ni una Notification en la petición: con
 * miles de cuentas, repartir en línea sería una petición que tarda lo que tarde la audiencia y que, si
 * se corta a medias, deja un reparto a medias sin nadie que lo termine.
 *
 * REPARTIR ES IDEMPOTENTE POR LA BD, no por un `if`. El job recorre la audiencia por KEYSET sobre
 * `User.id` (nunca OFFSET) y por cada lote hace un INSERT IGNORE de avisos con la clave
 * (userId, "ANUNCIO", "ANUNCIO", announcementId): es la UNIQUE de Notification la que impide el
 * duplicado. Re-ejecutar el job, reanudarlo tras una caída o correr dos a la vez entrega CERO avisos
 * nuevos a quien ya lo tenía.
 *
 * REANUDABLE: cada ejecución reparte como mucho FANOUT_LOTES_POR_EJECUCION lotes y, si queda
 * audiencia, encola su CONTINUACIÓN con el cursor en el payload. La clave de cada tramo lleva su cursor:
 * re-ejecutar el mismo tramo no encola dos continuaciones. El cursor es solo EFICIENCIA (no volver a
 * recorrer desde el principio): la corrección la da la UNIQUE.
 *
 * AUDIENCIA "TODOS": las cuentas reales que EXISTÍAN al enviar (`createdAt <= anuncio.createdAt`), sin
 * borradas ni baneadas. Con ese corte, `targetCount` (la foto al enviar) y el recuento de avisos miden
 * lo mismo, y el progreso es exacto por construcción. Quien se registra después no lo recibe: el anuncio
 * era para quien estaba. Quien es baneado o borrado ANTES de que el reparto le llegue no lo recibe (no
 * debe), y su anuncio termina por debajo del objetivo: la revisión lo dice, en vez de pintarlo "en
 * reparto" para siempre.
 *
 * Sin `server-only`, como el resto de lo que usa el worker.
 */
import {
  ANUNCIO_TEXTO_MAX,
  ANUNCIO_TEXTO_MIN,
  ANUNCIOS_PAGINA,
  FANOUT_LOTE,
  FANOUT_LOTES_POR_EJECUCION,
  INSPECTOR_NOTIF_PAGINA,
  type TipoNotificacion,
} from "@/config/constants";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { FiltrosInspector } from "@/lib/filtros-inspector";
import { AvisoSchema, avisoAnuncio, textoAviso } from "@/lib/notificaciones";
import type { Db } from "@/server/db/types";
import { textosDeAnuncios } from "@/server/services/notificaciones";

export const TIPO_JOB_FANOUT = "FANOUT_ANUNCIO";

export class AnuncioError extends Error {
  constructor(
    public readonly code: "TEXTO_INVALIDO",
    message: string,
  ) {
    super(message);
    this.name = "AnuncioError";
  }
}

/** Clave del ENVÍO: una por intención del admin. Un doble clic es el mismo anuncio. */
export function claveEnvio(adminId: string, clave: string): string {
  return `ANUNCIO:${adminId}:${clave}`;
}

/** Clave de cada TRAMO del reparto: el primero ("inicio") y cada continuación, con su cursor. */
export function claveTramo(announcementId: string, desde: string | null): string {
  return `${TIPO_JOB_FANOUT}:${announcementId}:${desde ?? "inicio"}`;
}

/** La audiencia TODOS: cuentas reales que existían en `hasta` (ni borradas ni baneadas). */
function audiencia(hasta: Date): Prisma.UserWhereInput {
  return { deletedAt: null, bannedAt: null, createdAt: { lte: hasta } };
}

const esDuplicado = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Cuántas cuentas recibirían un anuncio enviado ahora (lo que el panel enseña antes de enviar). */
export function tamanoAudiencia(db: Db, now: Date = new Date()): Promise<number> {
  return db.user.count({ where: audiencia(now) });
}

export interface AnuncioEnviado {
  id: string;
  targetCount: number;
  /** `false` = esa clave ya estaba enviada (reenvío, doble clic): no se ha creado otro. */
  creado: boolean;
}

/**
 * ENVIAR: crea el anuncio y encola su reparto, en UNA transacción. No escribe ni un aviso.
 */
export async function enviarAnuncio(
  db: PrismaClient,
  entrada: { adminId: string; texto: string; clave: string },
  now: Date = new Date(),
): Promise<AnuncioEnviado> {
  const texto = entrada.texto.trim();
  if (texto.length < ANUNCIO_TEXTO_MIN || texto.length > ANUNCIO_TEXTO_MAX) {
    throw new AnuncioError(
      "TEXTO_INVALIDO",
      `El anuncio tiene que tener entre ${ANUNCIO_TEXTO_MIN} y ${ANUNCIO_TEXTO_MAX} caracteres.`,
    );
  }
  const idempotencyKey = claveEnvio(entrada.adminId, entrada.clave);
  const yaEnviado = () =>
    db.announcement.findUnique({
      where: { idempotencyKey },
      select: { id: true, targetCount: true },
    });

  const previo = await yaEnviado();
  if (previo) return { ...previo, creado: false };

  try {
    return await db.$transaction(async (tx) => {
      // La FOTO de la audiencia, con el MISMO corte que usará el reparto (`createdAt <= now`).
      const targetCount = await tx.user.count({ where: audiencia(now) });
      const a = await tx.announcement.create({
        data: {
          texto,
          audiencia: "TODOS",
          targetCount,
          createdBy: entrada.adminId,
          idempotencyKey,
          createdAt: now,
        },
        select: { id: true, targetCount: true },
      });
      await tx.job.create({
        data: {
          type: TIPO_JOB_FANOUT,
          payload: { announcementId: a.id },
          runAt: now,
          idempotencyKey: claveTramo(a.id, null),
        },
      });
      return { ...a, creado: true };
    });
  } catch (e) {
    // Dos envíos A LA VEZ con la misma clave: la UNIQUE deja pasar uno, y el otro devuelve ese.
    if (esDuplicado(e)) {
      const ganador = await yaEnviado();
      if (ganador) return { ...ganador, creado: false };
    }
    throw e;
  }
}

export interface TramoReparto {
  /** Avisos escritos AHORA (los que ya existían no cuentan: INSERT IGNORE). */
  entregadas: number;
  /** Cursor para el tramo siguiente, o `null` si ya no queda audiencia. */
  siguiente: string | null;
}

/**
 * REPARTIR un tramo: desde `desde` (exclusivo), hasta `lotes` lotes de `lote` cuentas, por keyset.
 */
export async function repartirAnuncio(
  db: Db,
  announcementId: string,
  desde: string | null,
  opciones: { lote?: number; lotes?: number } = {},
): Promise<TramoReparto> {
  const lote = opciones.lote ?? FANOUT_LOTE;
  const lotes = opciones.lotes ?? FANOUT_LOTES_POR_EJECUCION;

  const anuncio = await db.announcement.findUnique({
    where: { id: announcementId },
    select: { id: true, createdAt: true },
  });
  // Un anuncio que no existe no tiene a quién repartir: el tramo termina (reintentar no lo arregla).
  if (!anuncio) return { entregadas: 0, siguiente: null };

  // El aviso se VALIDA una vez: es el mismo para toda la audiencia salvo el destinatario.
  const aviso = AvisoSchema.parse(avisoAnuncio(anuncio.id));
  const datos = aviso.datos as Prisma.InputJsonValue;

  let cursor = desde;
  let entregadas = 0;
  for (let i = 0; i < lotes; i += 1) {
    const cuentas = await db.user.findMany({
      where: { ...audiencia(anuncio.createdAt), ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: lote,
      select: { id: true },
    });
    if (cuentas.length === 0) return { entregadas, siguiente: null };

    const r = await db.notification.createMany({
      data: cuentas.map((c) => ({
        userId: c.id,
        tipo: aviso.tipo,
        refType: aviso.refType,
        refId: aviso.refId,
        datos,
      })),
      // INSERT IGNORE: quien ya lo tenía (re-ejecución, reanudación, dos repartos a la vez) no recibe
      // otro. Es LA guarda de idempotencia del reparto.
      skipDuplicates: true,
    });
    entregadas += r.count;
    cursor = cuentas[cuentas.length - 1]!.id;
    if (cuentas.length < lote) return { entregadas, siguiente: null };
  }
  return { entregadas, siguiente: cursor };
}

/** Encola el tramo siguiente. Su clave lleva el cursor: el mismo tramo, re-ejecutado, no encola dos. */
export async function encolarTramo(
  db: Db,
  announcementId: string,
  desde: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    await db.job.create({
      data: {
        type: TIPO_JOB_FANOUT,
        payload: { announcementId, desde },
        runAt: now,
        idempotencyKey: claveTramo(announcementId, desde),
      },
    });
    return true;
  } catch (e) {
    if (esDuplicado(e)) return false;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------
// REVISAR: dos lecturas por keyset, sin contadores denormalizados.
// ---------------------------------------------------------------------------------------------------

function codificarCursor(ms: number, id: string): string {
  return `${ms}.${id}`;
}

/** Cursor inválido o manipulado -> primera página. Nunca una excepción por un query param. */
function leerCursor(raw: string | null | undefined): { en: Date; id: string } | null {
  if (!raw) return null;
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const ms = Number(m[1]);
  if (!Number.isSafeInteger(ms)) return null;
  return { en: new Date(ms), id: m[2] };
}

const despuesDe = (c: { en: Date; id: string } | null) =>
  c ? { OR: [{ createdAt: { lt: c.en } }, { createdAt: c.en, id: { lt: c.id } }] } : {};

/**
 * - `entregado`: ya lo tienen todas las cuentas del objetivo.
 * - `repartiendo`: le quedan tramos pendientes o en curso.
 * - `fallido`: un tramo agotó sus reintentos; lo ya entregado sigue entregado.
 * - `terminado`: acabó por debajo del objetivo porque alguna cuenta se borró o fue baneada antes de
 *   que el reparto le llegara (y no debía recibirlo).
 */
export type EstadoAnuncio = "entregado" | "repartiendo" | "fallido" | "terminado";

export interface AnuncioRevision {
  id: string;
  texto: string;
  creadoEnMs: number;
  /** Handle del admin que lo envió. */
  autor: string | null;
  targetCount: number;
  /** COUNT de sus avisos: exacto por construcción. */
  entregadas: number;
  estado: EstadoAnuncio;
}

export interface PaginaAnuncios {
  items: AnuncioRevision[];
  nextCursor: string | null;
}

/**
 * Anuncios enviados, más nuevos primero, por keyset. El PROGRESO es el COUNT de sus avisos (índice
 * [refType, refId]) sobre `targetCount`. Cuatro consultas por página, haya los anuncios que haya:
 * la página, los recuentos, los autores y los tramos pendientes.
 */
export async function listarAnuncios(
  db: Db,
  opciones: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaAnuncios> {
  const limite = Math.min(Math.max(opciones.limite ?? ANUNCIOS_PAGINA, 1), 50);
  const filas = await db.announcement.findMany({
    where: despuesDe(leerCursor(opciones.cursor)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    select: { id: true, texto: true, createdAt: true, createdBy: true, targetCount: true },
  });
  const pagina = filas.slice(0, limite);
  if (pagina.length === 0) return { items: [], nextCursor: null };
  const ids = pagina.map((a) => a.id);

  const [conteos, autores, tramos] = await Promise.all([
    db.notification.groupBy({
      by: ["refId"],
      where: { refType: "ANUNCIO", tipo: "ANUNCIO", refId: { in: ids } },
      _count: { _all: true },
    }),
    db.user.findMany({
      where: { id: { in: [...new Set(pagina.map((a) => a.createdBy))] } },
      select: { id: true, username: true },
    }),
    db.job.findMany({
      where: {
        type: TIPO_JOB_FANOUT,
        status: { in: ["PENDING", "RUNNING", "FAILED"] },
        OR: ids.map((id) => ({ idempotencyKey: { startsWith: `${TIPO_JOB_FANOUT}:${id}:` } })),
      },
      select: { idempotencyKey: true, status: true },
    }),
  ]);

  const entregadasDe = new Map(conteos.map((c) => [c.refId, c._count._all]));
  const handle = new Map(autores.map((u) => [u.id, u.username]));

  const items = pagina.map((a): AnuncioRevision => {
    const propios = tramos.filter((t) =>
      t.idempotencyKey?.startsWith(`${TIPO_JOB_FANOUT}:${a.id}:`),
    );
    const entregadas = entregadasDe.get(a.id) ?? 0;
    const estado: EstadoAnuncio =
      entregadas >= a.targetCount
        ? "entregado"
        : propios.some((t) => t.status !== "FAILED")
          ? "repartiendo"
          : propios.some((t) => t.status === "FAILED")
            ? "fallido"
            : "terminado";
    return {
      id: a.id,
      texto: a.texto,
      creadoEnMs: a.createdAt.getTime(),
      autor: handle.get(a.createdBy) ?? null,
      targetCount: a.targetCount,
      entregadas,
      estado,
    };
  });

  const ultima = pagina[pagina.length - 1]!;
  return {
    items,
    nextCursor:
      filas.length > limite ? codificarCursor(ultima.createdAt.getTime(), ultima.id) : null,
  };
}

/**
 * Una notificación del sistema tal y como la ve el INSPECTOR. Sin `refId`, sin `refType`, sin
 * `datos`: en un voto, la clave del hecho lleva dentro al VOTANTE (misma regla que la bandeja).
 */
export interface NotificacionInspector {
  id: string;
  /** Handle del destinatario. */
  usuario: string | null;
  tipo: TipoNotificacion;
  /** El texto que ve (o verá) la persona; `null` si la fila no se sabe pintar. */
  texto: string | null;
  leida: boolean;
  creadaMs: number;
}

export interface PaginaInspector {
  items: NotificacionInspector[];
  nextCursor: string | null;
}

/**
 * INSPECTOR (todas las cuentas, solo lectura): las notificaciones ya emitidas, más nuevas primero,
 * por keyset, con filtros de usuario, tipo y fechas. Con usuario, el índice [userId, createdAt, id];
 * sin él, [createdAt, id].
 */
export async function inspeccionarNotificaciones(
  db: Db,
  filtros: FiltrosInspector,
  opciones: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaInspector> {
  const limite = Math.min(Math.max(opciones.limite ?? INSPECTOR_NOTIF_PAGINA, 1), 100);

  let userId: string | null = null;
  if (filtros.usuario) {
    const u = await db.user.findUnique({
      where: { username: filtros.usuario },
      select: { id: true },
    });
    if (!u) return { items: [], nextCursor: null };
    userId = u.id;
  }

  const filas = await db.notification.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            createdAt: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.hasta ? { lt: filtros.hasta } : {}),
            },
          }
        : {}),
      ...despuesDe(leerCursor(opciones.cursor)),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    select: {
      id: true,
      userId: true,
      tipo: true,
      refType: true,
      refId: true,
      datos: true,
      leidaEn: true,
      createdAt: true,
    },
  });
  const pagina = filas.slice(0, limite);
  if (pagina.length === 0) return { items: [], nextCursor: null };

  const [anuncios, usuarios] = await Promise.all([
    textosDeAnuncios(db, pagina),
    db.user.findMany({
      where: { id: { in: [...new Set(pagina.map((f) => f.userId))] } },
      select: { id: true, username: true },
    }),
  ]);
  const handle = new Map(usuarios.map((u) => [u.id, u.username]));

  const ultima = pagina[pagina.length - 1]!;
  return {
    items: pagina.map((f) => ({
      id: f.id,
      usuario: handle.get(f.userId) ?? null,
      tipo: f.tipo as TipoNotificacion,
      // El MISMO texto que su bandeja, por la misma función. Una fila que no valida no se omite (el
      // admin tiene que verla): sale sin texto.
      texto: textoAviso(f, { anuncios })?.es ?? null,
      leida: f.leidaEn !== null,
      creadaMs: f.createdAt.getTime(),
    })),
    nextCursor:
      filas.length > limite ? codificarCursor(ultima.createdAt.getTime(), ultima.id) : null,
  };
}
