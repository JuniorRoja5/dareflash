/**
 * Métricas REALES del panel. SOLO datos que ya existen en la BD: CERO cifras inventadas. Lo que aún no
 * tiene backend (dinero/monedero, interacción, reportes, series temporales) NO se calcula aquí — la
 * vista lo muestra como "próximamente", no como un 0 engañoso.
 *
 * Dos ámbitos: el RESUMEN del panel (`metricasPanel`) y la gestión de UN reto (`metricasReto`).
 */
import "server-only";

import type { Db } from "@/server/db/types";

export interface MetricasPanel {
  retosTotal: number;
  retosPublicados: number;
  retosBorradores: number;
  usuarios: number;
}

/**
 * Conteos en paralelo. Los retos por estado se agrupan en UNA consulta (`groupBy status`) y el total se
 * deriva sumando (evita una consulta extra y que total y desglose se contradigan). CLOSED existe en el
 * dominio pero hoy no hay cierre automático; se ignora en el desglose y se cuenta solo en el total.
 */
export async function metricasPanel(db: Db): Promise<MetricasPanel> {
  const [porEstado, usuarios] = await Promise.all([
    db.challenge.groupBy({ by: ["status"], _count: { _all: true } }),
    db.user.count(),
  ]);

  const cuenta = (estado: string) => porEstado.find((g) => g.status === estado)?._count._all ?? 0;
  const retosTotal = porEstado.reduce((acc, g) => acc + g._count._all, 0);

  return {
    retosTotal,
    retosPublicados: cuenta("PUBLISHED"),
    retosBorradores: cuenta("DRAFT"),
    usuarios,
  };
}

/**
 * Métricas de UN reto, todas calculadas contra la BD. Los conteos NO son una partición (una misma
 * participación puede caer en dos: p.ej. una retirada también fue creada), son HECHOS independientes;
 * la vista los pinta como tales y en ningún sitio se hace que sumen.
 */
export interface MetricasReto {
  /** Participaciones creadas, en CUALQUIER estado (incluidas las retiradas). */
  participaciones: number;
  /**
   * Personas DISTINTAS que han participado. Hoy coincide con `participaciones` porque el modelo
   * impone 1 participación por usuario y reto (@@unique), pero se cuenta de verdad (DISTINCT userId)
   * y no se deduce: el propio esquema deja escrito que habrá eventos que admitan varias, y el día que
   * se relaje esa restricción este número seguirá siendo correcto sin tocar nada.
   */
  participantes: number;
  /** Las que el PÚBLICO ve ahora mismo: regla del más restrictivo (Submission Y Video PUBLISHED). */
  visibles: number;
  /** Retiradas por moderación (Submission o Video REMOVED). */
  retiradas: number;
  /** Vídeo aún en proceso: subido pero sin confirmar/transcodificar. */
  enProceso: number;
  /**
   * Suma de `voteCount` de las participaciones VISIBLES. Se acota a las visibles a propósito: los
   * votos de una participación retirada ya no cuentan para nada de cara al público. Hoy sale 0
   * mientras no haya votación (Fase 3), pero es un agregado REAL de una columna real, no un hueco.
   */
  votos: number;
}

/** Todas las cuentas en paralelo; `challengeId` es prefijo del índice [challengeId, voteCount]. */
export async function metricasReto(db: Db, challengeId: string): Promise<MetricasReto> {
  const visible = { status: "PUBLISHED", video: { status: "PUBLISHED" } } as const;

  const [participaciones, porUsuario, visibles, retiradas, enProceso, suma] = await Promise.all([
    db.submission.count({ where: { challengeId } }),
    db.submission.groupBy({ by: ["userId"], where: { challengeId } }),
    db.submission.count({ where: { challengeId, ...visible } }),
    db.submission.count({
      where: { challengeId, OR: [{ status: "REMOVED" }, { video: { status: "REMOVED" } }] },
    }),
    db.submission.count({
      where: { challengeId, status: { not: "REMOVED" }, video: { status: "PENDING" } },
    }),
    db.submission.aggregate({ where: { challengeId, ...visible }, _sum: { voteCount: true } }),
  ]);

  return {
    participaciones,
    participantes: porUsuario.length,
    visibles,
    retiradas,
    enProceso,
    votos: suma._sum.voteCount ?? 0,
  };
}
