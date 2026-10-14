import "server-only";

import {
  AJUSTE_NOTA_MAX,
  AJUSTE_NOTA_MIN,
  AJUSTE_SALDO_CENTS_MAX,
  DEFAULT_CURRENCY,
  REF_WALLET_AJUSTE_ADMIN,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";

import { applyWallet, LedgerError } from "./ledger";

/**
 * AJUSTE MANUAL DEL SALDO DEL MONEDERO — el admin acredita o debita dinero de verdad.
 *
 * ┌─ PARA QUÉ EXISTE ─────────────────────────────────────────────────────────────────────────────┐
 * │ Para corregir (un premio que no entró, una devolución que hay que rehacer) y para PROBAR el    │
 * │ cobro de punta a punta. Antes la única forma de poner saldo era escribir SQL contra producción,│
 * │ que es exactamente lo que no se hace: un `UPDATE walletBalanceCents` sin su fila de ledger es  │
 * │ un descuadre, y encima sin autor.                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CALCA `ajustarCreditosBoost`, que a su vez calca `ajustarPuntos`: motivo obligatorio, clave de
 * idempotencia con espacio de nombres del flujo Y del admin, y el saldo movido SOLO por el ledger.
 *
 * ┌─ LAS DOS DIFERENCIAS CON EL AJUSTE DE BOOST, Y SU PORQUÉ ─────────────────────────────────────┐
 * │ 1. EL MOTIVO NO CABE EN LA FILA. `BoostLedger` tiene columna `nota`; `WalletLedger` no, y      │
 * │    añadirla sería una migración que esta pieza no lleva. Así que el motivo va al `AuditLog`,   │
 * │    que es donde de todas formas tenía que estar: el motivo y el handle de quien ajusta son     │
 * │    traza INTERNA y no se le enseñan al dueño de la cuenta (misma regla que la nota del ajuste  │
 * │    de puntos). Que no quepan en la fila que el usuario puede llegar a ver no es una carencia:  │
 * │    es la puerta, puesta por el esquema.                                                        │
 * │ 2. ES DINERO, así que la traza no puede ir "después". Se escribe dentro de `trasAplicar`, o    │
 * │    sea en la MISMA transacción y con el `User` todavía bloqueado — y, por cómo funciona esa    │
 * │    costura, SOLO cuando el movimiento se ha aplicado de verdad. Si fuera una escritura         │
 * │    posterior, un fallo entre medias dejaría dinero movido sin nadie que responda por él; y un  │
 * │    reenvío de la misma clave escribiría una segunda entrada de auditoría de un ajuste que no   │
 * │    volvió a ocurrir.                                                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `allowNegative: false` (el del primitivo) ya impide dejar el saldo en números rojos: no se
 * comprueba aquí, porque una segunda comprobación fuera de la transacción tendría su propia ventana
 * de carrera y daría una respuesta distinta de la que manda.
 */

export type CodigoAjusteSaldo =
  "NOTA_OBLIGATORIA" | "IMPORTE_INVALIDO" | "USUARIO_NO_EXISTE" | "SALDO_NEGATIVO";

export class AjusteSaldoError extends Error {
  constructor(
    public readonly code: CodigoAjusteSaldo,
    message: string,
  ) {
    super(message);
    this.name = "AjusteSaldoError";
  }
}

/**
 * Clave de idempotencia del ajuste: la que manda el panel por INTENCIÓN, con espacio de nombres del
 * flujo y del admin. Así una clave del cliente no puede chocar con las de otros flujos del monedero
 * —el premio, la retirada, el reembolso— ni con las de otro admin.
 */
export function claveAjusteSaldo(adminId: string, clave: string): string {
  return `monedero:ajuste:${adminId}:${clave}`;
}

export interface EntradaAjusteSaldo {
  /** El admin que ajusta: queda como `refId` de la fila y como actor de la auditoría. */
  adminId: string;
  userId: string;
  /** Céntimos a sumar (+) o quitar (−). Entero distinto de 0. */
  deltaCents: number;
  /** Por qué. Obligatorio: un movimiento de dinero sin motivo no se puede auditar. */
  nota: string;
  /** Clave de la petición (una por intención de ajuste). */
  clave: string;
}

export async function ajustarSaldoMonedero(
  db: PrismaClient,
  entrada: EntradaAjusteSaldo,
): Promise<{ aplicado: boolean; saldoCents: number }> {
  const nota = entrada.nota.trim();
  if (nota.length < AJUSTE_NOTA_MIN || nota.length > AJUSTE_NOTA_MAX) {
    throw new AjusteSaldoError(
      "NOTA_OBLIGATORIA",
      `El motivo es obligatorio (entre ${AJUSTE_NOTA_MIN} y ${AJUSTE_NOTA_MAX} caracteres).`,
    );
  }
  const { deltaCents } = entrada;
  if (
    !Number.isInteger(deltaCents) ||
    deltaCents === 0 ||
    Math.abs(deltaCents) > AJUSTE_SALDO_CENTS_MAX
  ) {
    throw new AjusteSaldoError(
      "IMPORTE_INVALIDO",
      `El importe tiene que ser un número entero de céntimos distinto de 0 (como mucho ${AJUSTE_SALDO_CENTS_MAX}).`,
    );
  }

  const idempotencyKey = claveAjusteSaldo(entrada.adminId, entrada.clave);

  try {
    const r = await applyWallet(db, {
      userId: entrada.userId,
      amountCents: deltaCents,
      currency: DEFAULT_CURRENCY,
      // El signo lo lleva el importe; `entryType` dice de qué lado está la fila al leer el ledger.
      entryType: deltaCents > 0 ? "CREDIT" : "DEBIT",
      refType: REF_WALLET_AJUSTE_ADMIN,
      refId: entrada.adminId,
      idempotencyKey,
      trasAplicar: async (tx, antes, despues) => {
        await tx.auditLog.create({
          data: {
            actorId: entrada.adminId,
            action: "WALLET_ADJUST",
            targetType: "USER",
            targetId: entrada.userId,
            // EL SALDO DE ANTES Y EL DE DESPUÉS, no solo el delta: es lo que convierte la traza en
            // auditable sin tener que recomponer el ledger entero para saber sobre qué se aplicó.
            metadata: { deltaCents, antes, despues, nota, idempotencyKey },
          },
        });
      },
    });
    return { aplicado: r.applied, saldoCents: r.balance };
  } catch (e) {
    if (e instanceof LedgerError && e.code === "USER_NOT_FOUND") {
      throw new AjusteSaldoError("USUARIO_NO_EXISTE", "Ese usuario no existe.");
    }
    if (e instanceof LedgerError && e.code === "INSUFFICIENT_BALANCE") {
      throw new AjusteSaldoError(
        "SALDO_NEGATIVO",
        "No se le puede quitar más saldo del que tiene: el monedero no se queda en negativo.",
      );
    }
    throw e;
  }
}

/** La ficha de monedero de un usuario: quién es y cuánto tiene. Para el formulario del ajuste. */
export interface FichaMonedero {
  id: string;
  username: string;
  displayName: string | null;
  imagen: string | null;
  saldoCents: number;
}

/**
 * Ficha de CUALQUIER usuario, no solo de quien ya pidió un cobro. Atar el ajuste a la cola de
 * retiradas habría sido cómodo y arbitrario: corregir el premio que no entró es justo lo que se
 * hace con alguien que todavía no ha pedido nada.
 */
export async function fichaMonedero(
  db: PrismaClient,
  userId: string,
): Promise<FichaMonedero | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      image: true,
      walletBalanceCents: true,
    },
  });
  return u
    ? {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        imagen: u.image,
        saldoCents: u.walletBalanceCents,
      }
    : null;
}
