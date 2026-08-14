import { z } from "zod";

import { apiError, apiOk, clientIpKey, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * Solicitud de RESTABLECER contrasena ("olvide mi contrasena"). Respuesta SIEMPRE UNIFORME (mismo
 * status y cuerpo exista o no la cuenta): NO revela si una direccion tiene cuenta (sin enumeracion).
 *
 * SIN ENUMERACION por TIEMPO: la respuesta uniforme se devuelve YA; el trabajo dependiente de
 * existencia (mirar si existe + crear token + encolar el correo) corre en SEGUNDO PLANO
 * (fire-and-forget), asi su rama no gobierna el tiempo de respuesta. MISMO patron que
 * `resend-verification` (no un apano distinto). Los rate-limit SI se esperan: acotan el envio y
 * deben aplicarse antes de responder; se evaluan ANTES del findUnique, asi que un 429 es identico
 * para una direccion real y una inventada (no filtra nada).
 *
 * Sin sesion a la que atar un token CSRF (el usuario llega deslogueado, ha olvidado su contrasena):
 * en la lista EXEMPT de `tests/route-csrf.test.ts`, como login/register/resend-verification. La
 * proteccion es exigir `application/json` (una peticion cross-site no puede enviarlo sin preflight)
 * + los rate-limit por IP y por direccion. Misma postura que resend-verification: NO se añade un
 * origin-check propio (no lo hacen ni register ni resend), no se inventa uno aqui.
 */
export async function POST(req: Request) {
  const { env } = await import("@/config/env");
  const { RATE_LIMITS } = await import("@/config/constants");
  const { prisma } = await import("@/server/db/client");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { requestPasswordReset } = await import("@/server/auth/password-reset");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Datos invalidos.", 400);
  const email = parsed.data.email;

  // Rate limit POR IP y POR direccion (evita usar el reset como herramienta de acoso de buzon o para
  // quemar la cuota SMTP contra la direccion de otra persona). Se evaluan ANTES de mirar existencia.
  const perIp = await rateLimit(prisma, {
    key: `forgot:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.FORGOT_PASSWORD_PER_IP,
  });
  const perEmail = await rateLimit(prisma, {
    key: `forgot:email:${rateLimitKey(env.AUTH_SECRET, email)}`,
    ...RATE_LIMITS.FORGOT_PASSWORD_PER_EMAIL,
  });
  if (!perIp.allowed || !perEmail.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
  }

  // Trabajo dependiente de existencia en segundo plano (ver cabecera: sin oraculo de tiempo). Solo
  // se envia a cuentas EXISTENTES que no esten borradas ni baneadas (a esas no sirve el reset).
  void (async () => {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { deletedAt: true, bannedAt: true },
    });
    if (user && user.deletedAt === null && user.bannedAt === null) {
      await requestPasswordReset(prisma, { email, appUrl: env.APP_URL });
    }
  })().catch((e: unknown) => {
    // NO tragar: si el encolado falla, no se crea el Job -> no hay FAILED -> no salta el aviso al
    // admin. Se registra SANEADO (sin direcciones ni tokens).
    console.error(`[api] forgot-password: fallo al encolar el reset: ${sanearError(e)}`);
  });

  return apiOk({
    ok: true,
    message: "Si esa cuenta existe, te hemos enviado un enlace para restablecer la contrasena.",
  });
}
