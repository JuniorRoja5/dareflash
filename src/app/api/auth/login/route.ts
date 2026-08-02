import { z } from "zod";

import { apiError, apiOk, clientIpKey, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { env } = await import("@/config/env");
  const { RATE_LIMITS } = await import("@/config/constants");
  const { prisma } = await import("@/server/db/client");
  const { rateLimit, resetRateLimit } = await import("@/server/security/rate-limit");
  const { login } = await import("@/server/auth/login");
  const { setSessionCookie } = await import("@/server/auth/current-user");
  const { esArgon2Sobrecargado, ejecutarConHueco } = await import("@/server/auth/password");

  const schema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: z.string().min(1).max(200), // .max evita CPU (Argon2 pre-hashea lineal al tamano)
  });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Datos invalidos.", 400);
  const { email, password } = parsed.data;

  const acctKey = `login:acct:${rateLimitKey(env.AUTH_SECRET, email)}`;

  // Cubo POR IP: se consume ANTES del hueco (guardian de CPU) y se gasta INCLUSO si luego hay 503.
  // Esta BIEN y es DELIBERADO: la peticion costo algo y, sobre todo, el cubo por IP NO permite
  // bloquear una CUENTA concreta de nadie (por eso aqui SI puede gastarse en un 503). El cubo por
  // CUENTA es el que no debe gastarse en un 503 (ver mas abajo). NO muevas el de IP dentro del
  // hueco "por simetria": la asimetria es a proposito.
  const perIp = await rateLimit(prisma, {
    key: `login:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.LOGIN_PER_IP,
  });
  if (!perIp.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
  }

  // Cubo POR CUENTA + verificacion, en un MISMO hueco del semaforo (Opcion A del hallazgo 2). Si
  // el semaforo esta saturado, el 503 salta ANTES de consumir el cubo de cuenta, asi que un
  // legitimo bajo saturacion NO se come un intento de SU cuenta (que un tercero podria usar para
  // bloquearla). El intento se cuenta DONDE se evalua; no hay refund que mantener.
  try {
    const outcome = await ejecutarConHueco(async () => {
      const perAccount = await rateLimit(prisma, {
        key: acctKey,
        ...RATE_LIMITS.LOGIN_PER_ACCOUNT,
      });
      if (!perAccount.allowed) return { tipo: "BLOQUEADA" as const };
      return { tipo: "RESULTADO" as const, result: await login(prisma, { email, password }) };
    });

    if (outcome.tipo === "BLOQUEADA") {
      return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
    }
    const result = outcome.result;
    if (!result.ok) {
      if (result.reason === "EMAIL_NOT_VERIFIED") {
        return apiError("EMAIL_NOT_VERIFIED", "Verifica tu email antes de iniciar sesion.", 403);
      }
      return apiError("INVALID_CREDENTIALS", "Credenciales invalidas.", 401);
    }

    // Acierto: resetea el cubo de ESA cuenta (un usuario legitimo no acumula).
    await resetRateLimit(prisma, acctKey);
    // La cookie SOLO se fija ahora, tras verificar la contrasena.
    await setSessionCookie(result.session.rawToken, result.session.expires);
    return apiOk({ ok: true });
  } catch (e) {
    if (esArgon2Sobrecargado(e)) {
      return apiError("OVERLOADED", "Servicio ocupado, reintenta en unos segundos.", 503);
    }
    throw e;
  }
}
