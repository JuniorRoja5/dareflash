/**
 * NOTIFICACIONES — emitir, listar, contar y marcar como leídas.
 *
 * EMITIR ES "INSERTAR SI NO ESTÁ" (INSERT IGNORE sobre el UNIQUE [userId, tipo, refType, refId]). Es la
 * misma disciplina que los puntos: el aviso de un hecho sale UNA vez por muchas veces que se ejecute el
 * código que lo emite. El cierre de reto se re-ejecuta para auto-repararse; el sondeo de vídeos vuelve
 * a pasar; un votante pulsa dos veces. Nada de eso puede repetir un aviso, y no por un `if` que alguien
 * pueda saltarse, sino porque la BD no deja escribir el segundo.
 *
 * Recibe el cliente por parámetro (`Db`: el normal o el de una transacción), como el resto de
 * servicios: los emisores lo llaman DENTRO de la transacción de su hecho cuando la hay (voto,
 * transición de vídeo, puntos), para que el hecho y su aviso existan los dos o ninguno.
 *
 * Sin `server-only` a propósito, como el ledger y los votos: lo usa también el worker.
 */
import { NOTIF_MARCAR_MAX, NOTIF_NO_LEIDAS_TOPE, type TipoNotificacion } from "@/config/constants";
import type { Prisma } from "@/generated/prisma/client";
import { AvisoSchema, textoAviso, type Aviso } from "@/lib/notificaciones";
import type { Db } from "@/server/db/types";

/**
 * Emite un aviso a `userId`. Devuelve `true` si lo escribió AHORA y `false` si ya existía (no-op).
 *
 * Valida con Zod ANTES de tocar la BD: un aviso mal formado es un bug del emisor y debe reventar en su
 * test, no acabar como una fila que la bandeja no sabe pintar.
 */
export async function emitirAviso(db: Db, userId: string, aviso: Aviso): Promise<boolean> {
  const a = AvisoSchema.parse(aviso);
  const r = await db.notification.createMany({
    data: [
      {
        userId,
        tipo: a.tipo,
        refType: a.refType,
        refId: a.refId,
        datos: a.datos as Prisma.InputJsonValue,
      },
    ],
    // INSERT IGNORE: si el hecho ya tiene aviso, no se escribe otro. Es LA guarda de idempotencia.
    skipDuplicates: true,
  });
  return r.count === 1;
}

/** Un aviso tal como lo pinta la bandeja. Sin `refId`: podría llevar dentro el id de un votante. */
export interface NotificacionVista {
  id: string;
  tipo: TipoNotificacion;
  texto: string;
  href: string;
  leida: boolean;
  creadaMs: number;
}

export interface PaginaNotificaciones {
  items: NotificacionVista[];
  /** Cursor OPACO de la página siguiente; `null` = no hay más. */
  nextCursor: string | null;
}

/** Tope duro por página: el cliente no elige cuánto se le sirve. */
const LIMITE_MAX = 24;

interface PosicionCursor {
  creadoMs: number;
  id: string;
}

/**
 * El cursor lleva la TUPLA COMPLETA del orden (instante, id), no solo el id: la referencia es un VALOR
 * de orden, no una fila que tenga que seguir existiendo (mismo razonamiento que las participaciones).
 */
function codificarCursor(p: PosicionCursor): string {
  return `${p.creadoMs}.${p.id}`;
}

/** Cursor inválido o manipulado -> primera página. Nunca una excepción por un query param. */
function decodificarCursor(raw: string | null | undefined): PosicionCursor | null {
  if (!raw) return null;
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const creadoMs = Number(m[1]);
  if (!Number.isSafeInteger(creadoMs)) return null;
  return { creadoMs, id: m[2] };
}

/**
 * Una página de la bandeja, más recientes primero. KEYSET, jamás OFFSET: con OFFSET, un aviso nuevo que
 * llega mientras se lee desplaza la ventana y la página siguiente repite uno. `(createdAt, id) < (t, i)`
 * con el `id` desempatando, porque dos avisos del mismo cierre nacen en el mismo milisegundo.
 */
