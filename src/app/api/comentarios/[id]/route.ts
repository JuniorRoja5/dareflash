import { NextResponse } from "next/server";
import { z } from "zod";

import { MSG_NO_DISPONIBLE, RATE_LIMITS } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * GET /api/comentarios/[id] — UN comentario por su id, con el vídeo al que pertenece. PÚBLICO, como la
 * lista. Lo pide el panel cuando llega por el deep-link de un aviso y el comentario NO cae en la primera
 * página (un aviso viejo en un vídeo con muchos comentarios): así se ancla arriba en vez de perderse.
 * Retirado o de un vídeo que no se ve: el mismo 404 que uno que no existe. Personal (`esMio`): no-store.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) return apiError("NOT_FOUND", MSG_NO_DISPONIBLE, 404);

  const { prisma } = await import("@/server/db/client");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { comentarioSuelto } = await import("@/server/services/comentarios");

  const usuario = await getCurrentUser();
  const r = await comentarioSuelto(prisma, parsed.data.id, { userId: usuario?.userId ?? null });
  if (!r) return apiError("NOT_FOUND", MSG_NO_DISPONIBLE, 404);

  const res = NextResponse.json(r);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

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
