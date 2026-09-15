import { z } from "zod";

import { MSG_NO_DISPONIBLE, RATE_LIMITS } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * DELETE /api/comentarios/[id] — BORRAR un comentario PROPIO (retirada suave: deja de verse y baja el
 * contador del vídeo; el aviso que emitió se queda). `mutatingRoute` + el mismo cubo que comentar.
 * Autorización por construcción en el servicio: uno ajeno responde el mismo 404 que uno inexistente.
 */
export const DELETE = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user, env, prisma }, { params }) => {
    const { rateLimit } = await import("@/server/security/rate-limit");
    const { retirarComentario } = await import("@/server/services/comentarios");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_NO_DISPONIBLE, 404);

    const rl = await rateLimit(prisma, {
      key: `comentario:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
      ...RATE_LIMITS.COMENTAR_PER_USER,
    });
    if (!rl.allowed) {
      return apiError("RATE_LIMITED", "Demasiadas peticiones. Espera un momento.", 429);
    }

    const r = await retirarComentario(prisma, { userId: user.userId, commentId: parsed.data.id });
    if (r.estado === "rechazado") return apiError("NOT_FOUND", MSG_NO_DISPONIBLE, 404);
    return apiOk({ comentarios: r.comentarios });
  },
);
