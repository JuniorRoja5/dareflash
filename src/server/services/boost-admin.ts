/**
 * BOOST VISTO DESDE EL PANEL — ver quién está destacado, retirar a alguien y ajustar sus créditos.
 *
 * ┌─ AQUÍ NO SE REUSA LA CONSULTA DEL ESCAPARATE, Y ESO ES LA PIEZA ──────────────────────────────┐
 * │ `destacadosVigentes` DEDUPLICA por persona, y eso es correcto en la portada: una cara, una     │
 * │ plaza. Pero el panel que reusara esa consulta vería UNA fila de alguien que encadenó dos       │
 * │ boosts, y al "cortarla" dejaría la otra viva. El usuario seguiría en la portada —y el sistema  │
 * │ no se rompería: sigue siendo visible por la aparición que queda, así que nada falla y nada      │
 * │ avisa—. El único que se entera mal es el moderador, que cree que lo retiró y no lo retiró.     │
 * │                                                                                               │
 * │ Un fallo que solo existe en la cabeza de una persona es el más caro de encontrar. Por eso:     │
 * │   - la lista del panel se construye aparte, con el RECUENTO de apariciones de cada uno (no es  │
 * │     adorno: es lo que explica qué se está mirando);                                           │
 * │   - y retirar opera sobre LA PERSONA, no sobre una fila.                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SQL CRUDO por lo mismo que la consulta pública: `BoostActivation` no tiene relación con `User` en
 * el esquema (añadirla sería una FK, o sea una migración, para una lectura), y esto además agrupa.
 *
 * EL AJUSTE CALCA `ajustarPuntos`: motivo obligatorio, `applyBoostCredits` con `ADMIN_ADJUST`,
 * `refType: "ADMIN"` y `refId` = el admin, y clave de idempotencia con espacio de nombres del flujo
 * y del admin. La fila del `BoostLedger` ES la traza. Y `allowNegative: false` del primitivo ya
 * rechaza quitar más créditos de los que hay: no hace falta comprobarlo aquí —hacerlo sería una
 * segunda verdad con su propia ventana de carrera—.
 */
import "server-only";

import {
  AJUSTE_BOOST_DELTA_MAX,
  AJUSTE_NOTA_MAX,
  AJUSTE_NOTA_MIN,
  BOOST_DESTACADOS_TOPE,
  RAZON_BOOST_AJUSTE_ADMIN,
} from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

import { applyBoostCredits, LedgerError } from "./ledger";

// ============================================================================
// VER: quién está destacado, una fila por PERSONA y con su recuento
// ============================================================================

export interface DestacadoPanel {
  userId: string;
  username: string;
  displayName: string | null;
  imagen: string | null;
  puntos: number;
  /** Boosts que le quedan sin gastar. Lo que el ajuste mueve. */
  saldo: number;
  /**
   * Cuántas apariciones VIGENTES lo respaldan. Casi siempre 1; más de una significa que encadenó
   * boosts, y es justo lo que hay que saber antes de retirarlo.
   */
  apariciones: number;
  /** Desde cuándo está destacado: el arranque de su aparición vigente MÁS ANTIGUA. */
  desdeMs: number;
  /** Hasta cuándo se le ve: el final MÁS LEJANO de sus vigentes. */
  hastaMs: number;
  /**
   * Si de verdad se le ve en la portada. Una cuenta suspendida o borrada conserva sus apariciones
   * pero NO se promociona (lo filtra `destacadosVigentes`), así que decir "destacado" sobre ella
   * sería la misma clase de mentira que esta pieza evita. Se enseña, y se marca.
   */
  visible: boolean;
}

interface FilaPanel {
  userId: string;
  username: string;
  displayName: string | null;
  imagen: string | null;
  puntos: number | bigint;
  saldo: number | bigint;
  apariciones: number | bigint;
  desde: Date;
  hasta: Date;
  oculto: number | bigint;
}

/**
 * Los destacados VIGENTES para el panel: una fila por persona, con su recuento.
 *
 * INCLUYE A LAS CUENTAS SUSPENDIDAS, marcadas. La portada las esconde, y por eso el panel tiene que
 * enseñarlas: un moderador que acaba de banear a alguien necesita ver que el baneo ya lo sacó del
 * escaparate, sin preguntárselo. Lo que no puede pasar es que el panel las llame "destacadas" sin
 * matiz, y de eso se encarga `visible`.
 *
 * CON TOPE, aunque no sea el de la portada: "sin límite" es una consulta que crece sin que nadie lo
 * decida. Hoy no puede haber tantos a la vez ni de lejos.
 */
