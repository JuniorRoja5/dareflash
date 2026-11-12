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

import {
  CLAVE_RETO_DESTACADO,
  GANADORES_PORTADA_LECTURA,
  GANADORES_PORTADA_N,
  PORTADA_CACHE_MS,
  PROXIMOS_PORTADA_N,
  REJILLA_PORTADA_N,
} from "@/config/constants";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { type CifrasPortada, ordenarRejilla } from "@/lib/portada";
import type { Db } from "@/server/db/types";

import { conReintentos } from "./publicidad-cerrojos";
import { NO_BORRADO, type RetoPublicoVista, SELECT_VISTA, aVista } from "./retos-publico";
import { escribirEstado, leerEstado } from "./system-state";
import { USUARIO_VISIBLE } from "./usuario-visible";
import { vipsActivosEntre } from "./vip";

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

/** Un ganador REAL de la portada: el puesto 1 de un reto cerrado, con lo que cobró. */
export interface GanadorPortada {
  userId: string;
  username: string;
  displayName: string | null;
  image: string | null;
  /** Para el anillo de NIVEL del avatar, como en el ranking. */
  puntos: number;
  esVip: boolean;
  colorNombre: string | null;
  retoTitulo: string;
  /** `/retos/<publicCode>-<slug>`: el reto donde ganó. */
  retoHref: string;
  /** El premio OTORGADO (congelado en el resultado), no el del reto hoy. */
  premioCents: number;
  moneda: string;
  /** Cuándo se dio el resultado (el cierre). */
  cuandoMs: number;
}

export interface DatosPortada {
  cifras: CifrasPortada;
  /** El reto del hero, o `null` si no hay ninguno abierto. `elegido` = lo marcó el admin. */
  destacado: { reto: RetoPortada; elegido: boolean } | null;
  /** La rejilla, sin el destacado. */
  rejilla: RetoPublicoVista[];
  /** Retos ABIERTOS por categoría (clave de `CATEGORIES` -> cuántos). Solo las que tienen alguno. */
  porCategoria: Record<string, number>;
  /** Los que abren pronto (con la misma regla que «abierto», salvo la fecha de apertura). */
  proximos: RetoPublicoVista[];
  /** Los últimos ganadores reales, solo los que se pueden enseñar. */
  ganadores: GanadorPortada[];
}

/**
 * Las cifras del hero (retos abiertos, la suma de sus premios y en cuántas categorías) y, de la MISMA
 * agrupación, cuántos abiertos hay en cada categoría: el bloque de categorías no añade consulta.
 */
async function cifrasYCategoriasPortada(
  db: Db,
  ahora: Date,
): Promise<{ cifras: CifrasPortada; porCategoria: Record<string, number> }> {
  const where = retoAbiertoWhere(ahora);
  const [agregado, categorias] = await Promise.all([
    db.challenge.aggregate({ where, _count: { _all: true }, _sum: { prizeAmountCents: true } }),
    db.challenge.groupBy({ by: ["category"], where, _count: { _all: true } }),
  ]);
  return {
    cifras: {
      retosAbiertos: agregado._count._all,
      premiosCents: agregado._sum.prizeAmountCents ?? 0,
      categorias: categorias.length,
    },
    porCategoria: Object.fromEntries(categorias.map((c) => [c.category, c._count._all])),
  };
}

/** Las cifras del hero: retos abiertos, la suma de sus premios y en cuántas categorías. */
export async function cifrasPortada(db: Db, ahora: Date): Promise<CifrasPortada> {
  return (await cifrasYCategoriasPortada(db, ahora)).cifras;
}

/**
 * LOS PRÓXIMOS: publicados que todavía no han abierto. La MISMA regla que «abierto» salvo la apertura
 * —un reto de empresa, solo con el pago recibido—, así que lo que sale aquí es exactamente lo que
 * pasará a la rejilla cuando abra. El que abre antes, primero.
 */
