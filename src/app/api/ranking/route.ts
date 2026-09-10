import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * `cursor` es OPACO: lo produce el servicio y se devuelve tal cual. El cliente no lo interpreta ni lo
 * construye — si lo hiciera, la forma del cursor pasaría a ser contrato público y no se podría cambiar
 * el criterio de orden sin romper a quien tenga una página abierta.
 */
const QuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limite: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * GET /api/ranking — página del ranking MENSUAL por victorias, paginada por KEYSET.
 *
 * PÚBLICO como el feed: el ranking se ve sin sesión. Es LECTURA, así que no pasa por `mutatingRoute`
 * ni CSRF. No expone nada que el perfil público no exponga ya (handle, avatar, puntos), y no dice
 * quién eres: el resaltado de "tú" lo resuelve el servidor al pintar la primera página.
 *
 * NUNCA OFFSET. El servicio pagina con un cursor sobre el índice `[periodo, victorias, userId]`; una
 * página N no obliga a producir y descartar las N-1 anteriores, y entre página y página nadie se
 * repite ni se salta. Esta ruta solo lo transporta.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limite: url.searchParams.get("limite") ?? undefined,
  });
  if (!parsed.success) return apiError("INVALID_QUERY", "Petición no válida.", 400);

  const { prisma } = await depsRuta();
  const { rankingMensual } = await import("@/server/services/ranking");

  const pagina = await rankingMensual(prisma, {
    cursor: parsed.data.cursor ?? null,
    ...(parsed.data.limite === undefined ? {} : { limite: parsed.data.limite }),
  });
  return apiOk({ filas: pagina.filas, cursor: pagina.cursor });
}
