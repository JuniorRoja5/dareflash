/**
 * REFERIDOS — el enlace de invitación y el premio de las dos partes.
 *
 * ┌─ EL PREMIO SE PAGA A LA VERIFICACIÓN, NO AL REGISTRO ───────────────────────────────────────────┐
 * │ Registrarse es gratis y automatizable: pagar ahí convierte el sistema de referidos en una       │
 * │ máquina de fabricar puntos con direcciones desechables. Verificar el correo es la misma barrera │
 * │ antifraude que ya exige el resto del producto para cualquier acción con efectos (ver `rbac`),   │
 * │ así que el referido cobra cuando el invitado demuestra que la dirección es suya.                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * UNA SOLA VEZ POR REFERIDO, y lo garantiza la clave de idempotencia del ledger —derivada del
 * INVITADO, no de la fecha ni de la petición—, no un `if`. Reverificar, o que el barrido pase dos
 * veces, no paga dos veces: la segunda inserción choca con el UNIQUE y es un no-op.
 *
 * COBRAN LOS DOS, con el mismo importe y razones DISTINTAS (ver `constants`): las dos filas son
 * `refType: "USER"` apuntándose mutuamente, así que sin razones distintas el historial no podría
 * decir quién invitó a quién.
 */
import "server-only";

import {
  PARAM_REFERIDO,
  POINTS,
  RAZON_INVITO_AMIGO,
  RAZON_REGISTRO_CON_REFERIDO,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { esCodigoReferidoValido } from "@/server/auth/codigo-referido";
import type { Db } from "@/server/db/types";
import { sanearError } from "@/server/observability/sanitize-error";

import { applyPoints } from "./ledger";

/**
 * El ENLACE que se comparte. Se construye desde `appUrl` (nunca una URL fija) y apunta a la entrada,
 * que es donde el invitado se registra. Lo que se le enseña a la gente es esto, no el código suelto:
 * un código pelado hay que explicarlo, un enlace se pega y ya.
 */
export function enlaceReferido(appUrl: string, codigo: string): string {
  const url = new URL("/entrar", appUrl);
  url.searchParams.set(PARAM_REFERIDO, codigo);
  return url.toString();
}

/**
 * Quién hay detrás de un código, o `null`.
 *
 * NUNCA LANZA Y NUNCA BLOQUEA EL ALTA: un código con mala forma, inexistente, de una cuenta borrada
 * o de una SUSPENDIDA devuelve `null`, y quien llama sigue adelante sin referente. Registrarse es lo
 * importante; que el enlace fuera bueno es secundario, y fallar el alta por un parámetro manipulado
 * sería regalarle a cualquiera un botón de "romper el registro" pegando un enlace roto.
 *
 * Se excluye a los SUSPENDIDOS a propósito: invitar es ganar puntos, y una cuenta a la que se ha
 * echado por moderación no sigue cobrando por traer gente.
 */
export async function referentePorCodigo(db: Db, codigo: unknown): Promise<string | null> {
  // La forma se comprueba ANTES de tocar la base: un `?ref=` de 400 caracteres no llega a ser consulta.
  if (!esCodigoReferidoValido(codigo)) return null;
  const u = await db.user.findFirst({
    where: { referralCode: codigo, deletedAt: null, bannedAt: null },
    select: { id: true },
  });
  return u?.id ?? null;
}

export interface ResultadoPremio {
  /** true si ESTA llamada escribió los otorgamientos (la primera). false en cualquier repetición. */
  pagado: boolean;
}

/**
 * Paga la invitación de `invitadoId`, si la hay y si ya verificó. Idempotente de verdad.
 *
 * Se llama desde la confirmación del correo. Si algo falla aquí, NO se hace caer la verificación:
 * quedarse sin verificar la cuenta por no poder dar diez puntos sería un intercambio pésimo. Se
 * anota y se sigue; la clave de idempotencia deja la puerta abierta a reintentarlo.
 */
export async function premiarReferido(
  db: PrismaClient,
  invitadoId: string,
): Promise<ResultadoPremio> {
  const invitado = await db.user.findUnique({
    where: { id: invitadoId },
    select: { id: true, referredById: true, emailVerified: true },
  });
  if (!invitado?.referredById) return { pagado: false };
  // No puede ocurrir (el referente se fija al crear, cuando el invitado aún no existe), pero si
  // ocurriera sería alguien pagándose a sí mismo: se corta aquí y no en un comentario.
  if (invitado.referredById === invitado.id) return { pagado: false };
  // LA BARRERA: sin correo verificado no hay premio. Es lo que impide fabricar puntos con desechables.
  if (!invitado.emailVerified) return { pagado: false };

  const referenteId = invitado.referredById;
  // El referente pudo borrarse o ser suspendido entre el alta y la verificación. Su fila de puntos no
  // se escribe, pero la del INVITADO sí: él no tiene culpa de a quién siguió.
  const referente = await db.user.findFirst({
    where: { id: referenteId, deletedAt: null, bannedAt: null },
    select: { id: true },
  });

  let pagado = false;
  if (referente) {
    const r = await applyPoints(db, {
      userId: referenteId,
      delta: POINTS.INVITE_FRIEND,
      reason: RAZON_INVITO_AMIGO,
      refType: "USER",
      refId: invitadoId,
      // Derivada del INVITADO: una invitación, un pago, para siempre.
      idempotencyKey: `${RAZON_INVITO_AMIGO}:${invitadoId}`,
    });
    pagado = r.applied;
  }

  const propio = await applyPoints(db, {
    userId: invitadoId,
    delta: POINTS.INVITE_FRIEND,
    reason: RAZON_REGISTRO_CON_REFERIDO,
    refType: "USER",
    refId: referenteId,
    idempotencyKey: `${RAZON_REGISTRO_CON_REFERIDO}:${invitadoId}`,
  });

  return { pagado: pagado || propio.applied };
}

/**
 * Lo mismo, pero sin poder tumbar a quien llama. La verificación del correo la usa así: el premio es
 * un efecto secundario deseable, no parte del hecho de verificar.
 */
export async function premiarReferidoSinFallar(
  db: PrismaClient,
  invitadoId: string,
): Promise<void> {
  try {
    await premiarReferido(db, invitadoId);
  } catch (e) {
    console.error(`[referidos] premio de ${invitadoId}: ${sanearError(e)}`);
  }
}