export async function proximosPortada(
  db: Db,
  ahora: Date,
  limite = PROXIMOS_PORTADA_N,
): Promise<RetoPublicoVista[]> {
  const filas = await db.challenge.findMany({
    where: {
      ...NO_BORRADO,
      status: "PUBLISHED",
      startsAt: { gt: ahora },
      deadline: { gt: ahora },
      OR: [{ empresaId: null }, { pagoRecibidoEn: { not: null } }],
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: limite,
    select: SELECT_VISTA,
  });
  return filas.map(aVista);
}

/**
 * LOS ÚLTIMOS GANADORES REALES: el puesto 1 de los resultados más recientes, con el premio que se
 * OTORGÓ. Nada se inventa: sin resultados, la lista sale vacía y la portada no pinta el bloque.
 *
 * ┌─ QUIÉN SE PUEDE ENSEÑAR ───────────────────────────────────────────────────────────────────────┐
 * │ Es un listado PÚBLICO de personas, así que pasa por `USUARIO_VISIBLE` (ni borrada, ni baneada,  │
 * │ ni cuenta de empresa) —como el ranking: un ganador que ya no es visible se cae, no sale con su  │
 * │ nombre y un enlace a un perfil que da 404—. Y el reto, por `NO_BORRADO`: uno ocultado por el    │
 * │ admin tampoco se anuncia. Lo vigila el censo de `usuario-visible`.                              │
 * │                                                                                                 │
 * │ `ChallengeResult.userId` no tiene FK (como los ledgers), así que las personas se traen en UNA   │
 * │ consulta aparte para todos los ids, no una por fila. Se lee con margen                          │
 * │ (`GANADORES_PORTADA_LECTURA`) porque algunos se caen por el camino.                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export async function ganadoresPortada(
  db: Db,
  ahora: Date,
  limite = GANADORES_PORTADA_N,
): Promise<GanadorPortada[]> {
  const resultados = await db.challengeResult.findMany({
    where: { rank: 1, challenge: { is: NO_BORRADO } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: GANADORES_PORTADA_LECTURA,
    select: {
      userId: true,
      prizeAmountCents: true,
      currency: true,
      createdAt: true,
      challenge: { select: { title: true, publicCode: true, slug: true } },
    },
  });
  const ids = [...new Set(resultados.map((r) => r.userId))];
  if (ids.length === 0) return [];
  const [usuarios, vips] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids }, ...USUARIO_VISIBLE },
      select: {
        id: true,
        username: true,
        displayName: true,
        image: true,
        colorNombre: true,
        pointsBalance: true,
      },
    }),
    vipsActivosEntre(db, ids, ahora),
  ]);
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  return resultados
    .flatMap((r) => {
      const u = porId.get(r.userId);
      return u
        ? [
            {
              userId: r.userId,
              username: u.username,
              displayName: u.displayName,
              image: u.image,
              puntos: u.pointsBalance,
              esVip: vips.has(r.userId),
              colorNombre: u.colorNombre,
              retoTitulo: r.challenge.title,
              retoHref: `/retos/${r.challenge.publicCode}-${r.challenge.slug}`,
              premioCents: r.prizeAmountCents,
              moneda: r.currency,
              cuandoMs: r.createdAt.getTime(),
            },
          ]
        : [];
    })
    .slice(0, limite);
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
    // Lo que cambia de bloque DENTRO de la ventana se quita al servir: un reto de la rejilla que
    // cierra, y un próximo que ya ha abierto (ya no es «próximo»; entra en la rejilla en la siguiente).
    return {
      ...d,
      rejilla: d.rejilla.filter((r) => r.deadlineMs > t),
      proximos: d.proximos.filter((r) => r.startsAtMs > t),
    };
  }
  const datos = await datosPortada(db, ahora);
  cache = { hasta: t + PORTADA_CACHE_MS, datos };
  return datos;
}

/** Todo lo que la portada enseña igual a quien sea. */
export async function datosPortada(db: Db, ahora: Date = new Date()): Promise<DatosPortada> {
  const [{ cifras, porCategoria }, destacado, proximos, ganadores] = await Promise.all([
    cifrasYCategoriasPortada(db, ahora),
    retoDestacadoPortada(db, ahora),
    proximosPortada(db, ahora),
    ganadoresPortada(db, ahora),
  ]);
  const rejilla = await rejillaPortada(db, ahora, destacado?.id ?? null);
  return {
    cifras,
    destacado: destacado ? { reto: destacado.reto, elegido: destacado.elegido } : null,
    rejilla,
    porCategoria,
    proximos,
    ganadores,
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