export async function destacadosPanel(
  db: PrismaClient,
  opciones: { ahora?: Date; limite?: number } = {},
): Promise<DestacadoPanel[]> {
  const ahora = opciones.ahora ?? new Date();
  const limite = Math.min(Math.max(opciones.limite ?? BOOST_DESTACADOS_TOPE, 1), 500);

  const filas = await db.$queryRaw<FilaPanel[]>(Prisma.sql`
    SELECT
      a.\`userId\`                AS userId,
      u.\`username\`              AS username,
      u.\`displayName\`           AS displayName,
      u.\`image\`                 AS imagen,
      u.\`pointsBalance\`         AS puntos,
      u.\`boostBalance\`          AS saldo,
      COUNT(*)                    AS apariciones,
      MIN(a.\`startsAt\`)         AS desde,
      MAX(a.\`expiresAt\`)        AS hasta,
      -- Una sola bandera en vez de dos columnas de fechas: la vista solo necesita saber si se le ve.
      (u.\`deletedAt\` IS NOT NULL OR u.\`bannedAt\` IS NOT NULL) AS oculto
    FROM \`BoostActivation\` a
    JOIN \`User\` u ON u.\`id\` = a.\`userId\`
    WHERE a.\`expiresAt\` > ${ahora}
    GROUP BY
      a.\`userId\`, u.\`username\`, u.\`displayName\`, u.\`image\`,
      u.\`pointsBalance\`, u.\`boostBalance\`, u.\`deletedAt\`, u.\`bannedAt\`
    ORDER BY MAX(a.\`startsAt\`) DESC, a.\`userId\` DESC
    LIMIT ${limite}
  `);

  return filas.map((f) => ({
    userId: f.userId,
    username: f.username,
    displayName: f.displayName,
    imagen: f.imagen,
    puntos: Number(f.puntos),
    saldo: Number(f.saldo),
    apariciones: Number(f.apariciones),
    desdeMs: f.desde.getTime(),
    hastaMs: f.hasta.getTime(),
    visible: Number(f.oculto) === 0,
  }));
}

/** La ficha de Boost de un usuario: quién es y cuántos créditos tiene sin gastar. */
export interface FichaBoost {
  id: string;
  username: string;
  displayName: string | null;
  imagen: string | null;
  puntos: number;
  saldo: number;
}

/**
 * Ficha de cualquier usuario para el ajuste de créditos.
 *
 * EXISTE PARA QUE EL AJUSTE NO DEPENDA DE ESTAR DESTACADO. Atarlo a la lista de vigentes habría
 * sido cómodo y arbitrario: regalar un Boost a alguien de soporte es justo lo que se hace con quien
 * NO está destacado —todavía no tiene con qué—. El buscador es el mismo (`buscarUsuarios`) que usa
 * el inspector de puntos.
 */
export async function fichaBoost(db: PrismaClient, userId: string): Promise<FichaBoost | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      image: true,
      pointsBalance: true,
      boostBalance: true,
    },
  });
  return u
    ? {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        imagen: u.image,
        puntos: u.pointsBalance,
        saldo: u.boostBalance,
      }
    : null;
}

// ============================================================================
// RETIRAR: sacar a una PERSONA del escaparate
// ============================================================================

/**
 * Retira a alguien del escaparate expirando TODAS sus apariciones vigentes. Devuelve cuántas.
 *
 * OPERA SOBRE LA PERSONA, NO SOBRE UNA FILA, y ahí está todo el asunto (ver la cabecera): apuntar a
 * "la aparición que enseña el panel" dejaría viva cualquier otra y el moderador creería haber
 * terminado. La condición del `WHERE` es la misma que define "vigente", así que lo que se expira es
 * exactamente lo que se estaba viendo.
 *
 * ES UNA SOLA SENTENCIA, y por eso no hay transacción: no hay dos cosas que coordinar. Envolverla
 * sugeriría que sí, y la siguiente persona buscaría el segundo paso.
 *
 * NO TOCA `boostBalance` NI DEVUELVE EL BOOST. Retirar es una acción de moderación: cortar por abuso
 * no regala crédito. Si algún día hay que devolverlo, es un movimiento `REFUND` aparte y explícito,
 * con su decisión detrás — no un efecto escondido en esta función.
 *
 * Y NO IMPIDE VOLVER A ACTIVAR. Expira lo de ahora; con saldo y cupo del día, la persona puede
 * destacarse otra vez. El freno permanente son los controles de cuenta (suspender), no esto.
 */
