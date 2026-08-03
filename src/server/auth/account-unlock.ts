/**
 * DESBLOQUEO de cuenta por correo (Opcion 3 del hallazgo 1). Cuando el cubo de cuenta frena un
 * login, se envia al DUEÑO un enlace de un solo uso que resetea SOLO ese cubo. El atacante no tiene
 * el buzon de la victima, asi que no puede usar la salida; y el ataque se convierte en un aviso.
 *
 * El token reutiliza el mecanismo generico (`email-token`, purpose LOGIN_UNLOCK). El RESET del cubo
 * (login:acct, nunca login:ip) lo hace el endpoint `/api/auth/unlock` al consumir el token.
 */
import "server-only";

import { LOGIN_UNLOCK_TTL_MS, RATE_LIMITS } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { createEmailToken, hashToken } from "@/server/auth/email-token";
import type { EmailMessage } from "@/server/email/adapter";
import { enqueueEmail } from "@/server/email/send";
import { rateLimit } from "@/server/security/rate-limit";

/*
 * LIMITACION CONOCIDA (anotada a proposito, NO se arregla ahora):
 * El enlace de desbloqueo caduca en 2 h (LOGIN_UNLOCK_TTL_MS) y la cadencia es 1 correo/hora. Eso
 * garantiza que SIEMPRE haya un enlace valido esperando... SOLO hasta que el usuario lo USA: el
 * token es de UN SOLO USO. Escenario: el dueño se desbloquea a las 10:05 (gasta el enlace), el
 * atacante re-bloquea a las 10:20, y no hay correo nuevo hasta las 11:00 -> ~40 min fuera. Lo
 * salva que al entrar a las 10:05 obtiene una sesion de 30 dias y no necesita volver a iniciarla;
 * la ventana mala es estrecha y rara.
 * La solucion seria que el token de desbloqueo valga VARIAS veces durante sus 2 h (solo libera un
 * freno, no da acceso: no cuesta seguridad), pero obliga a romper el "un solo uso" del servicio
 * generico de tokens. NO se hace ahora; si se retoma, hay que separar ese caso del generico.
 */

/**
 * Construye el correo de desbloqueo. Es una NOTIFICACION DE SEGURIDAD: texto llano y SIN NINGUN
 * detalle del intento (ni IP, ni numero de intentos, ni hora exacta, ni ubicacion). Al dueño no le
 * sirven y le asustan; y a un atacante que provoque el correo hacia si mismo le confirmarian
 * informacion. Solo: demasiados intentos, cuenta frenada, enlace para reactivar, y "si no fuiste
 * tu, cambia la contrasena".
 */
export function buildUnlockEmail(appUrl: string, email: string, rawToken: string): EmailMessage {
  const url = new URL("/unlock", appUrl);
  url.searchParams.set("token", rawToken);
  const link = url.toString();
  return {
    to: email,
    subject: "Tu cuenta de DareFlash se ha bloqueado temporalmente",
    text: [
      "Ha habido demasiados intentos de inicio de sesion en tu cuenta, asi que la hemos frenado",
      "temporalmente por seguridad.",
      "",
      "Para reactivarla, abre este enlace y pulsa el boton:",
      link,
      "",
      "El enlace caduca en 2 horas.",
      "",
      "Si no has sido tu, alguien podria estar intentando entrar: cambia tu contrasena por",
      "precaucion. Sin este enlace, tu cuenta sigue protegida; no necesitas hacer nada mas.",
    ].join("\n"),
  };
}

/**
 * Considera enviar el correo de desbloqueo cuando una cuenta queda frenada. UN correo por VENTANA
 * de bloqueo por cuenta (cubo `unlock:acct` 1/hora) + tope por IP (anti-spray hacia muchas cuentas).
 * Los cubos se consumen SIEMPRE (exista o no la cuenta): uniformidad. El correo solo se manda si la
 * cuenta EXISTE, pero la respuesta al atacante ya fue el 429 uniforme — esto corre APARTE.
 *
 * IMPORTANTE: se llama FUERA del hueco del semaforo y SIN await (best-effort). Meter estas
 * escrituras en el camino de rechazo del login (dentro del hueco) llenaria los 4 huecos de
 * peticiones RECHAZADAS escribiendo en BD bajo ataque y romperia la garantia de 2a (el rechazo
 * suelta el hueco 50-100x mas rapido PORQUE no escribe).
 *
 * NOTA (anotada a proposito, no es un fallo): un usuario SIN VERIFICAR tambien puede quedar frenado
 * (el rate-limit dispara antes que la comprobacion de verificacion en login) y recibira este correo
 * aunque, desbloqueado o no, no podria entrar hasta verificar. Es raro e inofensivo.
 */
export async function requestAccountUnlockEmail(
  db: PrismaClient,
  input: { email: string; appUrl: string; unlockAcctKey: string; unlockIpKey: string; now?: Date },
): Promise<void> {
  const perIp = await rateLimit(db, { key: input.unlockIpKey, ...RATE_LIMITS.UNLOCK_EMAIL_PER_IP });
  const perAcct = await rateLimit(db, {
    key: input.unlockAcctKey,
    ...RATE_LIMITS.UNLOCK_EMAIL_PER_ACCOUNT,
  });
  if (!perIp.allowed || !perAcct.allowed) return; // ya se mando uno esta ventana / anti-spray

  const user = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!user) return; // no existe -> no se manda (sin enumeracion; la respuesta ya fue 429 uniforme)

  const { rawToken } = await createEmailToken(db, {
    identifier: input.email,
    purpose: "LOGIN_UNLOCK",
    ttlMs: LOGIN_UNLOCK_TTL_MS,
    now: input.now,
  });
  const message = buildUnlockEmail(input.appUrl, input.email, rawToken);
  const idempotencyKey = `email:unlock:${hashToken(rawToken)}`;
  await enqueueEmail(db, message, { runAt: input.now, idempotencyKey });
}
