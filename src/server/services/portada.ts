/**
 * LA PORTADA (Fase 9 · P14): las cifras del hero, el reto destacado y la rejilla, todo con datos REALES,
 * y el destacado que elige el ADMIN.
 *
 * ┌─ «ABIERTO» SE DICE UNA VEZ ────────────────────────────────────────────────────────────────────┐
 * │ `retoAbiertoWhere` es la regla de las tres cosas: cifras, destacado y rejilla. La misma que la   │
 * │ lista pública de retos (publicado, no borrado, ya empezado y sin cerrar) y, además, que un reto │
 * │ de EMPRESA tenga el pago recibido —`publicarReto` ya no publica uno sin él; aquí se repite por  │
 * │ si un día cambia aquella puerta—. Si cada bloque tuviera su copia, la portada diría «12 retos   │
 * │ abiertos» y enseñaría 11.                                                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EL DESTACADO: UNO, POR CONSTRUCCIÓN ──────────────────────────────────────────────────────────┐
 * │ El admin elige UNO, que se guarda como UN valor en `SystemState` (`CLAVE_RETO_DESTACADO`): no hay│
 * │ un booleano por reto, así que dos destacados a la vez no se pueden escribir. Marcar otro          │
 * │ sustituye; quitarlo deja la portada en AUTOMÁTICO (el abierto de mayor premio). Si el elegido se │
 * │ cierra, se retira o se borra, la portada cae sola al automático —se resuelve al leer, no hace    │
 * │ falta ningún job— y el panel lo enseña como CADUCADO. Cada cambio deja su AuditLog.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import "server-only";

import { CLAVE_RETO_DESTACADO, PORTADA_CACHE_MS, REJILLA_PORTADA_N } from "@/config/constants";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { type CifrasPortada, ordenarRejilla } from "@/lib/portada";
import type { Db } from "@/server/db/types";

import { conReintentos } from "./publicidad-cerrojos";
import { NO_BORRADO, type RetoPublicoVista, SELECT_VISTA, aVista } from "./retos-publico";
import { escribirEstado, leerEstado } from "./system-state";

/** LA REGLA DE «ABIERTO» de la portada (ver la cabecera). */
export function retoAbiertoWhere(ahora: Date): Prisma.ChallengeWhereInput {
  return {
    ...NO_BORRADO,
    status: "PUBLISHED",
    startsAt: { lte: ahora },
    deadline: { gt: ahora },
    OR: [{ empresaId: null }, { pagoRecibidoEn: { not: null } }],
  };
}

/** Un reto de la portada: lo de la tarjeta, más sus participantes y votos REALES (el hero los enseña). */
export interface RetoPortada extends RetoPublicoVista {
  participantes: number;
  votos: number;
}

export interface DatosPortada {
  cifras: CifrasPortada;
  /** El reto del hero, o `null` si no hay ninguno abierto. `elegido` = lo marcó el admin. */
  destacado: { reto: RetoPortada; elegido: boolean } | null;
  /** La rejilla, sin el destacado. */
  rejilla: RetoPublicoVista[];
}

/** Las cifras del hero: retos abiertos, la suma de sus premios y en cuántas categorías. */
export async function cifrasPortada(db: Db, ahora: Date): Promise<CifrasPortada> {
  const where = retoAbiertoWhere(ahora);
  const [agregado, categorias] = await Promise.all([
    db.challenge.aggregate({ where, _count: { _all: true }, _sum: { prizeAmountCents: true } }),
    db.challenge.groupBy({ by: ["category"], where }),
  ]);
  return {
    retosAbiertos: agregado._count._all,
    premiosCents: agregado._sum.prizeAmountCents ?? 0,
    categorias: categorias.length,
  };
}

/** Participantes (participaciones publicadas, con su vídeo publicado) y votos de un reto. */
async function participacionDe(db: Db, challengeId: string) {
  const a = await db.submission.aggregate({
    where: { challengeId, status: "PUBLISHED", video: { is: { status: "PUBLISHED" } } },
    _count: { _all: true },
    _sum: { voteCount: true },
  });
  return { participantes: a._count._all, votos: a._sum.voteCount ?? 0 };
}

/**
 * EL RETO DEL HERO: el que eligió el admin si sigue abierto; si no, el automático (el abierto de mayor
 * premio; empate, el que cierra antes). `null` si no hay ninguno abierto: la portada enseña otra cosa,
 * nunca un reto falso.
 */
