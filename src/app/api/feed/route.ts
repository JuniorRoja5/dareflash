import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * Parámetros de paginación. `cursor` = id del último video de la página anterior; `limit` opcional
 * (la consulta lo acota a [1, FEED_LIMITE_MAX], aquí solo se rechaza lo absurdo).
 */
const QuerySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
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
