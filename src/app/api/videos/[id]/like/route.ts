import { z } from "zod";

import { MSG_LIKE_NO_DISPONIBLE, MSG_LIKE_PROPIO, RATE_LIMITS } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import type { ResultadoLike } from "@/server/services/likes";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta: un id absurdo -> 404 sin tocar la BD. */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST pone el like, DELETE lo quita. DOS VERBOS Y NO UN "toggle", aunque desde fuera se sienta
 * como un interruptor: un toggle es ambiguo bajo reintento —si la respuesta se pierde y el cliente
 * repite, el toggle deja el estado al revés—, mientras que poner y quitar son idempotentes cada
 * uno por su lado. El botón decide cuál llamar; la API no adivina.
 */
function respuesta(r: ResultadoLike) {
  if (r.estado !== "rechazado") return apiOk({ ...r });
  return r.motivo === "PROPIO"
    ? apiError("LIKE_PROPIO", MSG_LIKE_PROPIO, 409)
    : apiError("NOT_FOUND", MSG_LIKE_NO_DISPONIBLE, 404);
}

/**
 * Cubo por USUARIO, COMPARTIDO por poner y quitar: son la misma acción vista desde fuera, y con un
 * cubo por verbo el límite real sería el doble del que dice la config.
 */
async function limitar(prisma: PrismaClient, secret: string, userId: string) {
  const { rateLimit } = await import("@/server/security/rate-limit");
  const rl = await rateLimit(prisma, {
    key: `like:user:${rateLimitKey(secret, userId)}`,
    ...RATE_LIMITS.LIKE_PER_USER,
  });
  return rl.allowed
    ? null
    : apiError("RATE_LIMITED", "Demasiadas peticiones. Inténtalo en un momento.", 429);
}

export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user, env, prisma }, { params }) => {
    const { darLike } = await import("@/server/services/likes");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_LIKE_NO_DISPONIBLE, 404);

    const limitado = await limitar(prisma, env.AUTH_SECRET, user.userId);
    if (limitado) return limitado;

    return respuesta(await darLike(prisma, { userId: user.userId, videoId: parsed.data.id }));
  },
);

export const DELETE = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user, env, prisma }, { params }) => {
    const { quitarLike } = await import("@/server/services/likes");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_LIKE_NO_DISPONIBLE, 404);

    const limitado = await limitar(prisma, env.AUTH_SECRET, user.userId);
    if (limitado) return limitado;

    return respuesta(await quitarLike(prisma, { userId: user.userId, videoId: parsed.data.id }));
  },
);
