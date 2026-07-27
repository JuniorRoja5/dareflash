/**
 * Proteccion CSRF para ACCIONES CON EFECTOS de una sesion autenticada (cambio de
 * contrasena y, mas adelante, retiradas, pagos, voto, activar boost). Patron
 * double-submit con token FIRMADO por HMAC(AUTH_SECRET) y ATADO A LA SESION.
 *
 * Por que atado a la sesion: si el HMAC cubriera solo un valor cualquiera, el
 * atacante generaria un token valido desde SU cuenta y lo usaria contra la victima.
 * Atandolo al identificador de sesion, un token solo vale para la sesion que lo
 * emitio; el del atacante no cuadra con la sesion de la victima.
 *
 * La cookie de sesion es `sameSite=lax` (ya frena la mayoria de CSRF); esto es
 * defensa en profundidad para lo que mueve dinero.
 *
 * Funciones PURAS (reciben el secreto y el id de sesion) -> testeables. El endpoint
 * pasa `env.AUTH_SECRET` (obligatoria) y el hash del token de sesion actual.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { deriveKey } from "./keys";

function sign(secret: string, sessionId: string, nonce: string): string {
  // Subclave de dominio "csrf.v1": no se usa AUTH_SECRET cruda (separacion de dominios).
  return createHmac("sha256", deriveKey(secret, "csrf.v1"))
    .update(`${sessionId}:${nonce}`)
    .digest("base64url");
}

/** Emite un token CSRF atado a `sessionId`: `<nonce>.<hmac(sessionId, nonce)>`. */
export function issueCsrfToken(secret: string, sessionId: string): string {
  const nonce = randomBytes(16).toString("base64url");
  return `${nonce}.${sign(secret, sessionId, nonce)}`;
}

/** Verifica el token contra la sesion actual (`sessionId`), en tiempo constante. */
export function verifyCsrfToken(
  secret: string,
  sessionId: string,
  value: string | undefined | null,
): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const nonce = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(secret, sessionId, nonce);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
