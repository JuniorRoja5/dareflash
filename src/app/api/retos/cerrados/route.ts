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

/**
 * GET /api/retos/cerrados — página SIGUIENTE del histórico de retos cerrados. PÚBLICO, como la
 * pantalla: un invitado pagina sin sesión.
 *
 * La PRIMERA página la sirve el Server Component de `/retos`; esto sirve de la segunda en adelante.
 * El histórico de cerrados es la única lista de esa pantalla que crece para siempre —un reto
 * cerrado no vuelve a salir de ella—, y antes se cortaba en los 100 más recientes sin decirlo.
 *
 * NO FILTRA NADA QUE LA PRIMERA PÁGINA NO FILTRE: lo que se ve lo decide `listarRetosCerrados`, que
 * es la misma función que usa la página. Un reto borrado (o en su gracia de borrado) no aparece
 * tampoco paginando.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return apiError("BAD_REQUEST", "Parámetros de página inválidos.", 400);

  const { prisma } = await depsRuta();
  const { listarRetosCerrados } = await import("@/server/services/retos-publico");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  try {
    const { items, nextCursor } = await listarRetosCerrados(prisma, new Date(), {
      cursor: parsed.data.cursor ?? null,
      limite: parsed.data.limit,
    });
    return apiOk({ items, nextCursor });
  } catch (e) {
    console.error("[api/retos/cerrados] fallo paginando:", sanearError(e));
    return apiError("CERRADOS_FAILED", "No se pudieron cargar más retos cerrados.", 502);
  }
}
