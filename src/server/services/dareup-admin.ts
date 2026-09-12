/**
 * DAREUP EN EL PANEL (Fase 4): inspeccionar la puntuación de juego de un usuario y AJUSTARLA a mano.
 *
 * EL AJUSTE ES UNA FILA NUEVA DE LEDGER, JAMÁS UNA MUTACIÓN. Pasa por `applyPoints`, el mismo
 * primitivo del cierre y del hito: bloquea al usuario, inserta el movimiento y escribe el saldo en la
 * misma transacción, con idempotencia por clave única. Aquí no hay ni un UPDATE del saldo: el saldo es
 * la caché del ledger, y la fila de ledger ES la traza (no hay AuditLog hasta la Fase 7):
 *   - razón `ADMIN_AJUSTE`, refType "ADMIN", refId = el admin que lo hizo (QUIÉN);
 *   - nota OBLIGATORIA (POR QUÉ), en la columna `nota` de la fila;
 *   - clave de idempotencia de la PETICIÓN, con espacio de nombres del flujo y del admin.
 *
 * Un ajuste positivo que cruza un umbral avisa SUBISTE_NIVEL (lo emite `applyPoints`, como en toda
 * vía de puntos); uno negativo no avisa de nada, igual que el resto: no existe el aviso "bajaste".
 *
 * PUNTOS NO SON VICTORIAS. El ranking del mes se ordena por victorias (`ChallengeResult`); un ajuste
 * cambia saldo y nivel, nunca las victorias ni el puesto. Este módulo no toca `RankingMensual`, y un
 * test lo fija.
 */
import "server-only";

import {
  AJUSTE_DELTA_MAX,
  AJUSTE_NOTA_MAX,
  AJUSTE_NOTA_MIN,
  DAREUP_HISTORIAL_PAGINA,
  RAZON_AJUSTE_ADMIN,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";
import { applyPoints, LedgerError } from "@/server/services/ledger";

export type CodigoAjuste =
  "NOTA_OBLIGATORIA" | "DELTA_INVALIDO" | "USUARIO_NO_EXISTE" | "SALDO_NEGATIVO";

export class AjusteError extends Error {
  constructor(
    public readonly code: CodigoAjuste,
    message: string,
  ) {
    super(message);
    this.name = "AjusteError";
  }
}

/**
 * Clave de idempotencia del ajuste: la que manda el panel por INTENCIÓN de ajuste (la misma en los
 * reintentos de esa intención), con espacio de nombres. Así una clave del cliente no puede chocar con
 * las de otros flujos del ledger (las del cierre, las del hito) ni con las de otro admin.
 */
export function claveAjuste(adminId: string, clave: string): string {
  return `${RAZON_AJUSTE_ADMIN}:${adminId}:${clave}`;
}

export interface EntradaAjuste {
  /** El admin que ajusta: queda como `refId` de la fila. */
  adminId: string;
  userId: string;
  /** Puntos a sumar (+) o restar (−). Entero distinto de 0. */
  delta: number;
  /** Por qué. Obligatoria. */
  nota: string;
  /** Clave de la petición (una por intención de ajuste). */
  clave: string;
}

/**
 * Ajusta los puntos de un usuario con una fila nueva de ledger. Devuelve si se aplicó AHORA (false =
 * la misma clave ya estaba aplicada: reenvío, doble clic) y el saldo resultante.
 */
export async function ajustarPuntos(
  db: PrismaClient,
  entrada: EntradaAjuste,
): Promise<{ aplicado: boolean; saldo: number }> {
  const nota = entrada.nota.trim();
  if (nota.length < AJUSTE_NOTA_MIN || nota.length > AJUSTE_NOTA_MAX) {
    throw new AjusteError(
      "NOTA_OBLIGATORIA",
      `El motivo es obligatorio (entre ${AJUSTE_NOTA_MIN} y ${AJUSTE_NOTA_MAX} caracteres).`,
    );
  }
  const { delta } = entrada;
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > AJUSTE_DELTA_MAX) {
    throw new AjusteError(
      "DELTA_INVALIDO",
      `La cantidad tiene que ser un número entero distinto de 0 (como mucho ${AJUSTE_DELTA_MAX}).`,
    );
  }

  try {
    const r = await applyPoints(db, {
      userId: entrada.userId,
      delta,
      reason: RAZON_AJUSTE_ADMIN,
      refType: "ADMIN",
      refId: entrada.adminId,
      nota,
      idempotencyKey: claveAjuste(entrada.adminId, entrada.clave),
    });
    return { aplicado: r.applied, saldo: r.balance };
  } catch (e) {
    if (e instanceof LedgerError && e.code === "USER_NOT_FOUND") {
      throw new AjusteError("USUARIO_NO_EXISTE", "Ese usuario no existe.");
    }
    if (e instanceof LedgerError && e.code === "INSUFFICIENT_BALANCE") {
      throw new AjusteError("SALDO_NEGATIVO", "Los puntos no pueden quedar en negativo.");
    }
    throw e;
  }
}

