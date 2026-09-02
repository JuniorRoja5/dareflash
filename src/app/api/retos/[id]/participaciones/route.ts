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
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { listarParticipacionesVisibles } = await import("@/server/services/participaciones-lista");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");
  const { nombreCategoria } = await import("@/lib/categorias");
  const { postDeParticipacion } = await import("@/lib/post-de-participacion");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  try {
    const reto = await prisma.challenge.findFirst({
      where: { id: params.data.id, status: { not: "DRAFT" } },
      select: { id: true, title: true, category: true },
    });
    if (!reto) return apiError("NOT_FOUND", "Reto no disponible.", 404);

    // Sigue siendo PÚBLICO: sin sesión esto es `null`, `miVoto` sale `null` y no se consulta el voto.
    // Con sesión, las páginas SIGUIENTES traen el voto propio igual que la primera — si no, el botón
    // de una participación paginada nacería como "no has votado" aunque sí lo hubieras hecho.
    const usuario = await getCurrentUser();
    const { items, nextCursor } = await listarParticipacionesVisibles(prisma, reto.id, {
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit,
      userId: usuario?.userId ?? null,
    });

    const contexto = { titulo: reto.title, categoria: nombreCategoria(reto.category) };

    // El `bunnyVideoId` NO sale de aquí (es la referencia interna en Bunny): solo las URLs FIRMADAS y
    // el `videoId` de BD. Cada ítem viaja en DOS formas a la vez porque esta página alimenta a dos
    // consumidores: la rejilla (que quiere `title` y `poster`) y el feed del reto (que quiere la forma
    // `PostFeed` completa). Se construyen con el MISMO mapeador compartido, así que no pueden divergir.
    return apiOk({
      items: items.map((p) => {
        const urls = firmarReproduccion(p.bunnyVideoId, p.thumbnailFileName);
        return {
          submissionId: p.submissionId,
          videoId: p.videoId,
          title: p.title,
          poster: urls.poster,
          username: p.username,
          displayName: p.displayName,
          votos: p.votos,
          retoId: p.retoId,
          retoAbierto: p.retoAbierto,
          miVoto: p.miVoto,
          post: postDeParticipacion(p, contexto, urls),
        };
      }),
      nextCursor,
    });
  } catch (e) {
    console.error("[api/retos/participaciones] fallo paginando:", sanearError(e));
    return apiError("PARTICIPACIONES_FAILED", "No se pudieron cargar más participaciones.", 502);
  }
}
