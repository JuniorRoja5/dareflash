import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * Parámetros de paginación. `cursor` = la tupla `(createdAt, id)` de la última fila de la página
 * anterior, codificada por `lib/cursor-tiempo` (`<ms>.<id>`); `limit` opcional (la consulta lo acota
 * a [1, FEED_LIMITE_MAX], aquí solo se rechaza lo absurdo).
 *
 * El tope de longitud da para la tupla ENTERA (hasta 15 dígitos + punto + 64 de id, que es lo que
 * acepta el decodificador): con el 64 de cuando el cursor era solo un id, un cursor legítimo se
 * habría rechazado con 400 y el scroll infinito se habría parado en seco. Un cursor más largo que
 * esto no es un cursor, y uno manipulado vuelve a la primera página en vez de reventar.
 */
const QuerySchema = z.object({
  cursor: z.string().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * GET /api/feed — página del feed PÚBLICO (videos PUBLISHED), con reproducción firmada. Es PÚBLICO
 * (el feed lo es): un invitado puede paginar sin sesión. La primera página la sirve el Server
 * Component de `/feed`; este endpoint sirve las siguientes cuando el cliente se acerca al final.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return apiError("BAD_REQUEST", "Parámetros de feed inválidos.", 400);

  const { prisma } = await depsRuta();
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { feedPublicado } = await import("@/server/services/feed");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  try {
    // El feed sigue siendo PUBLICO: sin sesion esto es `null` y `miVoto` sale null sin consultar nada.
    // Con sesion, las paginas siguientes traen el voto propio igual que la primera — si no, el boton
    // de un video paginado nacería como "no has votado" aunque sí lo hubieras hecho.
    const usuario = await getCurrentUser();
    const { items, nextCursor } = await feedPublicado(prisma, {
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit,
      firmar: firmarReproduccion,
      userId: usuario?.userId ?? null,
    });
    return apiOk({ items, nextCursor });
  } catch (e) {
    console.error("[api/feed] fallo construyendo el feed:", sanearError(e));
    return apiError("FEED_FAILED", "No se pudo cargar el feed. Reintenta.", 502);
  }
}
