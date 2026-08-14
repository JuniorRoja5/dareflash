/**
 * RESTABLECER contrasena ("olvide mi contrasena"). Flujo COMPLETO en dos tramos:
 *
 *  - SOLICITUD (`requestPasswordReset`): crea un token de un solo uso (purpose PASSWORD_RESET) y
 *    ENCOLA el correo con el enlace a /restablecer. El endpoint /api/auth/forgot-password decide
 *    SI llamar aqui (existe la cuenta y esta en condiciones) FUERA del tiempo de respuesta, para no
 *    filtrar por enumeracion — igual que el reenvio de verificacion.
 *  - CONSUMO (`resetPassword`): valida el token (un solo uso, no caducado, purpose DENTRO del WHERE),
 *    fija la contrasena nueva (Argon2id) y REVOCA TODAS las sesiones del usuario, TODO en la MISMA
 *    transaccion. Asi un enlace filtrado no deja sesiones vivas del atacante tras el reset.
 *
 * El MECANISMO del token (hash SHA-256 en BD, caducidad, un token activo por proposito) se COMPARTE
 * con la verificacion y el desbloqueo via `@/server/auth/email-token` — no se duplica. Aqui vive
 * solo lo PROPIO del reset: el TTL, el correo, y la aplicacion transaccional de la contrasena.
 */
import "server-only";

import { PASSWORD_RESET_TTL_MS } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { createEmailToken, hashToken, type CreatedToken } from "@/server/auth/email-token";
import { hashPassword } from "@/server/auth/password";
import { revokeAllUserSessions } from "@/server/auth/session";
import type { EmailMessage } from "@/server/email/adapter";
import { enqueueEmail } from "@/server/email/send";

export type CreatedPasswordReset = CreatedToken;

/** Crea (renovando) el token de reset de una direccion. Devuelve el token en claro para el enlace. */
export function createPasswordReset(
  db: PrismaClient,
  input: { email: string; now?: Date },
): Promise<CreatedPasswordReset> {
  return createEmailToken(db, {
    identifier: input.email,
    purpose: "PASSWORD_RESET",
    ttlMs: PASSWORD_RESET_TTL_MS,
    now: input.now,
  });
}

/** Construye el correo de reset. El enlace se arma desde `appUrl` (env.APP_URL), nunca fijo, y lleva
 *  a la pagina de confirmacion (que NO consume en el GET, ver /restablecer). */
export function buildPasswordResetEmail(
  appUrl: string,
  email: string,
  rawToken: string,
): EmailMessage {
  const url = new URL("/restablecer", appUrl);
  url.searchParams.set("token", rawToken);
  const link = url.toString();
  return {
    to: email,
    subject: "Restablece tu contrasena de DareFlash",
    text: [
      "Has pedido restablecer tu contrasena de DareFlash.",
      "",
      "Para elegir una contrasena nueva, abre este enlace y sigue los pasos:",
      link,
      "",
      "El enlace caduca en 30 minutos y solo sirve una vez.",
      "",
      "Si no has pedido tu, ignora este correo: tu contrasena sigue igual y tu cuenta protegida.",
    ].join("\n"),
  };
}

/**
 * Crea el token y ENCOLA el correo de reset. NO comprueba si la cuenta existe: esa decision (y la
 * uniformidad anti-enumeracion) es del endpoint. Idempotencia atada al token: un doble encolado del
 * MISMO correo no crea dos jobs; una nueva solicitud genera token nuevo -> clave nueva -> job nuevo.
 */
export async function requestPasswordReset(
  db: PrismaClient,
  input: { email: string; appUrl: string; now?: Date },
): Promise<void> {
  const { rawToken } = await createPasswordReset(db, { email: input.email, now: input.now });
  const message = buildPasswordResetEmail(input.appUrl, input.email, rawToken);
  const idempotencyKey = `email:reset:${hashToken(rawToken)}`;
  await enqueueEmail(db, message, { runAt: input.now, idempotencyKey });
}

export type ResetResult = { ok: true } | { ok: false; reason: "INVALID" | "EXPIRED" };

/**
 * Consume el token de reset y aplica la contrasena nueva. El endpoint muestra el MISMO mensaje para
 * INVALID y EXPIRED (sin oraculo de por que fallo).
 *
 * DISENO:
 *  1. PRE-LECTURA barata (sin argon2): si el token no existe o ya caduco, se rechaza SIN hashear.
 *     Sin esto, cada POST con un token cualquiera forzaria un Argon2id (~178 ms) — amplificacion de
 *     CPU gratis para un atacante. Aqui no hay enumeracion que proteger (hace falta un token de 256
 *     bits), asi que saltar el hash de los invalidos no filtra nada.
 *  2. El hash se calcula FUERA de la transaccion (argon2 es lento): no mantener la tx/conexion
 *     abiertas durante el hasheo (mismo criterio que `account.changePassword`).
 *  3. Consumo + aplicacion + revocacion, TODO ATOMICO. El `purpose` va DENTRO del WHERE del delete
 *     (un token de otro proposito no casa). El delete es la SECCION CRITICA de la carrera (dos POST
 *     con el mismo token): solo UNO borra la fila (count===1) y aplica; el otro ve count===0 ->
 *     INVALID. Asi jamas se aplica dos veces ni queda ambiguo quien gano.
 */
export async function resetPassword(
  db: PrismaClient,
  input: { rawToken: string; newPassword: string; now?: Date },
): Promise<ResetResult> {
  const now = input.now ?? new Date();
  const tokenHash = hashToken(input.rawToken);

  const row = await db.verificationToken.findFirst({
    where: { token: tokenHash, purpose: "PASSWORD_RESET" }, // PROPOSITO dentro del WHERE
  });
  if (!row) return { ok: false, reason: "INVALID" };
  if (row.expires.getTime() < now.getTime()) {
    // Un solo uso / higiene: borrar el caducado (no cambia nada mas, no hace falta transaccion).
    await db.verificationToken.deleteMany({
      where: { token: tokenHash, purpose: "PASSWORD_RESET" },
    });
    return { ok: false, reason: "EXPIRED" };
  }

  const passwordHash = await hashPassword(input.newPassword); // lento; FUERA de la transaccion

  return db.$transaction(async (tx) => {
    // Seccion critica: el que borra la fila (count===1) es el que aplica; el resto ve 0 -> INVALID.
    const consumidos = await tx.verificationToken.deleteMany({
      where: { token: tokenHash, purpose: "PASSWORD_RESET" },
    });
    if (consumidos.count === 0) return { ok: false, reason: "INVALID" as const };

    // email es UNICO; el token guarda la direccion en `identifier`.
    const user = await tx.user.findUnique({
      where: { email: row.identifier },
      select: { id: true },
    });
    if (!user) return { ok: false, reason: "INVALID" as const }; // la cuenta ya no existe

    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    // REVOCA TODAS las sesiones: un reset legitimo echa fuera a quien tuviera la cuenta secuestrada.
    await revokeAllUserSessions(tx, user.id);
    return { ok: true as const };
  });
}
