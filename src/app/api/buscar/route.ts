import { z } from "zod";

import { BUSCAR_LIMITE } from "@/config/constants";
import { apiError, apiOk, clientIpKey, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/buscar?q=&tipo=usuarios|retos&cursor= — BÚSQUEDA PÚBLICA (sin sesión; un invitado puede
 * buscar contenido público). Actuar sobre un resultado exige login por el gate existente; aquí solo se
 * consulta y se devuelve el DTO PÚBLICO de A1 (jamás email ni campos privados). NO muta -> no pasa por
 * `mutatingRoute` ni CSRF. Rate-limit por IP (acota scraping) + caché Redis por (q,tipo,cursor) con TTL
 * corto (descarga la BD en consultas calientes; opcional y degradable, ver la caché). Errores humanos.
 */
const QuerySchema = z.object({
  q: z.string().trim().min(2, "Escribe al menos 2 caracteres.").max(100),
  tipo: z.enum(["usuarios", "retos"]),
  cursor: z.string().max(500).optional(),
  // `limite` OPCIONAL (sugerencias piden pocas). Entero en [1, BUSCAR_LIMITE]: fuera de rango -> 400
  // (no se sirve más de lo permitido). Ausente -> el servicio usa su default (BUSCAR_LIMITE).
  limite: z.coerce.number().int().min(1).max(BUSCAR_LIMITE).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    tipo: url.searchParams.get("tipo") ?? "",
    cursor: url.searchParams.get("cursor") ?? undefined,
    limite: url.searchParams.get("limite") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(
      "BAD_REQUEST",
      "Búsqueda inválida. Escribe al menos 2 caracteres y elige un tipo.",
      400,
    );
  }
  const { q, tipo, cursor, limite } = parsed.data;

  const { env, prisma } = await depsRuta();
  const { RATE_LIMITS, BUSCAR_CACHE_TTL_SEC } = await import("@/config/constants");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { buscarRetos, buscarUsuarios } = await import("@/server/services/buscar");
  const { buscarConCache, getCacheBusqueda } = await import("@/server/cache/busqueda");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  // Rate-limit por IP (la busqueda es publica: sin sesion no hay cubo por usuario). La IP va HASHeada.
  const rl = await rateLimit(prisma, {
    key: `buscar:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.BUSCAR_PER_IP,
  });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Demasiadas búsquedas seguidas. Espera un momento.", 429);
  }

  try {
    const cache = getCacheBusqueda();
    // `limite` en la CLAVE: una respuesta de 6 y una de 20 para la misma (q,tipo,cursor) NO deben
    // compartir entrada de caché.
    const clave = `buscar:${tipo}:${q}:${cursor ?? ""}:${limite ?? ""}`;
    const pagina =
      tipo === "usuarios"
        ? await buscarConCache(cache, clave, BUSCAR_CACHE_TTL_SEC, () =>
            buscarUsuarios(prisma, q, cursor ?? null, limite),
          )
        : await buscarConCache(cache, clave, BUSCAR_CACHE_TTL_SEC, () =>
            buscarRetos(prisma, q, cursor ?? null, limite),
          );
    return apiOk(pagina as unknown as Record<string, unknown>);
  } catch (e) {
    console.error("[buscar] fallo:", sanearError(e));
    return apiError("BUSCAR_FAILED", "No hemos podido buscar ahora mismo. Reinténtalo.", 502);
  }
}
