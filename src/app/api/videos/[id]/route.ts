import { z } from "zod";

import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta. Un id vacio/absurdo -> 404 (no se consulta la BD con basura). */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/** Tipo de job de borrado del objeto en Bunny (union en constants: JobType). */
const BUNNY_DELETE_VIDEO = "BUNNY_DELETE_VIDEO";

/**
 * DELETE /api/videos/[id] — el DUEÑO borra SU propio video. `mutatingRoute` (Origin + sesion + CSRF).
 *
 * AUTORIZACION por CONSTRUCCION: se carga el video y solo se borra si su `userId` == el de la SESION.
 * Si no existe o es de OTRO -> 404 (no 403: no revela la existencia de videos ajenos). Nunca se fia de
 * un id/owner del cliente.
 *
 * BORRADO EN DOS PLANOS, ATOMICOS: en UNA transaccion se (1) marca REMOVED —a partir de ahi deja de
 * salir en feed/perfil, que filtran REMOVED— y (2) se ENCOLA un job `BUNNY_DELETE_VIDEO` que borrara
 * el objeto en Bunny. Van juntos a proposito: si el encolado fallara tras el REMOVED, el objeto
 * quedaria HUERFANO PARA SIEMPRE (el barrido de huerfanos CONSERVA los REMOVED: es moderacion). El
 * borrado real NO lo hace esta peticion (no bloquear al usuario por Bunny): lo ejecuta el worker, que
 * es idempotente (404 = ya no existe = exito) y reintentable, y si se agota deja el Job FAILED VISIBLE.
 */
export const DELETE = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user }, { params }) => {
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    const { id } = parsed.data;

    const { prisma } = await import("@/server/db/client");

    const video = await prisma.video.findUnique({
      where: { id },
      select: { id: true, userId: true, bunnyVideoId: true, status: true },
    });
    // Inexistente O de otro usuario -> el MISMO 404 (sin distinguir): no se filtra si existe.
    if (!video || video.userId !== user.userId) {
      return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    }
    // Idempotente: ya borrado -> 200 sin repetir nada (ni re-encolar).
    if (video.status === "REMOVED") return apiOk({ ok: true });

    await prisma.$transaction(async (tx) => {
      // Condicionado a NO estar ya REMOVED: si dos peticiones entran a la vez, solo UNA marca y encola.
      const r = await tx.video.updateMany({
        where: { id: video.id, status: { not: "REMOVED" } },
        data: { status: "REMOVED" },
      });
      if (r.count !== 1) return; // otra peticion gano la carrera: ya esta REMOVED y encolado.
      await tx.job.create({
        data: {
          type: BUNNY_DELETE_VIDEO,
          payload: { bunnyVideoId: video.bunnyVideoId },
          runAt: new Date(),
          // Idempotencia dura del encolado: un doble borrado del mismo objeto no crea dos jobs.
          idempotencyKey: `bunny:delete:${video.bunnyVideoId}`,
        },
      });
    });

    return apiOk({ ok: true });
  },
);
