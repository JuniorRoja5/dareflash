import { z } from "zod";

import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/perfil/email — el usuario pide cambiar su direccion de correo.
 *
 * EXIGE LA CONTRASENA ACTUAL, y no es burocracia: el correo es la identidad de acceso (con el se
 * entra y con el se recupera la cuenta). Sin esta comprobacion, quien robe una SESION mueve la cuenta
 * a su propia direccion y desde ahi se apodera de ella con un "he olvidado mi contrasena". Es el mismo
 * trato que el cambio de contrasena, y por la misma razon.
 *
 * NO aplica nada: guarda la direccion como PENDIENTE y manda el enlace de confirmacion. Hasta que no
 * se confirme desde la nueva, la cuenta sigue con la vieja. Ver `services/cambio-email`.
 *
 * DELETE — cancelar un cambio pendiente. No pide contrasena: cancelar solo puede DEVOLVER la cuenta a
 * su estado anterior, asi que no abre ninguna via.
 */
export const POST = mutatingRoute(async (req, { user, env, prisma }) => {
  const { RATE_LIMITS } = await import("@/config/constants");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { verifyPasswordConstantTime, esArgon2Sobrecargado, ejecutarConHueco } =
    await import("@/server/auth/password");
  const { solicitarCambioEmail } = await import("@/server/services/cambio-email");

  const schema = z.object({
    // El .max evita quemar CPU en el pre-hash de argon2; la politica de la contrasena no aplica aqui
    // (solo se VERIFICA la que ya existe).
    password: z.string().min(1).max(200),
    email: z.string().trim().toLowerCase().email().max(254),
  });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Revisa el correo y la contrasena.", 400);

  const rlKey = `cambiaremail:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`;

  try {
    // El cubo Y el argon2 en el MISMO hueco del semaforo, igual que el cambio de contrasena: un 503
    // por saturacion no puede gastar un intento.
    const outcome = await ejecutarConHueco(async () => {
      const rl = await rateLimit(prisma, { key: rlKey, ...RATE_LIMITS.CHANGE_PASSWORD_PER_USER });
      if (!rl.allowed) return { tipo: "BLOQUEADA" as const };
      const u = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { passwordHash: true },
      });
      const ok = await verifyPasswordConstantTime(u?.passwordHash ?? null, parsed.data.password);
      if (!ok) return { tipo: "MAL" as const };
      const r = await solicitarCambioEmail(prisma, {
        userId: user.userId,
        nuevoEmail: parsed.data.email,
        appUrl: env.APP_URL,
      });
      return { tipo: "HECHO" as const, r };
    });

    if (outcome.tipo === "BLOQUEADA") {
      return apiError("RATE_LIMITED", "Demasiados intentos. Intentalo mas tarde.", 429);
    }
    if (outcome.tipo === "MAL") {
      return apiError("PASSWORD_INCORRECTA", "La contrasena no es correcta.", 403);
    }
    if (!outcome.r.ok) {
      return outcome.r.motivo === "MISMA"
        ? apiError("MISMA_DIRECCION", "Esa ya es tu direccion de correo.", 409)
        : // NO se dice de quien es: seria enumerar usuarios.
          apiError("OCUPADA", "Esa direccion no esta disponible.", 409);
    }
    return apiOk({ ok: true });
  } catch (e) {
    if (esArgon2Sobrecargado(e)) {
      return apiError("SOBRECARGA", "Ahora mismo no podemos procesarlo. Reintenta.", 503);
    }
    throw e;
  }
});

export const DELETE = mutatingRoute(async (_req, { user, prisma }) => {
  const { cancelarCambioEmail } = await import("@/server/services/cambio-email");
  await cancelarCambioEmail(prisma, user.userId);
  return apiOk({ ok: true });
});
