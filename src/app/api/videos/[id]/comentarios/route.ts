import { NextResponse } from "next/server";
import { z } from "zod";

import { RATE_LIMITS } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { textosApi } from "@/server/http/textos-api";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta: un id absurdo -> 404 sin tocar la BD. */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/** El texto se valida de verdad en el servicio (`limpiarComentario`); aquí solo se acota lo que entra. */
const CuerpoSchema = z.object({ texto: z.string().max(2000) });

const QuerySchema = z.object({ cursor: z.string().min(1).max(128).optional() });

/**
 * GET /api/videos/[id]/comentarios?cursor= — los comentarios de un vídeo, más nuevos primero (keyset).
 * PÚBLICO, como el feed: un invitado los lee. Con sesión, cada comentario dice si es tuyo (para
 * ofrecerte borrarlo), así que la respuesta es personal: `no-store`. Un vídeo que no se ve da el mismo
 * 404 que uno que no existe.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await textosApi(req);
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return apiError("NOT_FOUND", t("videoNoDisponible"), 404);
  const url = new URL(req.url);
  const q = QuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined });
  if (!q.success) return apiError("BAD_REQUEST", t("parametrosInvalidos"), 400);

  const { prisma } = await import("@/server/db/client");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { listarComentarios } = await import("@/server/services/comentarios");

  const usuario = await getCurrentUser();
  const pagina = await listarComentarios(prisma, params.data.id, {
    cursor: q.data.cursor ?? null,
    userId: usuario?.userId ?? null,
  });
  if (!pagina) return apiError("NOT_FOUND", t("videoNoDisponible"), 404);

  const res = NextResponse.json(pagina);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * POST /api/videos/[id]/comentarios — PUBLICAR un comentario. `mutatingRoute` (Origin/sesión/CSRF) y
 * tope por usuario (el cubo de comentar, compartido con borrar). La fila, el contador y el aviso al
 * dueño van en UNA transacción (`publicarComentario`). El autor sale de la SESIÓN, nunca del cuerpo.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { user, env, prisma }, { params }) => {
    const t = await textosApi(req);
    const { rateLimit } = await import("@/server/security/rate-limit");
    const { publicarComentario } = await import("@/server/services/comentarios");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", t("videoNoDisponible"), 404);

    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success) return apiError("VALIDATION", t("escribeElComentario"), 400);

    const rl = await rateLimit(prisma, {
      key: `comentario:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
      ...RATE_LIMITS.COMENTAR_PER_USER,
    });
    if (!rl.allowed) {
      return apiError("RATE_LIMITED", t("estasComentandoMuy"), 429);
    }

    const r = await publicarComentario(prisma, {
      userId: user.userId,
      videoId: parsed.data.id,
      texto: cuerpo.data.texto,
    });
    if (r.estado === "rechazado") {
      return r.motivo === "NO_DISPONIBLE"
        ? apiError("NOT_FOUND", t("videoNoDisponible"), 404)
        : apiError("TEXTO_INVALIDO", t("elComentarioNo"), 400);
    }
    return apiOk({ comentario: r.comentario, comentarios: r.comentarios }, 201);
  },
);