export async function retoDestacadoPortada(
  db: Db,
  ahora: Date,
): Promise<{ reto: RetoPortada; elegido: boolean; id: string } | null> {
  const abierto = retoAbiertoWhere(ahora);
  const select = { ...SELECT_VISTA, id: true } as const;
  const idElegido = await leerEstado(db, CLAVE_RETO_DESTACADO);
  const elegido = idElegido
    ? await db.challenge.findFirst({ where: { ...abierto, id: idElegido }, select })
    : null;
  const fila =
    elegido ??
    (await db.challenge.findFirst({
      where: abierto,
      orderBy: [{ prizeAmountCents: "desc" }, { deadline: "asc" }, { id: "asc" }],
      select,
    }));
  if (!fila) return null;
  const { id, ...vista } = fila;
  return {
    id,
    elegido: elegido !== null,
    reto: { ...aVista(vista), ...(await participacionDe(db, id)) },
  };
}

/** LA REJILLA: los abiertos menos el destacado, en el orden de `ordenarRejilla`. */
export async function rejillaPortada(
  db: Db,
  ahora: Date,
  excluirId: string | null,
): Promise<RetoPublicoVista[]> {
  const filas = await db.challenge.findMany({
    where: { ...retoAbiertoWhere(ahora), ...(excluirId ? { id: { not: excluirId } } : {}) },
    // Acotado: los abiertos son del orden de la decena (decisión del admin); el techo es por si acaso.
    take: 60,
    orderBy: [{ deadline: "asc" }, { id: "asc" }],
    select: SELECT_VISTA,
  });
  return ordenarRejilla(filas.map(aVista), ahora.getTime()).slice(0, REJILLA_PORTADA_N);
}

// ---------------------------------------------------------------------------------------------------
// La caché corta (decidida con números: ver `PORTADA_CACHE_MS`)
// ---------------------------------------------------------------------------------------------------

/**
 * ┌─ LA CACHÉ ES POR PROCESO, como la de las campañas de hoy (P7) ─────────────────────────────────┐
 * │ Las cifras, el destacado y la rejilla son IGUALES para todos, así que se guardan `PORTADA_CACHE_MS`│
 * │ en la memoria de este `web`: medido, sin ella cada visita hacía 6 consultas más (de 5 a 11). Lo  │
 * │ que no puede esperar —el admin marca o quita el destacado— la VACÍA al confirmar. Y un reto que   │
 * │ cierra dentro de la ventana no sale de la caché: al servirla se quita de la rejilla, y si el que  │
 * │ cierra es el del hero, se vuelve a calcular.                                                     │
 * │                                                                                                  │
 * │ HOY HAY UN SOLO `web`. Con varias instancias, vaciar la de una no vacía las demás: marcar un     │
 * │ destacado tardaría hasta 30 s en verse en las otras (habría que avisarlas, como la de P7).        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
let cache: { hasta: number; datos: DatosPortada } | null = null;

/** Vacía la caché de la portada (marcar o quitar el destacado; los tests). */
export function olvidarCachePortada(): void {
  cache = null;
}

/** Lo de `datosPortada`, desde la caché si está fresca y nada de lo que enseña ha cerrado. */
export async function datosPortadaCacheados(
  db: Db,
  ahora: Date = new Date(),
): Promise<DatosPortada> {
  const t = ahora.getTime();
  if (cache && cache.hasta > t && (cache.datos.destacado?.reto.deadlineMs ?? Infinity) > t) {
    const d = cache.datos;
    return { ...d, rejilla: d.rejilla.filter((r) => r.deadlineMs > t) };
  }
  const datos = await datosPortada(db, ahora);
  cache = { hasta: t + PORTADA_CACHE_MS, datos };
  return datos;
}

/** Todo lo que la portada enseña igual a quien sea. */
export async function datosPortada(db: Db, ahora: Date = new Date()): Promise<DatosPortada> {
  const [cifras, destacado] = await Promise.all([
    cifrasPortada(db, ahora),
    retoDestacadoPortada(db, ahora),
  ]);
  const rejilla = await rejillaPortada(db, ahora, destacado?.id ?? null);
  return {
    cifras,
    destacado: destacado ? { reto: destacado.reto, elegido: destacado.elegido } : null,
    rejilla,
  };
}

// ---------------------------------------------------------------------------------------------------
// El destacado, desde el panel
// ---------------------------------------------------------------------------------------------------

export const ACCION_DESTACADO_MARCADO = "PORTADA_DESTACADO_MARCADO";
export const ACCION_DESTACADO_QUITADO = "PORTADA_DESTACADO_QUITADO";