/** La ficha DareUp de un usuario: quién es y cuántos puntos tiene (el nivel se deriva al pintar). */
export interface FichaDareUp {
  id: string;
  username: string;
  displayName: string | null;
  image: string | null;
  puntos: number;
}

export async function fichaDareUp(db: Db, userId: string): Promise<FichaDareUp | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, image: true, pointsBalance: true },
  });
  return u
    ? {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        image: u.image,
        puntos: u.pointsBalance,
      }
    : null;
}

/** Un movimiento del ledger de puntos, tal y como lo lee el inspector. */
export interface MovimientoPuntos {
  id: string;
  delta: number;
  razon: string;
  refType: string | null;
  refId: string | null;
  nota: string | null;
  creadoEnMs: number;
  /** Handle del admin que lo hizo, en los ajustes manuales; `null` en el resto. */
  autor: string | null;
}

export interface PaginaHistorial {
  items: MovimientoPuntos[];
  /** Cursor opaco de la página siguiente, o `null` si no hay más. */
  nextCursor: string | null;
}

function codificarCursor(creadoEnMs: number, id: string): string {
  return `${creadoEnMs}.${id}`;
}

/** Un cursor corrupto se ignora (se sirve la primera página), igual que en el resto de listas. */
function leerCursor(cursor: string | null | undefined): { en: Date; id: string } | null {
  if (!cursor) return null;
  const corte = cursor.indexOf(".");
  if (corte <= 0) return null;
  const ms = Number(cursor.slice(0, corte));
  const id = cursor.slice(corte + 1);
  if (!Number.isInteger(ms) || id.length === 0) return null;
  return { en: new Date(ms), id };
}

/**
 * HISTORIAL de puntos de un usuario, del más nuevo al más viejo, por KEYSET sobre (createdAt, id): el
 * índice [userId, createdAt, id] lo sirve en una pasada, y un movimiento que entre entre página y
 * página no desplaza nada. Nunca OFFSET.
 *
 * CERO N+1: el QUIÉN de los ajustes manuales (refId = admin) se resuelve con UNA consulta de usuarios
 * para toda la página, no una por fila. Dos consultas por página, haya los movimientos que haya.
 */
export async function historialPuntos(
  db: Db,
  userId: string,
  opciones: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaHistorial> {
  const limite = Math.min(Math.max(opciones.limite ?? DAREUP_HISTORIAL_PAGINA, 1), 100);
  const desde = leerCursor(opciones.cursor);

  const filas = await db.pointsLedger.findMany({
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
    select: {
      id: true,
      delta: true,
      reason: true,
      refType: true,
      refId: true,
      nota: true,
      createdAt: true,
    },
  });

  const pagina = filas.slice(0, limite);
  const adminIds = [
    ...new Set(pagina.flatMap((f) => (f.refType === "ADMIN" && f.refId !== null ? [f.refId] : []))),
  ];
  const admins =
    adminIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, username: true },
        })
      : [];
  const handle = new Map(admins.map((a) => [a.id, a.username]));

  const ultima = pagina[pagina.length - 1];
  return {
    items: pagina.map((f) => ({
      id: f.id,
      delta: f.delta,
      razon: f.reason,
      refType: f.refType,
      refId: f.refId,
      nota: f.nota,
      creadoEnMs: f.createdAt.getTime(),
      autor: f.refType === "ADMIN" && f.refId !== null ? (handle.get(f.refId) ?? null) : null,
    })),
    nextCursor:
      filas.length > limite && ultima
        ? codificarCursor(ultima.createdAt.getTime(), ultima.id)
        : null,
  };
}
