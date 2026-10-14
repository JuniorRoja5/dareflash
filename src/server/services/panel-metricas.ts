/**
 * Métricas REALES del panel. SOLO datos que ya existen en la BD: CERO cifras inventadas.
 *
 * Tres ámbitos: el RESUMEN del panel (`metricasPanel`), el DINERO (`metricasDinero`, aparte y por su
 * propia razón) y la gestión de UN reto (`metricasReto`, `interaccionPorParticipacion`,
 * `serieDiariaReto`).
 *
 * YA NO QUEDA NADA EN "PRÓXIMAMENTE" AQUÍ. Mientras el monedero no existía, la portada del panel
 * pintaba "Premios pagados — Fase 7", que era lo honesto entonces; con la Fase 7 construida, ese
 * hueco pasó a ser lo contrario de honesto —decía "aún no se mide" sobre algo que ya se medía—. Un
 * placeholder que sobrevive a su fase miente igual que una cifra inventada, y encima no falla nada.
 */
import "server-only";

import { ChallengeStatusSchema, PANEL_INTERACCION_TOPE } from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import { ESTADOS_RETIRADA_EN_CURSO } from "@/lib/retirada";
import { type DiaActividad, diasUtcEntre, rellenarSerie } from "@/lib/serie-diaria";
import type { Db } from "@/server/db/types";
import { PARTICIPACION_QUE_CUENTA } from "@/server/services/ranking";

export interface MetricasPanel {
  retosTotal: number;
  retosPublicados: number;
  retosBorradores: number;
  usuarios: number;
  /**
   * Retos ABIERTOS AHORA MISMO: publicados, ya empezados, sin vencer y sin borrado en marcha. No es
   * lo mismo que `retosPublicados`, que cuenta la COLUMNA —lo que el admin quiso— e incluye los
   * programados y los que ya vencieron. Ese desfase fue un fallo real de la lista de retos.
   */
  retosAbiertos: number;
  /**
   * Retos cerrados ESPERANDO una decisión del admin por empate. Es la única cola de retos que
   * requiere a una persona, así que es la que vale en una portada.
   */
  retosEmpatePendiente: number;
  /**
   * Objetos DISTINTOS con denuncias abiertas, que es lo que de verdad hay que revisar: la cola de
   * moderación agrupa por objeto, y contar filas de `Report` daría un número más alto que la cola
   * —quince denuncias del mismo vídeo son UNA cosa que mirar—.
   */
  denunciasAbiertas: number;
}

/**
 * "ABIERTO" expresado para la BD. Es el MISMO estado que `estadoRetoAdmin` calcula para una fila, y
 * aquí tiene que ir como filtro porque esto es un `COUNT`: traerse los retos para clasificarlos en
 * memoria es cargar la tabla entera para devolver un número.
 *
 * Que las dos formas de decirlo no se separen lo vigila `panel-metricas` con un caso que crea un reto
 * de CADA estado y compara el conteo con lo que dice `estadoRetoAdmin`. Si alguien cambia una y no la
 * otra, ese caso se pone rojo — el texto de aquí no lo garantizaría.
 */
function retoAbiertoEnBd(ahora: Date) {
  return {
    status: ChallengeStatusSchema.enum.PUBLISHED,
    deletedAt: null,
    eliminacionProgramadaEn: null,
    startsAt: { lte: ahora },
    deadline: { gt: ahora },
  };
}

/**
 * Conteos en paralelo. Los retos por estado se agrupan en UNA consulta (`groupBy status`) y el total se
 * deriva sumando (evita una consulta extra y que total y desglose se contradigan). CLOSED existe en el
 * dominio pero hoy no hay cierre automático; se ignora en el desglose y se cuenta solo en el total.
 *
 * `ahora` es inyectable para que el caso de "abierto" se pueda situar en el tiempo sin esperar.
 */
