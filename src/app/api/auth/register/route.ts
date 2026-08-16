import { z } from "zod";

import { apiError, apiOk, clientIpKey, depsRuta, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** Anos cumplidos entre `birth` y `now`. */
function ageYears(birth: Date, now: Date): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export async function POST(req: Request) {
  const { env, prisma } = await depsRuta();
  const { MIN_AGE_YEARS, RATE_LIMITS } = await import("@/config/constants");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { registerUser } = await import("@/server/auth/registration");
  const { esArgon2Sobrecargado } = await import("@/server/auth/password");
  const { evaluarPassword } = await import("@/server/auth/password-policy");

  const rl = await rateLimit(prisma, {
    key: `register:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.REGISTER_PER_IP,
  });
  if (!rl.allowed) return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);

  const schema = z
    .object({
      email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
      // La longitud/fuerza REAL la valida `evaluarPassword` (abajo). Aquí solo el .max, que evita
      // quemar CPU en el pre-hash de Argon2 con una entrada enorme; .min(1) para no aceptar vacío.
      password: z.string().min(1).max(200),
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

  // Rate-limit POR DIRECCION (ademas del de IP de arriba). Sin esto, un atacante con muchas IPs
  // (botnet / IPv6 rotando) puede BOMBARDEAR el buzon de una victima con correos de verificacion. El
  // tope por email lo frena. Mensaje 429 UNIFORME (igual exista o no la cuenta): no abre enumeracion.
  const rlEmail = await rateLimit(prisma, {
    key: `register:email:${rateLimitKey(env.AUTH_SECRET, parsed.data.email)}`,
    ...RATE_LIMITS.REGISTER_PER_EMAIL,
  });
  if (!rlEmail.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
  }

  // POLITICA DE CONTRASENA FUERTE (server-side, misma regla que el reset): rechaza debiles/comunes/
  // predecibles, no solo por longitud. El email se pasa para vetar contrasenas ligadas a la identidad.
  const veredicto = evaluarPassword({
    password: parsed.data.password,
    email: parsed.data.email,
  });
  if (!veredicto.ok) return apiError("VALIDATION", veredicto.mensaje, 400);

  // El argon2 del registro (que se ejecuta SIEMPRE, anti-enumeracion) va por el semaforo: si
  // esta saturado, 503, no 500. La respuesta uniforme se mantiene para el resto de casos.
  try {
    await registerUser(prisma, {
      email: parsed.data.email,
      password: parsed.data.password,
      birthDate: parsed.data.birthDate,
      appUrl: env.APP_URL,
    });
  } catch (e) {
    if (esArgon2Sobrecargado(e)) {
      return apiError("OVERLOADED", "Servicio ocupado, reintenta en unos segundos.", 503);
    }
    throw e;
  }

  // Respuesta UNIFORME: no revela si la direccion ya tenia cuenta (sin enumeracion).
  return apiOk({
    ok: true,
    message: "Si el email es valido, te hemos enviado un correo de verificacion.",
  });
}
