/**
 * MARCAR EL DÍA ACTIVO — el único punto donde se escribe una racha.
 *
 * ┌─ FUERA DE LA TRANSACCIÓN DEL CONTENIDO. SIEMPRE ──────────────────────────────────────────────┐
 * │ Esto escribe en `User`, y las acciones que lo disparan escriben en `Submission`, `Challenge`  │
 * │ o `Video` dentro de sus propias transacciones, algunas con la fila bloqueada. Meter una       │
 * │ escritura de `User` ahí dentro cierra el ciclo del veto: un camino que toma `User` y luego    │
 * │ contenido, conviviendo con otros que lo hacen al revés. Eso es un deadlock esperando su día   │
 * │ de tráfico.                                                                                   │
 * │                                                                                               │
 * │ Y el PREMIO, más todavía: `applyPoints` abre su propia transacción con `FOR UPDATE` sobre el  │
 * │ `User`. Mismo patrón que el hito de likes y que el de vídeos: la transacción del contenido se │
 * │ CIERRA, y solo después se marca y se premia.                                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NO PUEDE TUMBAR A QUIEN LA LLAMA. Perder una racha por un fallo es malo; perder el voto, el
 * comentario o el like que la persona acaba de hacer es mucho peor. Se anota y se sigue — y como
 * la racha se calcula desde dos fechas, la siguiente acción del día lo arregla sola.
 *
 * IDEMPOTENTE DENTRO DEL DÍA: si ya estaba marcado hoy, NO escribe. La acción número cincuenta de
 * una tarde no vuelve a tocar `User`, que es la tabla más caliente del producto.
 */
import "server-only";

import { POINTS, RACHA_DIAS_PREMIO, RAZON_RACHA } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { claveDia, rachaActual, siguienteDiaActivo, type EstadoRacha } from "@/lib/racha";
import { sanearError } from "@/server/observability/sanitize-error";

import { applyPoints } from "./ledger";

/**
 * Clave de idempotencia del premio. Lleva el DÍA DE INICIO de la racha, que es lo que la
 * identifica: mientras sea la misma racha la clave no cambia, así que se paga una vez por mucho
 * que se intente. Una racha nueva empieza otro día y tiene otra clave — y vuelve a cobrar.
 */
export function claveRacha(userId: string, inicio: Date): string {
  return `racha:${userId}:${claveDia(inicio)}`;
}

/** Lo que se guarda de la racha, leído del usuario. */
async function leerRacha(db: PrismaClient, userId: string): Promise<EstadoRacha | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { rachaInicioEn: true, rachaUltimoEn: true },
  });
  return u ? { inicio: u.rachaInicioEn, ultimo: u.rachaUltimoEn } : null;
}

/**
 * Marca que `userId` ha hecho HOY algo que cuenta, y premia la racha si toca.
 *
 * Devuelve la racha resultante en días (0 si no se pudo marcar). El valor es informativo: ningún
 * camino depende de él, porque la racha se vuelve a calcular cada vez que alguien la mira.
 */
export async function marcarDiaActivo(
  db: PrismaClient,
  userId: string,
  ahora: Date = new Date(),
): Promise<number> {
  try {
    const estado = await leerRacha(db, userId);
    if (!estado) return 0;

    const siguiente = siguienteDiaActivo(estado, ahora);
    // MISMA REFERENCIA = ya estaba marcado hoy. Ni una escritura más (ver la cabecera).
    if (siguiente === estado) return rachaActual(estado, ahora);

    await db.user.update({
      where: { id: userId },
      data: { rachaInicioEn: siguiente.inicio, rachaUltimoEn: siguiente.ultimo },
    });

    const dias = rachaActual(siguiente, ahora);
    if (dias >= RACHA_DIAS_PREMIO && siguiente.inicio) {
      await premiarRacha(db, userId, siguiente.inicio);
    }
    return dias;
  } catch (e) {
    // La acción de la persona YA ocurrió y no se va a deshacer por esto.
    console.error(`[racha] marcar el día de ${userId}: ${sanearError(e)}`);
    return 0;
  }
}

/**
 * Paga el premio de ESTA racha. Idempotente por la clave: intentarlo mil veces paga una.
 *
 * Se intenta en CADA día nuevo a partir del séptimo —no solo justo al cruzar— y eso es
 * deliberado: así una ejecución perdida (el premio falló el día 7) se repara sola el día 8, en vez
 * de dejar una racha premiada sin cobrar para siempre. Es la misma disciplina que `hito-videos`.
 */
async function premiarRacha(db: PrismaClient, userId: string, inicio: Date): Promise<void> {
  try {
    await applyPoints(db, {
      userId,
      delta: POINTS.RACHA_7_DIAS,
      reason: RAZON_RACHA,
      refType: "USER",
      refId: userId,
      idempotencyKey: claveRacha(userId, inicio),
    });
  } catch (e) {
    console.error(`[racha] premio de ${userId}: ${sanearError(e)}`);
  }
}

/**
 * La racha de alguien, para enseñarla. SE CALCULA, no se lee: si su último día no es hoy ni ayer,
 * vale cero aunque en la base siga guardado el final de una racha vieja.
 */
export async function rachaDe(
  db: PrismaClient,
  userId: string,
  ahora: Date = new Date(),
): Promise<number> {
  const estado = await leerRacha(db, userId);
  return estado ? rachaActual(estado, ahora) : 0;
}
