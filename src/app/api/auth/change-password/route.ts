import { z } from "zod";

import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * Cambio de contrasena. Pasa por `mutatingRoute` (Origin + sesion + CSRF). Verifica la
 * contrasena ACTUAL, cambia la nueva, revoca TODAS las sesiones y crea una nueva para
 * este dispositivo (cookie nueva en la misma respuesta): las del atacante mueren, el
 * usuario legitimo sigue dentro.
 *
 * Rate-limit POR USUARIO (CHANGE_PASSWORD_PER_USER), consumido ATOMICamente ANTES del
 * argon2 de verificacion: acota el adivinado de la contrasena actual por quien roba una
 * sesion y la amplificacion de CPU (cada intento es un argon2). Se resetea al acertar,
 * asi un usuario legitimo no acumula.
 *
 * La sesion ROTA (sessionId nuevo), asi que el token CSRF que el cliente tenia en
 * memoria queda invalido: devolvemos uno nuevo atado a la sesion nueva en la respuesta.
 */
export const POST = mutatingRoute(async (req, { user }) => {
  const { env } = await import("@/config/env");
  const { RATE_LIMITS } = await import("@/config/constants");
  const { prisma } = await import("@/server/db/client");
  const { rateLimit, resetRateLimit } = await import("@/server/security/rate-limit");
  const { verifyPasswordConstantTime, esArgon2Sobrecargado, ejecutarConHueco } =
    await import("@/server/auth/password");
  const { changePassword } = await import("@/server/auth/account");
  const { setSessionCookie } = await import("@/server/auth/current-user");
  const { issueCsrfToken } = await import("@/server/auth/csrf");

  const schema = z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
  });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Datos invalidos.", 400);

  const rlKey = `changepw:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`;

  // Mismo trato que login (Opcion A, hallazgo 2): el cubo POR USUARIO + los dos argon2 (verificar
  // la actual + hashear la nueva) van en un MISMO hueco del semaforo, para que un 503 por
  // saturacion NO gaste un intento de cambio de contrasena. Menor severidad que en login (el cubo
  // es del usuario autenticado, nadie lo llena desde fuera); se hace por COHERENCIA de estructura.
  try {
    const outcome = await ejecutarConHueco(async () => {
      const rl = await rateLimit(prisma, { key: rlKey, ...RATE_LIMITS.CHANGE_PASSWORD_PER_USER });
      if (!rl.allowed) return { tipo: "BLOQUEADA" as const };
      const u = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { passwordHash: true },
      });
      const ok = await verifyPasswordConstantTime(
        u?.passwordHash ?? null,
        parsed.data.currentPassword,
      );
      if (!ok) return { tipo: "MAL" as const };
      const session = await changePassword(prisma, {
        userId: user.userId,
        newPassword: parsed.data.newPassword,
      });
      return { tipo: "OK" as const, session };
    });

    if (outcome.tipo === "BLOQUEADA") {
      return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
    }
    if (outcome.tipo === "MAL") {
      return apiError("INVALID_CREDENTIALS", "La contrasena actual no es correcta.", 403);
    }
    const { session } = outcome;
    // Acierto: el cubo de este usuario se vacia (no acumula tras un cambio legitimo).
    await resetRateLimit(prisma, rlKey);
    await setSessionCookie(session.rawToken, session.expires); // sesion nueva para este dispositivo
    // Token CSRF nuevo, atado a la sesion recien creada (la anterior ya no existe).
    const csrfToken = issueCsrfToken(env.AUTH_SECRET, session.sessionId);
    return apiOk({ ok: true, csrfToken });
  } catch (e) {
    if (esArgon2Sobrecargado(e)) {
      return apiError("OVERLOADED", "Servicio ocupado, reintenta en unos segundos.", 503);
    }
    throw e;
  }
});
