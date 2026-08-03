/**
 * Token de correo de UN SOLO USO, generico por PROPOSITO. Es el mecanismo comun de la
 * verificacion de alta (EMAIL_VERIFY) y del desbloqueo de cuenta (LOGIN_UNLOCK): NO se duplica,
 * se reutiliza con un `purpose` distinto.
 *
 * Garantias (heredadas por todos los propositos):
 *  - Aleatoriedad CRIPTOGRAFICA (256 bits). En la BD solo vive el HASH (SHA-256): si se filtra la
 *    tabla, los tokens no sirven. Hash rapido basta (alta entropia; no hay fuerza bruta).
 *  - Un solo uso: al consumir se BORRA, exista o no el destinatario.
 *  - Caducidad (`ttlMs` por proposito).
 *  - Un token ACTIVO por (identifier, purpose): crear renueva y borra los previos de ESE proposito
 *    (no toca los de otro proposito de la misma direccion).
 *  - El PROPOSITO se comprueba DENTRO del WHERE al consumir: un token de EMAIL_VERIFY no puede
 *    consumirse como LOGIN_UNLOCK ni al reves. Imposible por construccion, no una regla aparte que
 *    alguien pueda saltarse.
 *
 * La respuesta uniforme / sin enumeracion / sin oraculo de tiempo se aplica en el ENDPOINT que lo
 * usa, no aqui. Nunca se loguea el token.
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { VerificationPurpose } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";

/** Hash con el que el token vive en la BD (SHA-256 hex). Tambien vale como clave de idempotencia. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface CreatedToken {
  rawToken: string; // EN CLARO, solo para el enlace del correo. En BD va el hash.
  expires: Date;
}

/**
 * Crea (renovando) un token de un solo uso para (identifier, purpose). Devuelve el token en claro
 * para el enlace. Borra los previos del MISMO proposito para esa direccion (uno activo por
 * proposito); no toca los de otro proposito.
 */
export async function createEmailToken(
  db: PrismaClient,
  input: { identifier: string; purpose: VerificationPurpose; ttlMs: number; now?: Date },
): Promise<CreatedToken> {
  const now = input.now ?? new Date();
  const rawToken = randomBytes(32).toString("base64url"); // 256 bits
  const expires = new Date(now.getTime() + input.ttlMs);

  await db.verificationToken.deleteMany({
    where: { identifier: input.identifier, purpose: input.purpose },
  });
  await db.verificationToken.create({
    data: {
      identifier: input.identifier,
      token: hashToken(rawToken),
      expires,
      purpose: input.purpose,
    },
  });

  return { rawToken, expires };
}

export type ConsumeResult =
  { ok: true; identifier: string } | { ok: false; reason: "INVALID" | "EXPIRED" };

/**
 * Consume (un solo uso) un token del proposito dado. El `purpose` va DENTRO del WHERE, asi que un
 * token de OTRO proposito simplemente NO casa (devuelve INVALID). Borra el token pase lo que pase
 * (aunque este caducado). Devuelve el `identifier` para que el llamador actue (marcar verificado,
 * desbloquear el cubo, ...).
 */
export async function consumeEmailToken(
  db: PrismaClient,
  input: { rawToken: string; purpose: VerificationPurpose; now?: Date },
): Promise<ConsumeResult> {
  const now = input.now ?? new Date();
  const tokenHash = hashToken(input.rawToken);

  const row = await db.verificationToken.findFirst({
    where: { token: tokenHash, purpose: input.purpose }, // PROPOSITO dentro del WHERE
  });
  if (!row) return { ok: false, reason: "INVALID" };

  // Un solo uso: consumir pase lo que pase.
  await db.verificationToken.deleteMany({ where: { token: tokenHash } });

  if (row.expires.getTime() < now.getTime()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, identifier: row.identifier };
}
