import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** `cursor` opaco de la página anterior (uno manipulado = primera página, no un error). */
const QuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * GET /api/perfil/videos — página SIGUIENTE de MI rejilla (la de `/perfil`).
 *
 * ┌─ POR QUÉ ES UNA RUTA APARTE DE LA PÚBLICA ──────────────────────────────────────────────────┐
 * │ Esta devuelve TAMBIÉN los vídeos en proceso y fallidos, que son del dueño y de nadie más. Un │
 * │ único endpoint con un `?usuario=` y una bandera "incluir no publicados" es exactamente como  │
 * │ se acaban sirviendo los vídeos fallidos de otra persona: basta un parámetro mal leído. Aquí  │
 * │ no hay parámetro que leer — el usuario sale de la COOKIE y solo puede ser uno.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Sin sesión responde 401: no hay un "mi perfil" de un invitado.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return apiError("BAD_REQUEST", "Parámetros de página inválidos.", 400);

  const { prisma } = await depsRuta();
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { misVideosPaginados } = await import("@/server/services/perfil");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  const usuario = await getCurrentUser();
  if (!usuario) return apiError("UNAUTHORIZED", "Inicia sesión para ver tus vídeos.", 401);

  try {
    const { items, nextCursor } = await misVideosPaginados(prisma, usuario.userId, {
      cursor: parsed.data.cursor ?? null,
      limite: parsed.data.limit,
    });

    // La MISMA celda que monta la página, con la misma regla: solo el PUBLICADO tiene póster
    // firmable; los demás enseñan su estado y no gastan una firma.
    return apiOk({
      items: items.map((v) => ({
        id: v.id,
        title: v.title,
        poster:
          v.estado === "publicado"
            ? firmarReproduccion(v.bunnyVideoId, v.thumbnailFileName).poster
            : "",
        estado: v.estado,
        categoria: v.categoria,
      })),
      nextCursor,
    });
  } catch (e) {
    console.error("[api/perfil/videos] fallo paginando:", sanearError(e));
    return apiError("VIDEOS_FAILED", "No se pudieron cargar más vídeos.", 502);
  }
}
