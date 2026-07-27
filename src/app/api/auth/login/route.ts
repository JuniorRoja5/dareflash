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

  const schema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
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

  // Rate-limit POR IP y POR CUENTA. Consumo ATOMICO en ambos (sin peek); la clave de
  // cuenta va HASHEADA (HMAC) como la de IP (privacidad + no reventar VARCHAR(191)).
  const acctKey = `login:acct:${rateLimitKey(env.AUTH_SECRET, email)}`;
  const perIp = await rateLimit(prisma, {
    key: `login:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.LOGIN_PER_IP,
  });
  const perAccount = await rateLimit(prisma, { key: acctKey, ...RATE_LIMITS.LOGIN_PER_ACCOUNT });
  if (!perIp.allowed || !perAccount.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
  }

  const result = await login(prisma, { email, password });
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
}
