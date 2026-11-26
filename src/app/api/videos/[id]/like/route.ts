import { z } from "zod";

import { RATE_LIMITS } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import type { ResultadoLike } from "@/server/services/likes";
import { textosApi, type TApi } from "@/server/http/textos-api";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta: un id absurdo -> 404 sin tocar la BD. */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST pone el like, DELETE lo quita. DOS VERBOS Y NO UN "toggle", aunque desde fuera se sienta
 * como un interruptor: un toggle es ambiguo bajo reintento —si la respuesta se pierde y el cliente
 * repite, el toggle deja el estado al revés—, mientras que poner y quitar son idempotentes cada
 * uno por su lado. El botón decide cuál llamar; la API no adivina.
 */
function respuesta(r: ResultadoLike, t: TApi) {
  if (r.estado !== "rechazado") return apiOk({ ...r });
  return r.motivo === "PROPIO"
    ? apiError("LIKE_PROPIO", t("likePropio"), 409)
    : apiError("NOT_FOUND", t("likeNoDisponible"), 404);
}

/**
 * Cubo por USUARIO, COMPARTIDO por poner y quitar: son la misma acción vista desde fuera, y con un
 * cubo por verbo el límite real sería el doble del que dice la config.
 */
async function limitar(prisma: PrismaClient, secret: string, userId: string, t: TApi) {
  const { rateLimit } = await import("@/server/security/rate-limit");
  const rl = await rateLimit(prisma, {
    key: `like:user:${rateLimitKey(secret, userId)}`,
    ...RATE_LIMITS.LIKE_PER_USER,
  });
  return rl.allowed ? null : apiError("RATE_LIMITED", t("demasiadasPeticionesIntentalo"), 429);
}

export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user, env, prisma }, { params }) => {
    const t = await textosApi(_req);
    const { darLike } = await import("@/server/services/likes");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", t("esteVideoYa"), 404);

    const limitado = await limitar(prisma, env.AUTH_SECRET, user.userId, t);
    if (limitado) return limitado;

    return respuesta(await darLike(prisma, { userId: user.userId, videoId: parsed.data.id }), t);
  },
);

export const DELETE = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user, env, prisma }, { params }) => {
    const t = await textosApi(_req);
    const { quitarLike } = await import("@/server/services/likes");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", t("esteVideoYa"), 404);

    const limitado = await limitar(prisma, env.AUTH_SECRET, user.userId, t);
    if (limitado) return limitado;

    return respuesta(await quitarLike(prisma, { userId: user.userId, videoId: parsed.data.id }), t);
  },
);
