import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** `cursor` opaco de la página anterior (uno manipulado = primera página, no un error). */
const QuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** El username de la URL, validado. Un valor absurdo -> 404 sin tocar la BD. */
const ParamsSchema = z.object({ username: z.string().min(1).max(64) });

/**
 * GET /api/perfiles/[username]/videos — página SIGUIENTE de la rejilla PÚBLICA de alguien.
 *
 * PÚBLICO, como el perfil: un invitado pagina sin sesión. Y SOLO PUBLICADOS — los vídeos en proceso
 * o fallidos de esa persona no salen de aquí jamás; para eso está `/api/perfil/videos`, que resuelve
 * el usuario por la cookie y no por la URL.
 *
 * Igual que `/u/[username]`: una cuenta inexistente, borrada o baneada da 404, y da el MISMO 404 en
 * los tres casos (no se revela cuál de ellos es).
 */
export async function GET(req: Request, ctx: { params: Promise<{ username: string }> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return apiError("NOT_FOUND", "Perfil no disponible.", 404);

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return apiError("BAD_REQUEST", "Parámetros de página inválidos.", 400);

  const { prisma } = await depsRuta();
  const { videosPublicosDe } = await import("@/server/services/perfil");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  try {
    // LA MISMA PUERTA QUE EL PERFIL: ni borrada ni baneada. Sin esto, la rejilla de una cuenta
    // suspendida se seguiría pudiendo paginar aunque su perfil diera 404.
    const duenyo = await prisma.user.findFirst({
      where: { username: params.data.username, deletedAt: null, bannedAt: null },
      select: { id: true },
    });
    if (!duenyo) return apiError("NOT_FOUND", "Perfil no disponible.", 404);

    const { items, nextCursor } = await videosPublicosDe(prisma, duenyo.id, {
      cursor: parsed.data.cursor ?? null,
      limite: parsed.data.limit,
    });

    // SIN `estado`: la celda del perfil público no lo lleva (ver `VideoCelda`), y añadirlo aquí
    // sería la puerta de atrás por la que se enteraría de que a alguien le falló una subida.
    return apiOk({
      items: items.map((v) => ({
        id: v.id,
        title: v.title,
        poster: firmarReproduccion(v.bunnyVideoId, v.thumbnailFileName).poster,
        categoria: v.categoria,
      })),
      nextCursor,
    });
  } catch (e) {
    console.error("[api/perfiles/videos] fallo paginando:", sanearError(e));
    return apiError("VIDEOS_FAILED", "No se pudieron cargar más vídeos.", 502);
  }
}