export async function metricasPanel(db: Db, ahora: Date = new Date()): Promise<MetricasPanel> {
  const [porEstado, usuarios, retosAbiertos, retosEmpatePendiente, objetosDenunciados] =
    await Promise.all([
      db.challenge.groupBy({ by: ["status"], _count: { _all: true } }),
      db.user.count(),
      db.challenge.count({ where: retoAbiertoEnBd(ahora) }),
      db.challenge.count({ where: { motivoCierre: "EMPATE_PENDIENTE", deletedAt: null } }),
      // POR OBJETO, no por denuncia: el `groupBy` devuelve una fila por objeto distinto, que es
      // exactamente lo que la cola de moderación enseña. Y solo las ABIERTAS: lo resuelto o
      // descartado no vuelve a subir (ver `cola-moderacion`).
      db.report.groupBy({ by: ["targetType", "targetId"], where: { status: "OPEN" } }),
    ]);

  const cuenta = (estado: string) => porEstado.find((g) => g.status === estado)?._count._all ?? 0;
  const retosTotal = porEstado.reduce((acc, g) => acc + g._count._all, 0);

  return {
    retosTotal,
    retosPublicados: cuenta(ChallengeStatusSchema.enum.PUBLISHED),
    retosBorradores: cuenta(ChallengeStatusSchema.enum.DRAFT),
    usuarios,
    retosAbiertos,
    retosEmpatePendiente,
    denunciasAbiertas: objetosDenunciados.length,
  };
}

/**
 * LAS CIFRAS DE DINERO DEL PANEL, APARTE A PROPÓSITO.
 *
 * ┌─ POR QUÉ NO ESTÁN EN `metricasPanel` ─────────────────────────────────────────────────────────────┐
 * │ `/panel` (el Resumen) es de ADMIN y un moderador ni llega: `primeraSeccionPara` lo desvía a su  │
 * │ sección antes de que esta pantalla se renderice. Pero el día que una pantalla compartida quiera │
 * │ "las métricas del panel", lo que NO puede pasar es que el dinero venga de propina dentro del    │
 * │ mismo objeto. Separarlas hace que enseñar dinero sea siempre una llamada EXPLÍCITA, que es la   │
 * │ misma disciplina del DTO de las retiradas: la puerta es la forma, no la buena intención.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface MetricasDinero {
  /** Retiradas esperando una decisión humana (`PENDING`): la cola de trabajo del admin. */
  retiradasPendientes: number;
  /** Retiradas en algún estado NO final: dinero ya debitado que aún no ha llegado a su destino. */
  retiradasEnCurso: number;
  /** Importe de esas retiradas en curso. Es lo que hay que transferir. */
  retiradasEnCursoCents: number;
  /** Lo ya pagado, histórico. */
  pagadoCents: number;
  /**
   * Suma de TODOS los saldos de monedero. Es el pasivo de la plataforma: lo que debe hoy si todo el
   * mundo pidiera cobrar. No se cruza con lo anterior —ese dinero ya salió del saldo—, así que las
   * dos cifras no se suman y la vista no las presenta como si lo hicieran.
   */
  monederosCents: number;
}

export async function metricasDinero(db: Db): Promise<MetricasDinero> {
  const [porEstado, monederos] = await Promise.all([
    db.withdrawal.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountCents: true } }),
    db.user.aggregate({ _sum: { walletBalanceCents: true } }),
  ]);

  const grupo = (estado: string) => porEstado.find((g) => g.status === estado);
  // "EN CURSO" SE DERIVA DE LA MÁQUINA DE ESTADOS (`ESTADOS_RETIRADA_EN_CURSO`), no se enumera aquí:
  // una segunda lista de estados es una lista libre de discrepar, y lo que contaría mal es dinero.
  const enCurso = porEstado.filter((g) =>
    (ESTADOS_RETIRADA_EN_CURSO as readonly string[]).includes(g.status),
  );

  return {
    retiradasPendientes: grupo("PENDING")?._count._all ?? 0,
    retiradasEnCurso: enCurso.reduce((t, g) => t + g._count._all, 0),
    retiradasEnCursoCents: enCurso.reduce((t, g) => t + (g._sum.amountCents ?? 0), 0),
    pagadoCents: grupo("PAID")?._sum.amountCents ?? 0,
    monederosCents: monederos._sum.walletBalanceCents ?? 0,
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
