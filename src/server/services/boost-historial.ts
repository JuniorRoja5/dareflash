/**
 * MI HISTORIAL DE BOOSTS — qué entró y qué salió de mi saldo, y nada más.
 *
 * ┌─ AQUÍ NO SE RESUELVE NINGÚN `refId`, Y ESO ES LA DECISIÓN ─────────────────────────────────────┐
 * │ El historial de PUNTOS sí traduce referencias a humano (el título del reto, el @handle de a    │
 * │ quién invitaste) porque ahí la referencia ES la información. En los boosts las referencias son │
 * │ la sesión de pago de Stripe, el id de una activación o EL ADMIN que ajustó: ninguna de las     │
 * │ tres se le enseña al dueño. La primera es jerga de pasarela, la segunda un cuid, y la tercera  │
 * │ señalaría a una persona por una decisión del equipo (la misma regla que en `VozHistorial`).    │
 * │                                                                                               │
 * │ Por eso el DTO no trae `refType` ni `refId`: lo que no está no se puede pintar por descuido.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * KEYSET SOBRE (createdAt, id), NUNCA OFFSET, servido por el índice [userId, createdAt, id] que
 * añade su propia migración. Una compra que entre entre página y página no desplaza nada.
 *
 * LA AUTORIZACIÓN ES POR CONSTRUCCIÓN: no hay parámetro que diga de quién es el historial más allá
 * del `userId`, y la página lo saca de la sesión. No se puede pedir el de otro.
 */
import "server-only";

import { DAREUP_HISTORIAL_PAGINA, RAZON_BOOST_COMPRA } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";

export interface MovimientoBoost {
  id: string;
  /** +N al comprar o recibir, -1 al activar. El signo se enseña, no se deduce. */
  delta: number;
  razon: string;
  /** Solo en compras. `null` en regalos VIP y en activaciones: no tienen importe. */
  importeCents: number | null;
  /**
   * Código ISO de 3 letras en mayúsculas, o `null`. NORMALIZADO AQUÍ y no en la vista: quien pinta
   * un importe lo pasa a `Intl.NumberFormat`, y un código que no sea ISO hace que `Intl` LANCE — o
   * sea, un 500 en un render de servidor por una fila rara. Lo que no cumple sale como `null`, y la
   * vista entonces NO pinta el importe: una cifra de dinero sin su moneda no es un importe, y
   * ponerle el símbolo que nos parezca sería inventárselo.
   */
  moneda: string | null;
  creadoEnMs: number;
}

export interface PaginaBoosts {
  items: MovimientoBoost[];
  /** Cursor opaco de la página siguiente, o `null` si no hay más. */
  proximoCursor: string | null;
}

function codificarCursor(ms: number, id: string): string {
  return `${ms}.${id}`;
}

/** Cursor inválido o manipulado -> primera página. Nunca una excepción por un query param. */
function leerCursor(raw: string | null | undefined): { en: Date; id: string } | null {
  if (!raw) return null;
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const ms = Number(m[1]);
  if (!Number.isSafeInteger(ms)) return null;
  return { en: new Date(ms), id: m[2] };
}

/** MIS movimientos de boosts, del más nuevo al más viejo. Comparte tamaño de página con los puntos. */
export async function miHistorialBoosts(
  db: PrismaClient,
  userId: string,
  opciones: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaBoosts> {
  const limite = Math.min(Math.max(opciones.limite ?? DAREUP_HISTORIAL_PAGINA, 1), 100);
  const desde = leerCursor(opciones.cursor);

  const filas = await db.boostLedger.findMany({
    where: {
      userId,
      ...(desde
        ? {
            OR: [{ createdAt: { lt: desde.en } }, { createdAt: desde.en, id: { lt: desde.id } }],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // Una de más para saber si hay página siguiente sin un COUNT aparte.
    take: limite + 1,
    // SIN `refType` ni `refId` a propósito: ver la cabecera.
    select: {
      id: true,
      delta: true,
      reason: true,
      amountCents: true,
      currency: true,
      createdAt: true,
    },
  });

  const pagina = filas.slice(0, limite);
  const ultima = pagina[pagina.length - 1];

  /** Ver `moneda` en el DTO: lo que no sea un ISO de 3 letras no llega a `Intl`. */
  const monedaDe = (raw: string | null): string | null =>
    raw !== null && /^[A-Za-z]{3}$/.test(raw) ? raw.toUpperCase() : null;

  return {
    items: pagina.map((f) => ({
      id: f.id,
      delta: f.delta,
      razon: f.reason,
      importeCents: f.amountCents,
      moneda: monedaDe(f.currency),
      creadoEnMs: f.createdAt.getTime(),
    })),
    proximoCursor:
      filas.length > limite && ultima
        ? codificarCursor(ultima.createdAt.getTime(), ultima.id)
        : null,
  };
}

/**
 * Cuántos Boosts ha COMPRADO este usuario en total (no cuántos le quedan: eso es `boostBalance`).
 *
 * ES UN `SUM`, Y ESO AQUÍ ESTÁ BIEN. La regla del repositorio es que un agregado no se puede
 * PAGINAR por keyset, y por eso los contadores de listas se materializan; esta cifra no pagina
 * nada: es un número para una tarjeta, acotado por los movimientos de UNA persona.
 *
 * SOLO LAS COMPRAS. Los regalos del VIP y los ajustes del equipo también suman saldo, pero no son
 * compras: meterlos aquí haría que la tarjeta dijera "comprados" sobre algo que nadie pagó.
 */
export async function boostsComprados(db: PrismaClient, userId: string): Promise<number> {
  const r = await db.boostLedger.aggregate({
    where: { userId, reason: RAZON_BOOST_COMPRA },
    _sum: { delta: true },
  });
  return r._sum.delta ?? 0;
}