export async function retirarDelEscaparate(
  db: PrismaClient,
  userId: string,
  ahora: Date = new Date(),
): Promise<{ expiradas: number }> {
  const expiradas = await db.boostActivation.updateMany({
    where: { userId, expiresAt: { gt: ahora } },
    data: { expiresAt: ahora },
  });
  return { expiradas: expiradas.count };
}

// ============================================================================
// AJUSTAR: regalar o quitar créditos, con motivo y auditable
// ============================================================================

export type CodigoAjusteBoost =
  "NOTA_OBLIGATORIA" | "DELTA_INVALIDO" | "USUARIO_NO_EXISTE" | "SALDO_NEGATIVO";

export class AjusteBoostError extends Error {
  constructor(
    public readonly code: CodigoAjusteBoost,
    message: string,
  ) {
    super(message);
    this.name = "AjusteBoostError";
  }
}

/**
 * Clave de idempotencia del ajuste: la que manda el panel por INTENCIÓN (la misma en los reintentos
 * de esa intención), con espacio de nombres del flujo y del admin. Así una clave del cliente no
 * puede chocar con las de otros flujos del ledger de boosts —la compra, la activación— ni con las de
 * otro admin.
 */
export function claveAjusteBoost(adminId: string, clave: string): string {
  return `boost:ajuste:${adminId}:${clave}`;
}

export interface EntradaAjusteBoost {
  /** El admin que ajusta: queda como `refId` de la fila. Es el QUIÉN de la traza. */
  adminId: string;
  userId: string;
  /** Boosts a sumar (+) o quitar (−). Entero distinto de 0. */
  delta: number;
  /** Por qué. Obligatoria: la fila de ledger es la traza y sin motivo no traza nada. */
  nota: string;
  /** Clave de la petición (una por intención de ajuste). */
  clave: string;
}

/**
 * Ajusta los créditos de boost de un usuario con una fila nueva de ledger. Devuelve si se aplicó
 * AHORA (`false` = esa clave ya estaba aplicada: reenvío, doble clic) y el saldo resultante.
 *
 * NUNCA UN UPDATE DE `boostBalance`: el saldo se mueve por el ledger o no se mueve. Un saldo sin su
 * fila es un descuadre, y aquí además sería un descuadre sin autor.
 */
export async function ajustarCreditosBoost(
  db: PrismaClient,
  entrada: EntradaAjusteBoost,
): Promise<{ aplicado: boolean; saldo: number }> {
  const nota = entrada.nota.trim();
  if (nota.length < AJUSTE_NOTA_MIN || nota.length > AJUSTE_NOTA_MAX) {
    throw new AjusteBoostError(
      "NOTA_OBLIGATORIA",
      `El motivo es obligatorio (entre ${AJUSTE_NOTA_MIN} y ${AJUSTE_NOTA_MAX} caracteres).`,
    );
  }
  const { delta } = entrada;
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > AJUSTE_BOOST_DELTA_MAX) {
    throw new AjusteBoostError(
      "DELTA_INVALIDO",
      `La cantidad tiene que ser un número entero distinto de 0 (como mucho ${AJUSTE_BOOST_DELTA_MAX}).`,
    );
  }

  try {
    const r = await applyBoostCredits(db, {
      userId: entrada.userId,
      delta,
      reason: RAZON_BOOST_AJUSTE_ADMIN,
      refType: "ADMIN",
      refId: entrada.adminId,
      // EL MOTIVO VA EN LA FILA. Exigirlo y no guardarlo sería pedirle a alguien que escriba para
      // la papelera; `BoostLedger.nota` existe desde esta pieza justo para esto.
      nota,
      idempotencyKey: claveAjusteBoost(entrada.adminId, entrada.clave),
    });
    return { aplicado: r.applied, saldo: r.balance };
  } catch (e) {
    if (e instanceof LedgerError && e.code === "USER_NOT_FOUND") {
      throw new AjusteBoostError("USUARIO_NO_EXISTE", "Ese usuario no existe.");
    }
    if (e instanceof LedgerError && e.code === "INSUFFICIENT_BALANCE") {
      throw new AjusteBoostError(
        "SALDO_NEGATIVO",
        "No se le pueden quitar más Boosts de los que tiene.",
      );
    }
    throw e;
  }
}
