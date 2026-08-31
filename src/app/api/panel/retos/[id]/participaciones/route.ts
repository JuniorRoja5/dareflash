import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * GET /api/panel/retos/[id]/participaciones — página SIGUIENTE de participaciones de un reto PARA EL
 * PANEL: TODAS, en cualquier estado (visibles, en proceso, no publicadas y retiradas). La primera
 * página la sirve el Server Component de `/panel/retos/{id}`; esto sirve de la segunda en adelante.
 *
 * SE PROTEGE A SÍ MISMO con `requireRole("ADMIN")`. NO se fía del layout del panel: el layout protege
 * la VISTA, no los endpoints, y este devuelve datos que el público no ve (participaciones retiradas y
 * sin publicar). Un no-admin recibe 403 sin que se consulte nada.
 *
 * Es de LECTURA (GET), así que no pasa por `mutatingRoute` —no hay nada que proteger de CSRF: leer no
 * cambia estado— pero el guard de rol es igual de obligatorio que en los writes.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { requireRole } = await import("@/server/auth/rbac");
  try {
    await requireRole("ADMIN");
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para ver esto.", 403);
  }

  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return apiError("NOT_FOUND", "Reto no disponible.", 404);

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return apiError("BAD_REQUEST", "Parámetros de página inválidos.", 400);

  const { prisma } = await depsRuta();
  const { listarParticipacionesAdmin } = await import("@/server/services/participaciones-lista");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  try {
    const { items, nextCursor } = await listarParticipacionesAdmin(prisma, params.data.id, {
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit,
    });

    return apiOk({
      items: items.map((p) => ({
        submissionId: p.submissionId,
        videoId: p.videoId,
        title: p.title,
        // Póster SOLO si el vídeo es reproducible: firmar el de uno sin publicar daría una imagen rota
        // (el objeto puede no existir aún en Bunny). "" = la vista pinta un marcador, no un hueco roto.
        poster: p.reproducible
          ? firmarReproduccion(p.bunnyVideoId, p.thumbnailFileName).poster
          : "",
        username: p.username,
        displayName: p.displayName,
        votos: p.votos,
        estado: p.estado,
        creadaEnMs: p.creadaEn.getTime(),
        reproducible: p.reproducible,
      })),
      nextCursor,
    });
  } catch (e) {
    console.error("[api/panel/retos/participaciones] fallo paginando:", sanearError(e));
    return apiError("PARTICIPACIONES_FAILED", "No se pudieron cargar más participaciones.", 502);
  }
}
