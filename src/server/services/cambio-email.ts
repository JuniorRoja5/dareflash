/**
 * CAMBIO DE DIRECCIÓN DE CORREO — control de seguridad, no un campo más del perfil.
 *
 * ┌─ POR QUÉ NO ES UN `UPDATE` Y YA ───────────────────────────────────────────────────────────────┐
 * │ El correo ES la identidad de acceso: con él se inicia sesión y con él se recupera la contraseña.│
 * │ Cambiarlo sin más tendría dos agujeros:                                                        │
 * │  1. Quien robe una SESIÓN movería la cuenta a su propia dirección y, desde ahí, se apoderaría   │
 * │     de ella con un "he olvidado mi contraseña". Por eso el ENDPOINT exige la contraseña actual. │
 * │  2. Se podría fijar una dirección que no es tuya. Por eso la nueva se VERIFICA antes de         │
 * │     aplicarse: hasta que no se confirma, sigue mandando la vieja.                               │
 * │ Y se AVISA a la dirección ANTIGUA de que alguien pidió el cambio: si no fuiste tú, es tu única  │
 * │ oportunidad de enterarte mientras todavía controlas la cuenta.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * El MECANISMO del token (un solo uso, hash en BD, caducidad, propósito dentro del WHERE) se REUSA de
 * `auth/email-token`, igual que la verificación de alta: aquí solo vive lo propio del cambio.
 */
import "server-only";

import { EMAIL_VERIFICATION_TTL_MS } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { consumeEmailToken, createEmailToken, hashToken } from "@/server/auth/email-token";
import { revokeAllUserSessions } from "@/server/auth/session";
import type { EmailMessage } from "@/server/email/adapter";
import { renderCorreoHtml } from "@/server/email/plantilla";
import { enqueueEmail } from "@/server/email/send";

export type SolicitudCambio =
  | { ok: true }
  /** La dirección ya es la suya: no hay nada que cambiar. */
  | { ok: false; motivo: "MISMA" }
  /** La tiene otra cuenta. NO se dice de quién: sería enumerar usuarios. */
  | { ok: false; motivo: "OCUPADA" };

/** Correo a la dirección NUEVA: el enlace que confirma que es suya. */
function correoConfirmacion(appUrl: string, nuevoEmail: string, rawToken: string): EmailMessage {
  const url = new URL("/cambiar-email", appUrl);
  url.searchParams.set("token", rawToken);
  const link = url.toString();
  return {
    to: nuevoEmail,
    subject: "Confirma tu nueva direccion en DareFlash",
    text: [
      "Has pedido usar esta direccion en tu cuenta de DareFlash.",
      "",
      "Para confirmarla, abre este enlace y pulsa el boton:",
      link,
      "",
      "Si no has sido tu, ignora este correo: tu cuenta no cambiara. El enlace caduca en 24 horas.",
    ].join("\n"),
    html: renderCorreoHtml({
      preheader: "Confirma tu nueva direccion de correo en DareFlash.",
      titulo: "Confirma tu nueva direccion",
      intro:
        "Has pedido usar esta direccion en tu cuenta de DareFlash. Confirmala para que empiece a valer.",
      cta: { texto: "Confirmar mi direccion", href: link },
      notas: [
        "Si no has sido tu, ignora este correo: tu cuenta no cambiara.",
        "El enlace caduca en 24 horas.",
      ],
    }),
  };
}

/**
 * Aviso a la dirección ANTIGUA. Su enlace lleva a NUESTRA pantalla de contraseña, nunca a una acción
 * con token: si quien pidió el cambio es un atacante, un token aquí solo le daría otra superficie. Lo
 * que hace falta es que el dueño real pueda reaccionar —cambiar la contraseña— mientras todavía
 * controla la cuenta, y este es el único aviso que va a recibir.
 */
function correoAviso(appUrl: string, emailViejo: string, nuevoEmail: string): EmailMessage {
  const cambiarPass = new URL("/perfil/editar", appUrl).toString();
  const texto = `Se ha pedido cambiar el correo de tu cuenta de DareFlash a ${nuevoEmail}.`;
  return {
    to: emailViejo,
    subject: "Se ha pedido cambiar el correo de tu cuenta",
    text: [
      texto,
      "",
      "El cambio NO se aplica hasta que se confirme desde esa direccion.",
      "Si no has sido tu, cambia tu contrasena ahora mismo: alguien tiene acceso a tu cuenta.",
    ].join("\n"),
    html: renderCorreoHtml({
      preheader: "Se ha pedido cambiar el correo de tu cuenta.",
      titulo: "Se ha pedido cambiar tu correo",
      intro: texto,
      cta: { texto: "Cambiar mi contrasena", href: cambiarPass },
      notas: [
        "El cambio NO se aplica hasta que se confirme desde esa direccion.",
        "Si no has sido tu, cambia tu contrasena ahora mismo.",
      ],
    }),
  };
}

