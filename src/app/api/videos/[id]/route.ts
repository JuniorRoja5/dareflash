import { z } from "zod";

import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta. Un id vacio/absurdo -> 404 (no se consulta la BD con basura). */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * DELETE /api/videos/[id] — el DUEÑO borra SU propio video. `mutatingRoute` (Origin + sesion + CSRF).
 *
 * AUTORIZACION por CONSTRUCCION: se carga el video y solo se borra si su `userId` == el de la SESION.
 * Si no existe o es de OTRO -> 404 (no 403: no revela la existencia de videos ajenos). Nunca se fia de
 * un id/owner del cliente.
 *
 * ORDEN (evita estado inconsistente): 1) marca REMOVED de forma FIABLE (a partir de ahi deja de salir
 * en feed/perfil, que filtran REMOVED); 2) borra el objeto en Bunny en BEST-EFFORT. Si Bunny falla, el
 * video YA esta oculto y el barrido de huerfanos limpiara el objeto despues: no bloqueamos el borrado
 * logico por un fallo de Bunny.
 */
export const DELETE = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user }, { params }) => {
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    const { id } = parsed.data;

    const { env } = await import("@/config/env");
    const { prisma } = await import("@/server/db/client");
    const { clienteBunnyReal } = await import("@/server/services/bunny");
    const { sanearError } = await import("@/server/observability/sanitize-error");

    const video = await prisma.video.findUnique({
      where: { id },
      select: { id: true, userId: true, bunnyVideoId: true, status: true },
    });
    // Inexistente O de otro usuario -> el MISMO 404 (sin distinguir): no se filtra si existe.
    if (!video || video.userId !== user.userId) {
      return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    }
    // Idempotente: ya borrado -> 200 sin repetir nada.
    if (video.status === "REMOVED") return apiOk({ ok: true });

    // 1) REMOVED FIABLE primero: el video deja de mostrarse aunque Bunny falle luego.
    await prisma.video.update({ where: { id: video.id }, data: { status: "REMOVED" } });

    // 2) Bunny best-effort: un fallo se LOGuea (saneado) y se ignora (lo limpia el barrido de huerfanos).
    try {
      await clienteBunnyReal.deleteVideo({
        libraryId: env.BUNNY_STREAM_LIBRARY_ID,
        apiKey: env.BUNNY_STREAM_API_KEY,
        videoId: video.bunnyVideoId,
      });
    } catch (e) {
      console.error(`[videos/delete] Bunny fallo, queda para huerfanos: ${sanearError(e)}`);
    }

    return apiOk({ ok: true });
  },
);
