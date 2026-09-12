/**
 * Métricas REALES del panel. SOLO datos que ya existen en la BD: CERO cifras inventadas. Lo que aún no
 * tiene backend (dinero/monedero, reportes, series temporales) NO se calcula aquí — la vista lo
 * muestra como "próximamente", no como un 0 engañoso.
 *
 * Dos ámbitos: el RESUMEN del panel (`metricasPanel`) y la gestión de UN reto (`metricasReto`,
 * `interaccionPorParticipacion`).
 */
import "server-only";

import { PANEL_INTERACCION_TOPE } from "@/config/constants";
import type { Db } from "@/server/db/types";
import { PARTICIPACION_QUE_CUENTA } from "@/server/services/ranking";

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
  /**
   * GANADORES declarados: filas de `ChallengeResult`. Sale del HECHO, no de recalcular el orden —es
   * la misma fuente de la que beben el palmarés del perfil y el ranking, así que el panel no puede
   * enseñar un número distinto del que se otorgó.
   *
   * 0 tiene tres significados posibles y NINGUNO es "no hay datos": el reto sigue abierto, cerró sin
   * alcanzar el mínimo, o cerró en empate esperando al admin. Cuál de los tres lo dice
   * `motivoCierre`, que ya está en la ficha.
   */
  ganadores: number;
}

/** Todas las cuentas en paralelo; `challengeId` es prefijo del índice [challengeId, voteCount]. */
export async function metricasReto(db: Db, challengeId: string): Promise<MetricasReto> {
  // "Visible" es la regla COMPARTIDA con el top del reto y el cierre, no una copia que pueda divergir.
  const visible = PARTICIPACION_QUE_CUENTA;

  const [participaciones, porUsuario, visibles, retiradas, enProceso, suma, ganadores] =
    await Promise.all([
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
      db.challengeResult.count({ where: { challengeId } }),
    ]);

  return {
    participaciones,
    participantes: porUsuario.length,
    visibles,
    retiradas,
    enProceso,
    votos: suma._sum.voteCount ?? 0,
    ganadores,
  };
}

/** Una participación VISIBLE con sus votos (tarjeta "Interacción por participación"). */
export interface InteraccionParticipacion {
  submissionId: string;
  /** Título del vídeo; `null` si no tiene. */
  titulo: string | null;
  username: string;
  displayName: string | null;
  votos: number;
}

/**
 * INTERACCIÓN POR PARTICIPACIÓN: los votos (`voteCount`) de cada participación VISIBLE del reto, de
 * más a menos. "Interacción" es VOTOS y solo votos: el esquema no mide reproducciones ni vistas, y
 * estimarlas sería una cifra inventada. Medirlas algún día es instrumentación nueva, no este hueco.
 *
 *  - Visible = `PARTICIPACION_QUE_CUENTA`, la misma regla del top del reto y del cierre: la tarjeta no
 *    enseña votos de algo que el público no ve (los de una retirada ya no cuentan para nada).
 *  - ACOTADA a las `PANEL_INTERACCION_TOPE` más votadas, nunca el reto entero: `challengeId` +
 *    `voteCount DESC` recorre el índice [challengeId, voteCount] hacia atrás y para en el tope. `id`
 *    desempata (InnoDB lo lleva al final de todo índice secundario, así que no rompe el recorrido):
 *    con votos empatados, dos cargas salen en el mismo orden. La lista COMPLETA, con keyset, es la
 *    tabla de participaciones de la misma pantalla.
 */
export async function interaccionPorParticipacion(
  db: Db,
  challengeId: string,
): Promise<InteraccionParticipacion[]> {
  const filas = await db.submission.findMany({
    where: { challengeId, ...PARTICIPACION_QUE_CUENTA },
    orderBy: [{ voteCount: "desc" }, { id: "desc" }],
    take: PANEL_INTERACCION_TOPE,
    select: {
      id: true,
      voteCount: true,
      video: { select: { title: true } },
      user: { select: { username: true, displayName: true } },
    },
  });

  return filas.map((f) => ({
    submissionId: f.id,
    titulo: f.video.title,
    username: f.user.username,
    displayName: f.user.displayName,
    votos: f.voteCount,
  }));
}
