import { z } from "zod";

import { apiError, apiOk, clientIpKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** Anos cumplidos entre `birth` y `now`. */
function ageYears(birth: Date, now: Date): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export async function POST(req: Request) {
  const { env } = await import("@/config/env");
  const { MIN_AGE_YEARS, RATE_LIMITS } = await import("@/config/constants");
  const { prisma } = await import("@/server/db/client");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { registerUser } = await import("@/server/auth/registration");

  const rl = await rateLimit(prisma, {
    key: `register:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.REGISTER_PER_IP,
  });
  if (!rl.allowed) return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);

  const schema = z
    .object({
      email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
      password: z.string().min(8).max(200), // .max evita quemar CPU en el pre-hash de Argon2
      birthDate: z.coerce.date(),
    })
    .refine((d) => ageYears(d.birthDate, new Date()) >= MIN_AGE_YEARS, {
      message: `Debes tener al menos ${MIN_AGE_YEARS} anos.`,
      path: ["birthDate"],
    });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Datos de registro invalidos.", 400);

  await registerUser(prisma, {
    email: parsed.data.email,
    password: parsed.data.password,
    birthDate: parsed.data.birthDate,
    appUrl: env.APP_URL,
  });

  // Respuesta UNIFORME: no revela si la direccion ya tenia cuenta (sin enumeracion).
  return apiOk({
    ok: true,
    message: "Si el email es valido, te hemos enviado un correo de verificacion.",
  });
}
