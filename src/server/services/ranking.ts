/**
 * RANKING (Fase 4, capa de datos). Dos rankings distintos, y no se parecen:
 *
 *  - MENSUAL: por VICTORIAS del mes natural (UTC), no por puntos del mes. Un usuario con 3 victorias
 *    va por delante de uno con 1, aunque el segundo tenga más puntos acumulados de otras cosas. La
 *    verdad son las filas de `ChallengeResult`; `RankingMensual` es su caché.
 *  - DEL RETO: las participaciones por votos, con EXACTAMENTE la misma regla de orden que usó el
 *    cierre para repartir. Se reutiliza `ordenarParaCierre`; reescribirla aquí garantizaría que un
 *    día el podio que se enseña y el que cobró dejen de coincidir.
 *
 * KEYSET SIEMPRE, nunca OFFSET. Con OFFSET, la página 50 obliga a la base a producir y descartar las
 * 49 anteriores, y si algo cambia entre página y página los elementos se repiten o se saltan. Lo que
 * hace posible el keyset es que el orden sea TOTAL: aquí lo cierra `userId`, que es único.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ordenarParaCierre, type ParticipacionCierre } from "@/lib/cierre-reto";
import { periodoDe, rangoDelPeriodo } from "@/lib/periodo";

/** El `now` se inyecta en todo para poder probar los bordes de mes sin esperar al día 1. */
export function periodoActual(now: Date = new Date()): string {
  return periodoDe(now);
}

/**
 * Recuenta y guarda las victorias del periodo para los usuarios indicados.
 *
 * Se llama DENTRO de la transacción que crea los `ChallengeResult`, con el mismo cliente: así el
 * caché y el hecho se escriben juntos o no se escribe ninguno. Y se escribe el VALOR ABSOLUTO
 * recontado, nunca `increment`: un cierre que se re-ejecuta inserta 0 resultados nuevos
 * (`skipDuplicates`) y aquí recuenta el mismo número, así que converge. Con `increment` sumaría otra
 * vez — el mismo motivo por el que el ledger escribe el saldo calculado y no un incremento.
 */
export async function recontarVictoriasDelPeriodo(
  /** Cliente de transacción (o el cliente normal): así el caché se escribe con el hecho. */
  tx: Prisma.TransactionClient,
  userIds: readonly string[],
  periodo: string,
): Promise<void> {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  for (const userId of new Set(userIds)) {
    const victorias = await tx.challengeResult.count({
      // Cubierto por @@index([userId, createdAt]) de ChallengeResult.
      where: { userId, createdAt: { gte: desde, lt: hasta } },
    });
    await tx.rankingMensual.upsert({
      where: { periodo_userId: { periodo, userId } },
      create: { periodo, userId, victorias },
      update: { victorias },
    });
  }
}

export interface FilaRankingMensual {
  userId: string;
  username: string;
  displayName: string | null;
  image: string | null;
  victorias: number;
  /** Puntos totales, para derivar el nivel. NO se guarda ningún nivel: se calcula al pintar. */
  puntos: number;
}

export interface PaginaRanking {
  filas: FilaRankingMensual[];
  /** Cursor opaco para la página siguiente, o `null` si no hay más. */
  cursor: string | null;
}

/** Cursor del keyset: la última posición servida. Opaco para quien lo recibe. */
function serializarCursor(victorias: number, userId: string): string {
  return `${victorias}:${userId}`;
}

function leerCursor(cursor: string): { victorias: number; userId: string } | null {
  const corte = cursor.indexOf(":");
  if (corte <= 0) return null;
  const victorias = Number(cursor.slice(0, corte));
  const userId = cursor.slice(corte + 1);
  if (!Number.isInteger(victorias) || userId.length === 0) return null;
  return { victorias, userId };
}

/**
 * Ranking mensual, paginado por KEYSET.
 *
 * ORDEN TOTAL: `victorias DESC, userId DESC`. El segundo criterio no es cosmético — sin él, dos
 * usuarios con las mismas victorias no tienen un orden definido, y la página siguiente puede repetir
 * a uno y saltarse al otro. Que las DOS columnas vayan en la misma dirección tampoco es casual: así
 * la consulta es un recorrido hacia atrás del índice `[periodo, victorias, userId]` de una sola
 * pasada; con direcciones mezcladas InnoDB tendría que ordenar en memoria.
 *
 * Empatar a victorias y desempatar por id es arbitrario, sí. Cualquier desempate lo es cuando el dato
 * de verdad —las victorias— es idéntico; lo que no se puede es NO tener ninguno.
 *
 * Sin victorias en el mes, la lista sale VACÍA. No se rellena con nadie: un ranking con gente que no
 * ha ganado nada es un dato falso.
 */
