import { z } from "zod";

import { apiError, apiOk, clientIpKey, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { env } = await import("@/config/env");
  const { RATE_LIMITS } = await import("@/config/constants");
  const { prisma } = await import("@/server/db/client");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { requestEmailVerification } = await import("@/server/services/email-verification");

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

  // Rate limit POR IP y POR direccion (evita usar el reenvio como herramienta de
  // acoso o para quemar la cuota SMTP contra la direccion de otra persona).
  const perIp = await rateLimit(prisma, {
    key: `resend:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.RESEND_VERIFICATION_PER_IP,
  });
  const perEmail = await rateLimit(prisma, {
    key: `resend:email:${rateLimitKey(env.AUTH_SECRET, email)}`,
    ...RATE_LIMITS.RESEND_VERIFICATION_PER_EMAIL,
  });
  if (!perIp.allowed || !perEmail.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
  }

  // SIN ENUMERACION: solo se reenvia si la cuenta existe y sigue sin verificar, pero
  // la respuesta es la misma en todos los casos.
  const user = await prisma.user.findUnique({ where: { email }, select: { emailVerified: true } });
  if (user && user.emailVerified === null) {
    await requestEmailVerification(prisma, { email, appUrl: env.APP_URL });
  }

  return apiOk({
    ok: true,
    message: "Si corresponde, te hemos reenviado el correo de verificacion.",
  });
}