/**
 * Pide el cambio: guarda la dirección como PENDIENTE, manda el enlace de confirmación a la nueva y
 * avisa a la antigua. NO toca el correo de la cuenta — hasta confirmar, sigue mandando el viejo.
 *
 * La comprobación de la contraseña actual NO va aquí sino en el endpoint, que es quien tiene la
 * sesión y el rate-limit de argon2 (mismo trato que el cambio de contraseña).
 */
export async function solicitarCambioEmail(
  db: PrismaClient,
  input: { userId: string; nuevoEmail: string; appUrl: string; now?: Date },
): Promise<SolicitudCambio> {
  const nuevoEmail = input.nuevoEmail.trim();
  const usuario = await db.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });
  // La collation de la BD es `ci`, así que esta comparación ya ignora mayúsculas, igual que el UNIQUE.
  if (usuario?.email && usuario.email.toLowerCase() === nuevoEmail.toLowerCase()) {
    return { ok: false, motivo: "MISMA" };
  }
  const ocupada = await db.user.findUnique({ where: { email: nuevoEmail }, select: { id: true } });
  if (ocupada) return { ok: false, motivo: "OCUPADA" };

  await db.user.update({ where: { id: input.userId }, data: { emailPendiente: nuevoEmail } });

  const { rawToken } = await createEmailToken(db, {
    identifier: nuevoEmail,
    purpose: "EMAIL_CHANGE",
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
    now: input.now,
  });
  await enqueueEmail(db, correoConfirmacion(input.appUrl, nuevoEmail, rawToken), {
    runAt: input.now,
    idempotencyKey: `email:cambio:${hashToken(rawToken)}`,
  });
  if (usuario?.email) {
    await enqueueEmail(db, correoAviso(input.appUrl, usuario.email, nuevoEmail), {
      runAt: input.now,
      idempotencyKey: `email:cambio-aviso:${hashToken(rawToken)}`,
    });
  }
  return { ok: true };
}

export type ConfirmacionCambio =
  | { ok: true; email: string }
  | { ok: false; motivo: "INVALID" | "EXPIRED" | "OCUPADA" | "SIN_PENDIENTE" };

/**
 * Confirma el cambio (POST del botón de `/cambiar-email`). Un solo uso.
 *
 * Se vuelve a comprobar que la dirección siga LIBRE: entre pedir y confirmar pueden pasar 24 h, y en
 * ese hueco otra persona puede haberla registrado. Sin esta segunda comprobación el `UNIQUE` de la BD
 * reventaría con un error feo en vez de un mensaje que se entiende.
 *
 * Al aplicar se REVOCAN todas las sesiones: el correo es la identidad de acceso, así que cambiarlo
 * merece el mismo trato que cambiar la contraseña — si alguien había entrado, deja de estar dentro.
 */
export async function confirmarCambioEmail(
  db: PrismaClient,
  input: { rawToken: string; now?: Date },
): Promise<ConfirmacionCambio> {
  const now = input.now ?? new Date();
  const r = await consumeEmailToken(db, {
    rawToken: input.rawToken,
    purpose: "EMAIL_CHANGE",
    now,
  });
  if (!r.ok) return { ok: false, motivo: r.reason };

  const usuario = await db.user.findFirst({
    where: { emailPendiente: r.identifier },
    select: { id: true },
  });
  // Sin pendiente: el usuario canceló, o ya se aplicó. El token era válido pero no queda nada que hacer.
  if (!usuario) return { ok: false, motivo: "SIN_PENDIENTE" };

  const ocupada = await db.user.findUnique({
    where: { email: r.identifier },
    select: { id: true },
  });
  if (ocupada && ocupada.id !== usuario.id) return { ok: false, motivo: "OCUPADA" };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: usuario.id },
      // La dirección llega ya verificada: acaba de demostrar que la controla abriendo este enlace.
      data: { email: r.identifier, emailVerified: now, emailPendiente: null },
    });
    await revokeAllUserSessions(tx, usuario.id);
  });
  return { ok: true, email: r.identifier };
}

/** Cancela un cambio pendiente (el usuario se arrepiente, o vio el aviso y no fue él). */
export async function cancelarCambioEmail(db: PrismaClient, userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { emailPendiente: null } });
}