export interface EstadoDestacadoPanel {
  /** El reto que el admin eligió (aunque ya no esté abierto), o `null`. */
  elegido: { id: string; titulo: string } | null;
  /** El elegido ya no está abierto: la portada usa el automático. */
  caducado: boolean;
  /** El que la portada enseña de verdad ahora, o `null` si no hay ninguno abierto. */
  enPortada: { id: string; titulo: string } | null;
}

/** Lo que el panel enseña del destacado: el elegido, si caducó y cuál sale de verdad. */
export async function estadoDestacadoPanel(
  db: Db,
  ahora: Date = new Date(),
): Promise<EstadoDestacadoPanel> {
  const idElegido = await leerEstado(db, CLAVE_RETO_DESTACADO);
  const [elegido, portada] = await Promise.all([
    idElegido
      ? db.challenge.findUnique({ where: { id: idElegido }, select: { id: true, title: true } })
      : null,
    retoDestacadoPortada(db, ahora),
  ]);
  return {
    elegido: elegido ? { id: elegido.id, titulo: elegido.title } : null,
    caducado: idElegido !== null && !(portada?.elegido ?? false),
    enPortada: portada ? { id: portada.id, titulo: portada.reto.titulo } : null,
  };
}

export type ResultadoDestacado =
  { estado: "hecho" } | { estado: "sin_cambios" } | { estado: "rechazado"; motivo: "NO_ABIERTO" };

/**
 * MARCA un reto como destacado (solo ADMIN: lo exige la ruta). Solo uno PUBLICADO y ABIERTO —con la
 * misma regla que la portada—; un borrador, uno cerrado o uno de empresa sin pagar se rechazan. Marcar
 * otro SUSTITUYE al anterior (es un solo valor). Deja AuditLog con el anterior.
 */
export async function marcarDestacado(
  db: PrismaClient,
  e: { challengeId: string; adminId: string; ahora?: Date },
): Promise<ResultadoDestacado> {
  const ahora = e.ahora ?? new Date();
  // REINTENTA ante 1020/1213: dos admins (o dos pestañas) marcando a la vez escriben la MISMA fila de
  // SystemState, y en MariaDB 11.8 la segunda falla con 1020 en vez de leer una versión vieja. Reintentar
  // es seguro: es un solo valor que se sobrescribe (y el AuditLog de la tx fallida se deshizo con ella).
  const r = await conReintentos(() =>
    db.$transaction(async (tx) => {
      const abierto = await tx.challenge.findFirst({
        where: { ...retoAbiertoWhere(ahora), id: e.challengeId },
        select: { id: true },
      });
      if (!abierto) return { estado: "rechazado", motivo: "NO_ABIERTO" } as const;
      const anterior = await leerEstado(tx, CLAVE_RETO_DESTACADO);
      if (anterior === e.challengeId) return { estado: "sin_cambios" } as const;
      await escribirEstado(tx, CLAVE_RETO_DESTACADO, e.challengeId);
      await tx.auditLog.create({
        data: {
          actorId: e.adminId,
          action: ACCION_DESTACADO_MARCADO,
          targetType: "CHALLENGE",
          targetId: e.challengeId,
          metadata: { anterior },
        },
      });
      return { estado: "hecho" } as const;
    }),
  );
  // Se ve AL MOMENTO: la caché de la portada se vacía DESPUÉS de confirmar (dentro de la transacción,
  // otra petición podría rellenarla con lo de antes).
  if (r.estado === "hecho") olvidarCachePortada();
  return r;
}

/** QUITA el destacado: la portada vuelve al automático. Deja AuditLog con el que había. */
export async function quitarDestacado(
  db: PrismaClient,
  e: { adminId: string },
): Promise<ResultadoDestacado> {
  const r = await conReintentos(() =>
    db.$transaction(async (tx) => {
      const anterior = await leerEstado(tx, CLAVE_RETO_DESTACADO);
      if (anterior === null) return { estado: "sin_cambios" } as const;
      await tx.systemState.delete({ where: { key: CLAVE_RETO_DESTACADO } });
      await tx.auditLog.create({
        data: {
          actorId: e.adminId,
          action: ACCION_DESTACADO_QUITADO,
          targetType: "CHALLENGE",
          targetId: anterior,
          metadata: {},
        },
      });
      return { estado: "hecho" } as const;
    }),
  );
  if (r.estado === "hecho") olvidarCachePortada();
  return r;
}
