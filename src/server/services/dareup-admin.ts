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
  RAZON_INVITO_AMIGO,
  RAZON_REGISTRO_CON_REFERIDO,
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
  nota: string | null;
  creadoEnMs: number;
  /**
   * A QUÉ apunta el movimiento, YA EN HUMANO: "por @admin", el título del reto, o "—".
   *
   * SIN `refType` ni `refId` EN EL DTO, y esa ausencia es la pieza. Antes viajaban los dos y la vista
   * pintaba `${refType} · ${refId}`, o sea el cuid crudo de la base de datos («challenge · cmtww…»).
   * La regla de copy —cero ids a la vista— no se cumple pidiéndole disciplina a la pantalla: se
   * cumple no dándole el id. Lo que no está no se puede pintar.
   */
  referencia: string;
}

/** Copy de las referencias. Aquí, al lado de quien las resuelve, como `RAZON_HUMANA` en la vista. */
const REF_ADMIN_SIN_NOMBRE = "por un admin";
/** El reto existió y ya no está (purgado). Se dice, no se enseña su id. */
const REF_RETO_AUSENTE = "un reto que ya no está disponible";
/** No hay a qué apuntar, o apunta al propio usuario de la ficha (un hito suyo). */
const REF_NINGUNA = "—";

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

  // RESOLUCIÓN EN LOTE, una consulta POR TIPO para toda la página, nunca una por fila. Los dos tipos
  // que apuntan a personas (`ADMIN`, el admin que ajustó; `USER`, el usuario de un hito) se juntan en
  // la MISMA consulta de usuarios: son ids de la misma tabla, así que pedirlos por separado serían
  // dos viajes para lo mismo. Total: dos consultas por página, haya 1 movimiento o 100.
  const idsDe = (tipos: string[]): string[] => [
    ...new Set(
      pagina.flatMap((f) => (f.refId !== null && tipos.includes(f.refType ?? "") ? [f.refId] : [])),
    ),
  ];
  const personaIds = idsDe(["ADMIN", "USER"]);
  const retoIds = idsDe(["CHALLENGE"]);

  const [personas, retos] = await Promise.all([
    personaIds.length > 0
      ? db.user.findMany({
          where: { id: { in: personaIds } },
          select: { id: true, username: true },
        })
      : Promise.resolve([]),
    retoIds.length > 0
      ? db.challenge.findMany({ where: { id: { in: retoIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
  ]);
  const handle = new Map(personas.map((p) => [p.id, p.username]));
  const titulo = new Map(retos.map((r) => [r.id, r.title]));

  /** De (razón, tipo, id) a una etiqueta humana. NUNCA devuelve un id: ese es todo el punto. */
  const referenciaDe = (razon: string, refType: string | null, refId: string | null): string => {
    if (!refType || !refId) return REF_NINGUNA;
    if (refType === "ADMIN") {
      const h = handle.get(refId);
      return h ? `por @${h}` : REF_ADMIN_SIN_NOMBRE;
    }
    if (refType === "CHALLENGE") return titulo.get(refId) ?? REF_RETO_AUSENTE;
    if (refType === "USER") {
      // Un movimiento que apunta al PROPIO dueño de la ficha no añade nada: es su hito, y repetir su
      // handle en cada fila de su propio historial es ruido.
      if (refId === userId) return REF_NINGUNA;
      const h = handle.get(refId);
      if (!h) return REF_NINGUNA;
      // LOS DOS LADOS DE UNA INVITACIÓN. Las dos filas son `USER` y se apuntan mutuamente, así que
      // lo único que las distingue es la RAZÓN: por eso se pasa. Sin ella, el historial diría
      // "@fulano" en los dos casos y no se sabría quién invitó a quién.
      if (razon === RAZON_INVITO_AMIGO) return `Invitó a @${h}`;
      if (razon === RAZON_REGISTRO_CON_REFERIDO) return `Se registró con el enlace de @${h}`;
      return `@${h}`;
    }
    // Un tipo que este código no conoce NO se enseña tal cual: sería el cuid otra vez, con otra excusa.
    return REF_NINGUNA;
  };

  const ultima = pagina[pagina.length - 1];
  return {
    items: pagina.map((f) => ({
      id: f.id,
      delta: f.delta,
      razon: f.reason,
      nota: f.nota,
      creadoEnMs: f.createdAt.getTime(),
      referencia: referenciaDe(f.reason, f.refType, f.refId),
    })),
    nextCursor:
      filas.length > limite && ultima
        ? codificarCursor(ultima.createdAt.getTime(), ultima.id)
        : null,
  };
}
