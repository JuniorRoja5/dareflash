import { z } from "zod";

import { NOTIF_MARCAR_MAX, RATE_LIMITS } from "@/config/constants";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(NOTIF_MARCAR_MAX),
});

/**
 * POST /api/notificaciones/leidas — marca como leídos los avisos que el usuario acaba de VER (los que
 * enseña el desplegable al abrirse, o la página de avisos). Devuelve las no-leídas que quedan, para que
 * el badge se ponga al día sin otra petición.
 *
 * MUTADORA: pasa por `mutatingRoute` (Origin -> sesión -> CSRF). Marcar leído cambia estado, y nunca
 * va por GET.
 *
 * AUTORIZACIÓN POR CONSTRUCCIÓN: el servicio filtra por el `userId` de la sesión, así que un id ajeno
 * no casa, no se toca y ni siquiera se sabe si existe. Idempotente: marcar dos veces no cambia nada.
 */
export const POST = mutatingRoute(async (req, { user, env, prisma }) => {
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { contarNoLeidas, marcarLeidas } = await import("@/server/services/notificaciones");

  const rl = await rateLimit(prisma, {
    key: `notifleer:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
    ...RATE_LIMITS.NOTIF_LEER_PER_USER,
  });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Demasiadas peticiones. Inténtalo en un momento.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "No hemos podido leer la petición.", 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Datos inválidos.", 400);

  const marcadas = await marcarLeidas(prisma, user.userId, parsed.data.ids);
  return apiOk({ ok: true, marcadas, noLeidas: await contarNoLeidas(prisma, user.userId) });
});
