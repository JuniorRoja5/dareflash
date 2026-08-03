/**
 * Verificacion de email — CONTROL DE SEGURIDAD, no tramite. Sin OAuth, es la unica barrera contra
 * el registro masivo de cuentas falsas.
 *
 * El MECANISMO del token (un solo uso, hash SHA-256 en BD, caducidad, un token activo por
 * proposito, `purpose` dentro del WHERE) vive en `@/server/auth/email-token` y se COMPARTE con el
 * desbloqueo de cuenta — no se duplica. Aqui esta solo lo PROPIO de la verificacion: el TTL, el
 * efecto (marcar `emailVerified`) y el correo.
 *
 * SIN ENUMERACION / TIMING y el anti-prefetch (GET -> pagina -> POST del boton) se aplican en el
 * ENDPOINT/pagina, no aqui. Nunca se loguea el token.
 */
import "server-only";

import { EMAIL_VERIFICATION_TTL_MS } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  consumeEmailToken,
  createEmailToken,
  hashToken,
  type CreatedToken,
} from "@/server/auth/email-token";
import type { EmailMessage } from "@/server/email/adapter";
import { enqueueEmail } from "@/server/email/send";

export type CreatedVerification = CreatedToken;

/** Crea (renovando) el token de verificacion de una direccion. Devuelve el token en claro para el
 *  enlace del correo. */
export function createEmailVerification(
  db: PrismaClient,
  input: { email: string; now?: Date },
): Promise<CreatedVerification> {
  return createEmailToken(db, {
    identifier: input.email,
    purpose: "EMAIL_VERIFY",
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
    now: input.now,
  });
}

export type ConfirmResult =
  { verified: true; email: string } | { verified: false; reason: "INVALID" | "EXPIRED" };

/** Confirma el token de verificacion (POST del boton de la pagina `/verify`). Un solo uso; al
 *  acertar marca la cuenta de esa direccion como verificada. */
export async function confirmEmailVerification(
  db: PrismaClient,
  input: { rawToken: string; now?: Date },
): Promise<ConfirmResult> {
  const now = input.now ?? new Date();
  const r = await consumeEmailToken(db, {
    rawToken: input.rawToken,
    purpose: "EMAIL_VERIFY",
    now,
  });
  if (!r.ok) return { verified: false, reason: r.reason };

  // Marcar verificada la cuenta de esa direccion (email es unico).
  await db.user.updateMany({ where: { email: r.identifier }, data: { emailVerified: now } });
  return { verified: true, email: r.identifier };
}

/** Construye el correo de verificacion. El enlace se arma desde `appUrl` (env.APP_URL), nunca
 *  fijo, y lleva a la pagina de confirmacion (no verifica en el GET). */
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
  // Idempotencia determinista atada al token: un doble encolado del MISMO correo no crea dos jobs.
  // Un reenvio genera un token nuevo -> clave nueva -> job nuevo (correcto: SI reenvia).
  const idempotencyKey = `email:verify:${hashToken(rawToken)}`;
  await enqueueEmail(db, message, { runAt: input.now, idempotencyKey });
}
