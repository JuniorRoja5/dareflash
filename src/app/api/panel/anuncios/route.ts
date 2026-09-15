import { z } from "zod";

import { ANUNCIO_TEXTO_MAX, ANUNCIO_TEXTO_MIN, ANUNCIOS_PAGINA } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** `clave`: una por INTENCIÓN de envío, generada en el panel. Un doble clic manda la misma. */
const CuerpoSchema = z.object({
  texto: z.string().trim().min(ANUNCIO_TEXTO_MIN).max(ANUNCIO_TEXTO_MAX),
  clave: z.string().uuid(),
});

/**
 * POST /api/panel/anuncios — ENVIAR un anuncio: crea el `Announcement` y encola UN job de reparto, en
 * la misma transacción, y responde. NO reparte: en esta petición no se escribe ni una Notification
 * (el reparto es el job FANOUT_ANUNCIO, en segundo plano). Su PROPIO guard (`requireRole("ADMIN")`)
 * + `mutatingRoute` (Origin/sesión/CSRF). Quién envía sale de la SESIÓN.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { AnuncioError, enviarAnuncio } = await import("@/server/services/anuncios");

  let adminId: string;
  try {
    adminId = (await requireRole("ADMIN")).userId;
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para enviar anuncios.", 403);
  }

  const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "INVALID_BODY",
      `El anuncio tiene que tener entre ${ANUNCIO_TEXTO_MIN} y ${ANUNCIO_TEXTO_MAX} caracteres.`,
      400,
    );
  }

  try {
    const r = await enviarAnuncio(prisma, {
      adminId,
      texto: parsed.data.texto,
      clave: parsed.data.clave,
    });
    return apiOk({ id: r.id, targetCount: r.targetCount, creado: r.creado });
  } catch (e) {
    if (e instanceof AnuncioError) return apiError("INVALID_BODY", e.message, 400);
    throw e;
  }
});

/** Un id de anuncio (cuid): lo justo para no dejar pasar nada raro a la consulta. */
const IdAnuncio = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const QuerySchema = z.object({
  cursor: z.string().min(1).max(300).optional(),
  /** Los anuncios YA pintados cuyo progreso se refresca. Tope: una página del panel. */
  ids: z.array(IdAnuncio).min(1).max(ANUNCIOS_PAGINA).optional(),
});

/**
 * GET /api/panel/anuncios — los anuncios enviados con su PROGRESO (COUNT de sus avisos y estado), por
 * `listarAnuncios`. Dos formas:
 *  - `?cursor=`: la página siguiente (keyset), para "Ver más".
 *  - `?ids=a,b,c`: el progreso de esos anuncios, para el refresco en vivo de los que se están
 *    repartiendo. Mismas 4 consultas que una página, sin N+1.
 * Es LECTURA pura: el sondeo no cambia nada. Pero es del admin: su propio `requireRole("ADMIN")`.
 */
export async function GET(req: Request) {
  const { requireRole } = await import("@/server/auth/rbac");
  try {
    await requireRole("ADMIN");
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para ver los anuncios.", 403);
  }

  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  const q = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    ids: ids === null ? undefined : ids.split(","),
  });
  if (!q.success) return apiError("INVALID_QUERY", "Petición no válida.", 400);

  const { prisma } = await depsRuta();
  const { listarAnuncios } = await import("@/server/services/anuncios");
  const pagina = q.data.ids
    ? await listarAnuncios(prisma, { ids: q.data.ids })
    : await listarAnuncios(prisma, { cursor: q.data.cursor ?? null });
  return apiOk({ items: pagina.items, nextCursor: pagina.nextCursor });
}
