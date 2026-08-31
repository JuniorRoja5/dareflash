import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * `cursor` = cursor OPACO devuelto por la página anterior (el servicio lo revalida; uno manipulado
 * se trata como "primera página", no como error). `limit` lo acota el servicio a su tope.
 */
const QuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** Valida el id del reto en la ruta: un id absurdo -> 404 sin tocar la BD. */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * GET /api/retos/[id]/participaciones — página SIGUIENTE de participaciones de un reto, con el póster
 * firmado. PÚBLICO (el detalle del reto lo es): un invitado puede paginar sin sesión. La PRIMERA página
 * la sirve el Server Component de `/retos/{code}-{slug}`; esto sirve de la segunda en adelante.
 *
 * GUARDARRAIL: el reto se resuelve por su `id` PERO exigiendo `status != DRAFT` — un borrador no ha
 * salido nunca a público y sus participaciones tampoco. Inexistente o DRAFT devuelven el MISMO 404 (no
 * se revela que el borrador existe), igual que hace `resolverRetoDetalle` en la página.
 *
 * Lo que se ve lo decide `listarParticipacionesVisibles` (Submission PUBLISHED + Video PUBLISHED): este
 * endpoint no relaja ese filtro, así que una participación retirada desaparece también de la paginación.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return apiError("NOT_FOUND", "Reto no disponible.", 404);

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return apiError("BAD_REQUEST", "Parámetros de página inválidos.", 400);

  const { prisma } = await depsRuta();
  const { listarParticipacionesVisibles } = await import("@/server/services/participaciones-lista");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  try {
    const reto = await prisma.challenge.findFirst({
      where: { id: params.data.id, status: { not: "DRAFT" } },
      select: { id: true },
    });
    if (!reto) return apiError("NOT_FOUND", "Reto no disponible.", 404);

    const { items, nextCursor } = await listarParticipacionesVisibles(prisma, reto.id, {
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit,
    });

    // El `bunnyVideoId` NO sale de aquí (es la referencia interna en Bunny): solo el póster firmado y
    // el `videoId` de BD, que es lo único que el reproductor necesita para pedir su URL al endpoint.
    return apiOk({
      items: items.map((p) => ({
        submissionId: p.submissionId,
        videoId: p.videoId,
        title: p.title,
        poster: firmarReproduccion(p.bunnyVideoId, p.thumbnailFileName).poster,
        username: p.username,
        displayName: p.displayName,
        votos: p.votos,
      })),
      nextCursor,
    });
  } catch (e) {
    console.error("[api/retos/participaciones] fallo paginando:", sanearError(e));
    return apiError("PARTICIPACIONES_FAILED", "No se pudieron cargar más participaciones.", 502);
  }
}
