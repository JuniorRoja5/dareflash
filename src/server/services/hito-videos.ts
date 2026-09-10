/**
 * HITO DE VÍDEOS PUBLICADOS: +5 puntos por cada 3 vídeos PUBLICADOS, acumulado de por vida.
 *
 * REGLA DE ENTRADA, dura: solo cuenta `Video.status = PUBLISHED`. No una subida iniciada, no una que
 * falló al codificar. Premiar un vídeo que no existe —o que nadie puede ver— es exactamente el hueco
 * que no queremos: los puntos son reputación, y una reputación que se puede fabricar subiendo
 * ficheros rotos no vale nada.
 *
 * ┌─ IDEMPOTENTE POR HITO, NO POR EVENTO ────────────────────────────────────────────────────────┐
 * │ La clave es `hito:<userId>:<n>`, donde `n` es el número de hito (1 al llegar a 3 vídeos, 2 al  │
 * │ llegar a 6...). NO lleva dentro el vídeo que lo disparó ni el momento.                          │
 * │                                                                                                │
 * │ Por qué importa: si la clave fuera por evento (`video:<id>`), dos confirmaciones del mismo      │
 * │ vídeo darían dos claves distintas y sumarían dos veces. Con la clave por HITO, el número de     │
 * │ hito es una FUNCIÓN del estado (cuántos vídeos publicados hay), así que da igual cuántas veces  │
 * │ y desde dónde se llame: el resultado converge. Es la misma disciplina que el cierre de reto.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MONÓTONO: un hito otorgado no se desotorga. Si alguien con 6 vídeos borra uno, la cuenta baja a 5 y
 * el hito 2 sigue cobrado — no se retira (los puntos son de solo inserción) ni se vuelve a armar
 * (su clave ya está usada, así que republicar hasta 6 otra vez es un no-op). Esa asimetría es
 * deliberada: un hito es un LOGRO alcanzado, no un saldo de vídeos vivos.
 */
import { POINTS, RAZON_HITO_VIDEOS, VIDEOS_POR_HITO } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { sanearError } from "@/server/observability/sanitize-error";

import { applyPoints } from "./ledger";

/** Clave de idempotencia del hito `n` de un usuario. Fuente única: la usa el servicio y los tests. */
export function claveHitoVideos(userId: string, hito: number): string {
  return `hito:${userId}:${hito}`;
}

/** Cuántos hitos COMPLETOS corresponden a `publicados` vídeos. Pura y total. */
export function hitosPara(publicados: number): number {
  if (publicados <= 0) return 0;
  return Math.floor(publicados / VIDEOS_POR_HITO);
}

/**
 * Otorga los hitos que le falten a un usuario. Se llama cuando uno de sus vídeos pasa a PUBLISHED.
 *
 * Otorga TODOS los que falten, no solo el último: así una ejecución perdida (el worker murió entre
 * publicar el vídeo y dar los puntos) se repara sola en la siguiente publicación, en vez de dejar un
 * hito sin cobrar para siempre.
 *
 * Y no intenta los ya cobrados: se cuentan primero los movimientos que ya existen de esta razón, y se
 * arranca desde ahí. Sin ese corte, un usuario con 60 vídeos abriría 20 transacciones con su
 * `FOR UPDATE` en CADA publicación, 19 de ellas para no hacer nada.
 *
 * Devuelve cuántos hitos se otorgaron DE VERDAD (0 en el caso normal, que es el más frecuente).
 */
export async function otorgarHitosDeVideos(db: PrismaClient, userId: string): Promise<number> {
  const publicados = await db.video.count({ where: { userId, status: "PUBLISHED" } });
  const objetivo = hitosPara(publicados);
  if (objetivo === 0) return 0;

  const yaCobrados = await db.pointsLedger.count({
    where: { userId, reason: RAZON_HITO_VIDEOS },
  });
  if (yaCobrados >= objetivo) return 0;

  let aplicados = 0;
  for (let hito = yaCobrados + 1; hito <= objetivo; hito += 1) {
    try {
      const r = await applyPoints(db, {
        userId,
        delta: POINTS.VIDEOS_PUBLICADOS_HITO,
        reason: RAZON_HITO_VIDEOS,
        refType: "USER",
        refId: userId,
        idempotencyKey: claveHitoVideos(userId, hito),
      });
      if (r.applied) aplicados += 1;
    } catch (e) {
      // Un fallo aquí no puede tumbar la publicación del vídeo, que es lo que de verdad importa. Se
      // anota y la siguiente publicación del usuario lo reintenta; la clave impide duplicar.
      console.error(`[hito-videos] hito ${hito} de ${userId}: ${sanearError(e)}`);
      break;
    }
  }
  return aplicados;
}