export async function rankingMensual(
  db: PrismaClient,
  opciones: { periodo?: string; limite?: number; cursor?: string | null; now?: Date } = {},
): Promise<PaginaRanking> {
  const periodo = opciones.periodo ?? periodoActual(opciones.now);
  const limite = Math.min(Math.max(opciones.limite ?? 20, 1), 100);
  const desde = opciones.cursor ? leerCursor(opciones.cursor) : null;

  const filas = await db.rankingMensual.findMany({
    where: {
      periodo,
      // Nadie con 0 victorias entra en un ranking de victorias: estaría ocupando sitio sin haber
      // ganado nada. Puede haber filas a 0 si una victoria se revierte.
      victorias: { gt: 0 },
      ...(desde
        ? {
            OR: [
              { victorias: { lt: desde.victorias } },
              { victorias: desde.victorias, userId: { lt: desde.userId } },
            ],
          }
        : {}),
    },
    orderBy: [{ victorias: "desc" }, { userId: "desc" }],
    // Se pide UNA de más para saber si hay página siguiente sin un COUNT aparte.
    take: limite + 1,
    select: { userId: true, victorias: true },
  });

  const visibles = filas.slice(0, limite);
  const hayMas = filas.length > limite;

  // Los datos de presentación se traen en UNA consulta para los ids de la página (no una por fila).
  const usuarios = await db.user.findMany({
    where: { id: { in: visibles.map((f) => f.userId) } },
    select: { id: true, username: true, displayName: true, image: true, pointsBalance: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u]));

  const ultima = visibles[visibles.length - 1];
  return {
    filas: visibles.flatMap((f) => {
      const u = porId.get(f.userId);
      // Un usuario borrado deja su fila de ranking huérfana (no hay FK, como en los ledgers): se
      // omite en vez de pintar un hueco con nombre vacío.
      return u
        ? [
            {
              userId: f.userId,
              username: u.username,
              displayName: u.displayName,
              image: u.image,
              victorias: f.victorias,
              puntos: u.pointsBalance,
            },
          ]
        : [];
    }),
    cursor: hayMas && ultima ? serializarCursor(ultima.victorias, ultima.userId) : null,
  };
}

export interface FilaTopReto {
  submissionId: string;
  userId: string;
  username: string;
  displayName: string | null;
  votos: number;
  puesto: number;
}

/**
 * TOP del reto: las `limite` primeras participaciones por votos, con la MISMA regla de orden que usó
 * el cierre (`ordenarParaCierre`, reutilizada). Por defecto 20, que es el tamaño que premia con
 * puntos de top-20.
 *
 * Se ordena en memoria a propósito y no en SQL: la regla de orden ya existe, es pura y está probada,
 * y duplicarla como `ORDER BY` sería tener dos definiciones del mismo criterio esperando a divergir.
 * El conjunto está acotado por reto (una participación por usuario), así que traerlo entero no es un
 * problema de escala; el que sí lo sería —el ranking mensual, que crece con TODA la plataforma— es el
 * que va por keyset contra un índice.
 */
export async function topDelReto(
  db: PrismaClient,
  challengeId: string,
  limite = 20,
): Promise<FilaTopReto[]> {
  const filas = await db.submission.findMany({
    // MISMA regla de entrada que el cierre: publicada de verdad, vídeo incluido.
    where: { challengeId, status: "PUBLISHED", video: { is: { status: "PUBLISHED" } } },
    select: {
      id: true,
      userId: true,
      voteCount: true,
      createdAt: true,
      user: { select: { username: true, displayName: true } },
    },
  });

  const porId = new Map(filas.map((f) => [f.id, f]));
  const ordenables: ParticipacionCierre[] = filas.map((f) => ({
    submissionId: f.id,
    userId: f.userId,
    voteCount: f.voteCount,
    createdAt: f.createdAt,
  }));

  return ordenarParaCierre(ordenables)
    .slice(0, Math.max(limite, 0))
    .flatMap((p, i) => {
      const f = porId.get(p.submissionId);
      return f
        ? [
            {
              submissionId: p.submissionId,
              userId: p.userId,
              username: f.user.username,
              displayName: f.user.displayName,
              votos: p.voteCount,
              puesto: i + 1,
            },
          ]
        : [];
    });
}