export async function listarNotificaciones(
  db: Db,
  userId: string,
  opts: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaNotificaciones> {
  const limite = Math.min(Math.max(1, Math.floor(opts.limite ?? LIMITE_MAX)), LIMITE_MAX);
  const desde = decodificarCursor(opts.cursor);

  const filas = await db.notification.findMany({
    where: {
      userId,
      ...(desde
        ? {
            OR: [
              { createdAt: { lt: new Date(desde.creadoMs) } },
              { createdAt: new Date(desde.creadoMs), id: { lt: desde.id } },
            ],
          }
        : {}),
    },
    // DESC en las DOS columnas: recorrido hacia atrás de una pasada del índice [userId, createdAt, id].
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    select: {
      id: true,
      tipo: true,
      refType: true,
      refId: true,
      datos: true,
      leidaEn: true,
      createdAt: true,
    },
  });

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  // Los ANUNCIOS se pintan con el texto de su `Announcement`, unido por refId: UNA consulta por página.
  const anuncios = await textosDeAnuncios(db, pagina);

  const items: NotificacionVista[] = [];
  for (const f of pagina) {
    // Una fila que no valida (de otra versión, o manipulada) se OMITE: mejor un hueco que un texto roto.
    const t = textoAviso(f, { anuncios });
    if (!t) continue;
    items.push({
      id: f.id,
      tipo: f.tipo as TipoNotificacion,
      texto: t.es,
      href: t.href,
      leida: f.leidaEn !== null,
      creadaMs: f.createdAt.getTime(),
    });
  }

  // El cursor sale de la ÚLTIMA FILA LEÍDA, no del último ítem pintado: si se omitió alguna, la página
  // siguiente no puede volver a servirla.
  const ultima = pagina[pagina.length - 1];
  return {
    items,
    nextCursor:
      hayMas && ultima
        ? codificarCursor({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

/**
 * Texto de los ANUNCIOS de un lote de avisos, por id del anuncio: UNA consulta para todo el lote. El
 * texto vive en `Announcement` y no se copia en cada aviso; lo usan la bandeja y el inspector del panel.
 */
export async function textosDeAnuncios(
  db: Db,
  filas: ReadonlyArray<{ tipo: string; refType: string; refId: string }>,
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      filas.filter((f) => f.tipo === "ANUNCIO" && f.refType === "ANUNCIO").map((f) => f.refId),
    ),
  ];
  if (ids.length === 0) return new Map();
  const anuncios = await db.announcement.findMany({
    where: { id: { in: ids } },
    select: { id: true, texto: true },
  });
  return new Map(anuncios.map((a) => [a.id, a.texto]));
}

/**
 * No-leídas del usuario, CONTADAS (sin contador denormalizado: ver el modelo). Con TOPE: se cuentan como
 * mucho TOPE+1 filas —el LIMIT va dentro del COUNT—, porque pasado el tope el badge dice "99+" y contar
 * las cinco mil restantes no aporta nada. Una sola sentencia: el número es una foto coherente.
 */
export function contarNoLeidas(db: Db, userId: string): Promise<number> {
  return db.notification.count({
    where: { userId, leidaEn: null },
    take: NOTIF_NO_LEIDAS_TOPE + 1,
  });
}

/**
 * Marca como leídas las `ids` que sean del usuario y sigan sin leer. La AUTORIZACIÓN es por
 * CONSTRUCCIÓN: el `userId` va en el WHERE, así que un id ajeno no casa y no se toca (ni se sabe si
 * existe). Idempotente: una ya leída no vuelve a escribirse. Devuelve cuántas cambiaron.
 */
export async function marcarLeidas(
  db: Db,
  userId: string,
  ids: readonly string[],
  ahora: Date = new Date(),
): Promise<number> {
  const unicas = [...new Set(ids)].slice(0, NOTIF_MARCAR_MAX);
  if (unicas.length === 0) return 0;
  const r = await db.notification.updateMany({
    where: { userId, id: { in: unicas }, leidaEn: null },
    data: { leidaEn: ahora },
  });
  return r.count;
}
