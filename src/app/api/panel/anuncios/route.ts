import { z } from "zod";

import { ANUNCIO_TEXTO_MAX, ANUNCIO_TEXTO_MIN } from "@/config/constants";
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

const QuerySchema = z.object({ cursor: z.string().min(1).max(300).optional() });

/**
 * GET /api/panel/anuncios?cursor= — página siguiente de los anuncios enviados, con su progreso
 * (keyset). Lectura, pero del admin: su propio `requireRole("ADMIN")`.
 */
export async function GET(req: Request) {
  const { requireRole } = await import("@/server/auth/rbac");
  try {
    await requireRole("ADMIN");
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para ver los anuncios.", 403);
  }

  const url = new URL(req.url);
  const q = QuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined });
  if (!q.success) return apiError("INVALID_QUERY", "Petición no válida.", 400);

  const { prisma } = await depsRuta();
  const { listarAnuncios } = await import("@/server/services/anuncios");
  const pagina = await listarAnuncios(prisma, { cursor: q.data.cursor ?? null });
  return apiOk({ items: pagina.items, nextCursor: pagina.nextCursor });
}
