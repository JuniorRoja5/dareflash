/**
 * Métricas REALES del panel. SOLO datos que ya existen en la BD: CERO cifras inventadas. Lo que aún no
 * tiene backend (dinero/monedero, reportes) NO se calcula aquí — la vista lo muestra como
 * "próximamente", no como un 0 engañoso.
 *
 * Dos ámbitos: el RESUMEN del panel (`metricasPanel`) y la gestión de UN reto (`metricasReto`,
 * `interaccionPorParticipacion`, `serieDiariaReto`).
 */
import "server-only";

import { PANEL_INTERACCION_TOPE } from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import { type DiaActividad, diasUtcEntre, rellenarSerie } from "@/lib/serie-diaria";
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

/** "Rendimiento en el tiempo" de un reto: su actividad día a día dentro de su ventana. */
export interface SerieReto {
  /** Ventana medida, [desde, hasta]: de la apertura al cierre (o a hoy, si sigue abierto). */
  desde: Date;
  hasta: Date;
  /** Cada día UTC de la ventana, en orden. Vacía si el reto aún no ha abierto. */
  dias: DiaActividad[];
  total: { participaciones: number; votos: number };
}

/** Lo que devuelve cada consulta agregada: un día UTC y cuántas filas cayeron en él. */
type FilaDia = { dia: string; n: number | bigint };

/**
 * RENDIMIENTO EN EL TIEMPO: participaciones (`Submission.createdAt`) y votos (`Vote.createdAt`) de
 * UN reto, contados por día UTC dentro de su ventana [startsAt, closedAt ?? min(ahora, deadline)].
 *
 *  - ACTIVIDAD REGISTRADA: cuenta todo lo que ocurrió, también lo que después se retiró —el voto se
 *    emitió ese día aunque la participación ya no se vea—. Por eso la serie de votos puede sumar más
 *    que la tarjeta "Votos", que es solo de las visibles; la vista lo dice.
 *  - UNA consulta AGREGADA por serie (GROUP BY día), sin traer filas ni una consulta por día.
 *  - ACOTADAS AL RETO por índice y sin migración: las participaciones por el prefijo `challengeId`
 *    de [challengeId, voteCount]; los votos, por [submissionId] a través de las participaciones del
 *    reto. `Vote.challengeId` no encabeza ningún índice (solo es la segunda mitad del UNIQUE
 *    [userId, challengeId]): filtrar por él recorrería la tabla entera. Es equivalente, porque un voto
 *    solo puede apuntar a participaciones de su propio reto.
 *  - DÍA UTC con `DATE_FORMAT` sobre el DATETIME tal cual: las columnas se guardan en UTC (la
 *    conexión va con `timezone: "Z"`) y DATETIME no se convierte según la zona de la sesión. Las dos
 *    series se cortan igual, y el resultado es texto: el driver no puede reinterpretarlo.
 *
 * `null` si el reto no existe.
 */
export async function serieDiariaReto(
  db: Db,
  challengeId: string,
  now: Date = new Date(),
): Promise<SerieReto | null> {
  const reto = await db.challenge.findUnique({
    where: { id: challengeId },
    select: { startsAt: true, deadline: true, closedAt: true },
  });
  if (!reto) return null;

  const desde = reto.startsAt;
  const hasta = reto.closedAt ?? new Date(Math.min(now.getTime(), reto.deadline.getTime()));
  const dias = diasUtcEntre(desde, hasta);
  if (dias.length === 0) {
    return { desde, hasta, dias: [], total: { participaciones: 0, votos: 0 } };
  }

  const [porDiaParticipaciones, porDiaVotos] = await Promise.all([
    db.$queryRaw<FilaDia[]>(Prisma.sql`
      SELECT DATE_FORMAT(s.\`createdAt\`, '%Y-%m-%d') AS dia, COUNT(*) AS n
      FROM \`Submission\` s
      WHERE s.\`challengeId\` = ${challengeId}
        AND s.\`createdAt\` >= ${desde} AND s.\`createdAt\` <= ${hasta}
      GROUP BY dia`),
    db.$queryRaw<FilaDia[]>(Prisma.sql`
      SELECT DATE_FORMAT(v.\`createdAt\`, '%Y-%m-%d') AS dia, COUNT(*) AS n
      FROM \`Vote\` v
      WHERE v.\`submissionId\` IN (
          SELECT s.\`id\` FROM \`Submission\` s WHERE s.\`challengeId\` = ${challengeId}
        )
        AND v.\`createdAt\` >= ${desde} AND v.\`createdAt\` <= ${hasta}
      GROUP BY dia`),
  ]);

  const aMapa = (filas: FilaDia[]) => new Map(filas.map((f) => [f.dia, Number(f.n)]));
  const serie = rellenarSerie(dias, aMapa(porDiaParticipaciones), aMapa(porDiaVotos));

  return {
    desde,
    hasta,
    dias: serie,
    total: {
      participaciones: serie.reduce((s, d) => s + d.participaciones, 0),
      votos: serie.reduce((s, d) => s + d.votos, 0),
    },
  };
}
