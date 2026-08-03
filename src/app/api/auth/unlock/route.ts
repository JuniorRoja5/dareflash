import { z } from "zod";

import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * Confirma el DESBLOQUEO de cuenta. Es el POST del BOTON de la pagina `/unlock` (no un GET): asi los
 * escaneres de correo, que hacen prefetch del enlace, no consumen el token de un solo uso antes de
 * que el usuario haga clic (mismo patron que `/verify`).
 *
 * SIN rate-limit A PROPOSITO (dicho, no omitido en silencio): el token es de 256 bits, la fuerza
 * bruta no es viable (mismo argumento que `/verify`); y solo libera un freno, no da acceso.
 *
 * NO lleva sesion (el dueño llega bloqueado, desde el correo), asi que esta en la lista EXEMPT de
 * `tests/route-csrf.test.ts` con su justificacion. La proteccion CSRF que le aplica es que exige
 * `application/json` (una peticion cross-site no puede enviarlo sin preflight).
 */
export async function POST(req: Request) {
  const { env } = await import("@/config/env");
  const { prisma } = await import("@/server/db/client");
  const { resetRateLimit } = await import("@/server/security/rate-limit");
  const { consumeEmailToken } = await import("@/server/auth/email-token");

  const schema = z.object({ token: z.string().min(1) });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Falta el token.", 400);

  const r = await consumeEmailToken(prisma, {
    rawToken: parsed.data.token,
    purpose: "LOGIN_UNLOCK",
  });
  if (!r.ok) {
    // Generico (invalido/caducado igual): sin oraculo. El caso NORMAL aqui es el enlace YA USADO
    // (el dueño acaba de desbloquear y recarga); la pagina lo cubre con texto.
    return apiError("INVALID_TOKEN", "El enlace de desbloqueo es invalido o ha caducado.", 400);
  }

  // Libera SOLO el cubo de CUENTA de esa direccion. JAMAS el cubo por IP (login:ip): es el guardian
  // de CPU y no debe poder liberarse desde un correo. Si se pudiera, un atacante provocaria su
  // propio correo de desbloqueo y se saltaria el freno de CPU. (Ver account-unlock.ts / hallazgo 1.)
  const acctKey = `login:acct:${rateLimitKey(env.AUTH_SECRET, r.identifier)}`;
  await resetRateLimit(prisma, acctKey);
  return apiOk({
    ok: true,
    message: "Cuenta reactivada. Ya puedes intentar iniciar sesion de nuevo.",
  });
}
