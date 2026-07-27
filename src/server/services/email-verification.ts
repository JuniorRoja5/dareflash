/**
 * Verificacion de email — CONTROL DE SEGURIDAD, no tramite. Sin OAuth, es la unica
 * barrera contra el registro masivo de cuentas falsas.
 *
 * Principios (todos aplicados aqui o documentados para el endpoint):
 *  1. El token se genera con aleatoriedad CRIPTOGRAFICA (256 bits) y en la BD solo
 *     vive su HASH (SHA-256). Si se filtra la tabla, los tokens no sirven. Un hash
 *     rapido basta porque el token es de alta entropia (no hay fuerza bruta posible;
 *     argon2 —para contrasenas de baja entropia— seria innecesario).
 *  2. Un solo uso: al confirmar se BORRA el token, exista o no el usuario.
 *  3. Caducidad (EMAIL_VERIFICATION_TTL_MS).
 *  4. El enlace lleva a una PAGINA con boton (POST), no verifica en el GET: los
 *     escaneres de correo hacen prefetch del enlace y consumirian un token de un
 *     solo uso antes de que el usuario haga clic.
 *
 * SIN ENUMERACION / TIMING (se aplica en el ENDPOINT, no aqui): registro, reenvio y
 * recuperacion responden IGUAL exista o no la direccion. Nunca se loguea el token.
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { EMAIL_VERIFICATION_TTL_MS } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";

import type { EmailMessage } from "@/server/email/adapter";
import { enqueueEmail } from "@/server/email/send";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface CreatedVerification {
  rawToken: string; // EN CLARO, solo para el enlace del correo. En BD va el hash.
  expires: Date;
}

/** Crea (renovando) el token de verificacion de una direccion. Un token activo por
 *  direccion: borra los previos. Devuelve el token en claro para el enlace. */
export async function createEmailVerification(
  db: PrismaClient,
  input: { email: string; now?: Date },
): Promise<CreatedVerification> {
  const now = input.now ?? new Date();
  const rawToken = randomBytes(32).toString("base64url"); // 256 bits
  const tokenHash = hashToken(rawToken);
  const expires = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);

  await db.verificationToken.deleteMany({ where: { identifier: input.email } });
  await db.verificationToken.create({
    data: { identifier: input.email, token: tokenHash, expires },
  });

  return { rawToken, expires };
}

export type ConfirmResult =
  { verified: true; email: string } | { verified: false; reason: "INVALID" | "EXPIRED" };

/** Confirma el token (POST del boton de la pagina de verificacion). Single-use:
 *  consume el token SIEMPRE (aunque este caducado). */
export async function confirmEmailVerification(
  db: PrismaClient,
  input: { rawToken: string; now?: Date },
): Promise<ConfirmResult> {
  const now = input.now ?? new Date();
  const tokenHash = hashToken(input.rawToken);

  const row = await db.verificationToken.findFirst({ where: { token: tokenHash } });
  if (!row) return { verified: false, reason: "INVALID" };

  // Un solo uso: consumir el token pase lo que pase.
  await db.verificationToken.deleteMany({ where: { token: tokenHash } });

  if (row.expires.getTime() < now.getTime()) {
    return { verified: false, reason: "EXPIRED" };
  }

  // Marcar verificada la cuenta de esa direccion (email es unico).
  await db.user.updateMany({
    where: { email: row.identifier },
    data: { emailVerified: now },
  });

  return { verified: true, email: row.identifier };
}

/** Construye el correo de verificacion. El enlace se arma desde `appUrl` (env.APP_URL),
 *  nunca fijo, y lleva a la pagina de confirmacion (no verifica en el GET). */
export function buildVerificationEmail(
  appUrl: string,
  email: string,
  rawToken: string,
): EmailMessage {
  const url = new URL("/verify", appUrl);
  url.searchParams.set("token", rawToken);
  const link = url.toString();
  return {
    to: email,
    subject: "Verifica tu cuenta de DareFlash",
    text: [
      "Bienvenido a DareFlash.",
      "",
      "Para activar tu cuenta, abre este enlace y pulsa el boton de confirmacion:",
      link,
      "",
      "Si no te has registrado, ignora este correo. El enlace caduca en 24 horas.",
    ].join("\n"),
  };
}

/** Crea el token y ENCOLA el correo de verificacion. Lo usan registro y reenvio. */
export async function requestEmailVerification(
  db: PrismaClient,
  input: { email: string; appUrl: string; now?: Date },
): Promise<void> {
  const { rawToken } = await createEmailVerification(db, { email: input.email, now: input.now });
  const message = buildVerificationEmail(input.appUrl, input.email, rawToken);
  await enqueueEmail(db, message, { runAt: input.now });
}
