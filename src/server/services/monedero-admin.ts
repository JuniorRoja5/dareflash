import "server-only";

import {
  AJUSTE_NOTA_MAX,
  AJUSTE_NOTA_MIN,
  AJUSTE_SALDO_CENTS_MAX,
  DEFAULT_CURRENCY,
  REF_WALLET_AJUSTE_ADMIN,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { codificarCursorTiempo, decodificarCursorTiempo, dondeDesde } from "@/lib/cursor-tiempo";

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
            action: ACCION_AJUSTE_SALDO,
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

/**
 * LA ACCIÓN del `AuditLog` que escribe un ajuste de saldo. Vive aquí, junto a quien la escribe, y
 * la lee el historial: dos literales "WALLET_ADJUST" en dos ficheros serían dos verdades, y la que
 * se quedara atrás dejaría el historial vacío sin que nada fallara.
 */
export const ACCION_AJUSTE_SALDO = "WALLET_ADJUST";

/** Un ajuste, como lo cuenta el historial del panel. */
export interface AjusteDelHistorial {
  id: string;
  /** Quién lo hizo. `null` si esa cuenta ya no está. */
  adminUsername: string | null;
  /** A quién se le hizo. */
  usuarioId: string;
  usuarioUsername: string | null;
  /** Con signo: positivo acredita, negativo descuenta. */
  deltaCents: number;
  /** El saldo antes y después, tal y como se anotó. Es lo que hace auditable la fila. */
  antesCents: number | null;
  despuesCents: number | null;
  /** El motivo que escribió el admin. Esto es la vista del ADMIN: aquí sí se enseña. */
  nota: string | null;
  createdAt: Date;
}

export interface PaginaAjustes {
  items: AjusteDelHistorial[];
  proximoCursor: string | null;
}

const AJUSTES_LIMITE = 25;

/** Lee un número de un `metadata` que es JSON libre: lo que no sea número es `null`, no un 0. */
function numeroDe(meta: unknown, clave: string): number | null {
  if (typeof meta !== "object" || meta === null) return null;
  const v = (meta as Record<string, unknown>)[clave];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function textoDe(meta: unknown, clave: string): string | null {
  if (typeof meta !== "object" || meta === null) return null;
  const v = (meta as Record<string, unknown>)[clave];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * EL HISTORIAL DE AJUSTES MANUALES, por páginas.
 *
 * ┌─ SALE DEL `AuditLog` Y NO DEL LEDGER, Y ESA ES LA PIEZA ──────────────────────────────────────┐
 * │ El `WalletLedger` tiene la fila del movimiento, pero NO tiene dónde guardar el motivo —esa es │
 * │ la razón de que el motivo viva en la auditoría—. Un historial construido sobre el ledger      │
 * │ enseñaría importes sin ningún porqué, que es justo lo que no sirve para revisar un ajuste.    │
 * │ La auditoría tiene las dos cosas, y además el saldo de antes y el de después.                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * KEYSET sobre `(createdAt, id)`, recorriendo el índice `[action, createdAt, id]`: la tabla de
 * auditoría crece con TODO lo que hace el panel, así que filtrar por acción sin índice sería un
 * recorrido completo que empeora cada día.
 *
 * LOS DOS `username` SE RESUELVEN EN UNA CONSULTA, no una por fila. Y pueden venir `null`: una
 * cuenta borrada no borra su rastro en la auditoría —ese es el sentido de una auditoría—, así que
 * la vista tiene que saber pintar un ajuste cuyo destinatario ya no existe.
 */
export async function listarAjustesMonedero(
  db: PrismaClient,
  opts: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaAjustes> {
  const limite = Math.min(Math.max(1, Math.floor(opts.limite ?? AJUSTES_LIMITE)), AJUSTES_LIMITE);
  const desde = decodificarCursorTiempo(opts.cursor);

  const filas = await db.auditLog.findMany({
    where: { action: ACCION_AJUSTE_SALDO, ...dondeDesde(desde) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    select: { id: true, actorId: true, targetId: true, metadata: true, createdAt: true },
  });

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  const ultima = pagina[pagina.length - 1];

  const ids = [...new Set(pagina.flatMap((f) => [f.actorId, f.targetId].filter(Boolean)))];
  const usuarios = await db.user.findMany({
    where: { id: { in: ids as string[] } },
    select: { id: true, username: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u.username]));

  return {
    items: pagina.map((f) => ({
      id: f.id,
      adminUsername: f.actorId ? (porId.get(f.actorId) ?? null) : null,
      usuarioId: f.targetId ?? "",
      usuarioUsername: f.targetId ? (porId.get(f.targetId) ?? null) : null,
      // El importe sale del `metadata`, que es JSON libre: si no es un número, es `null` y la vista
      // lo dice. Un 0 de relleno en una columna de dinero es una cifra inventada.
      deltaCents: numeroDe(f.metadata, "deltaCents") ?? 0,
      antesCents: numeroDe(f.metadata, "antes"),
      despuesCents: numeroDe(f.metadata, "despues"),
      nota: textoDe(f.metadata, "nota"),
      createdAt: f.createdAt,
    })),
    proximoCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
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
