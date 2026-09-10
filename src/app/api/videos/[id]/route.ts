import { z } from "zod";

import type { EstadoVideo } from "@/app/(app)/(shell)/perfil/perfil-logic";
import type { EstadoVideoSondeo } from "@/lib/estado-subida";
import { apiError, apiOk, depsRuta } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta. Un id vacio/absurdo -> 404 (no se consulta la BD con basura). */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Traduccion del estado interno al que viaja por la API. Es un `Record` TOTAL a proposito: si algun
 * dia `EstadoVideo` gana un caso nuevo, esto deja de compilar y obliga a decidir que se le cuenta al
 * dueno, en vez de que el caso nuevo se cuele como "procesando" y le mienta.
 */
const MAPA_SONDEO: Record<EstadoVideo, EstadoVideoSondeo> = {
  procesando: "procesando",
  publicado: "publicado",
  "demasiado-largo": "demasiado-largo",
  "no-disponible": "no-disponible",
  error: "error",
};

/**
 * GET /api/videos/[id] — estado del video PARA SU DUENO.
 *
 * POR QUE EXISTE (agujero real): mientras se sube, la UI preguntaba por `/reproduccion`, que devuelve
 * 404 tanto si el video sigue codificando como si la codificacion FALLO. Con una sola respuesta para
 * dos desenlaces opuestos, el modal se quedaba diciendo "aparecera cuando este listo" para siempre
 * ante un video que no iba a aparecer nunca — y el usuario perdia su participacion sin enterarse,
 * cuando aun estaba a tiempo de reemplazarla si el reto seguia abierto.
 *
 * Es LECTURA: no pasa por `mutatingRoute` ni CSRF. Autorizacion por CONSTRUCCION, igual que el DELETE
 * de abajo: se carga la fila y solo responde si el `userId` es el de la sesion; si no existe o es de
 * otro, el MISMO 404. El estado de un video ajeno no se filtra ni por omision.
 *
 * NO devuelve `failureReason` crudo: la traduccion a algo humano ya vive en `estadoDeVideo`, y es la
 * misma que usa el perfil. Una sola regla, no dos que se separan.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);

  const { requireUser } = await import("@/server/auth/rbac");
  const { estadoDeVideo } = await import("@/server/services/perfil");
  const { prisma } = await depsRuta();

  const user = await requireUser();
  const video = await prisma.video.findUnique({
    where: { id: parsed.data.id },
    select: { userId: true, status: true, failureReason: true },
  });
  if (!video || video.userId !== user.userId) {
    return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
  }
  return apiOk({ estado: MAPA_SONDEO[estadoDeVideo(video.status, video.failureReason)] });
}

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
  async (_req, { user, prisma }, { params }) => {
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    const { id } = parsed.data;

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

      // Si el video era una PARTICIPACION, su Submission se retira TAMBIEN, y marcada como retirada
      // POR EL DUENO. Antes esto no se tocaba: la Submission quedaba viva apuntando a un video REMOVED,
      // y la regla de re-participacion —que miraba el estado del video— leia eso como una retirada de
      // MODERACION y vetaba al usuario del reto PARA SIEMPRE. Es su contenido: borrarlo no puede
      // expulsarle. El updateMany por videoId toca SOLO la suya (videoId es unico), nunca la Submission
      // a la que este video estuviera reemplazando.
      await tx.submission.updateMany({
        where: { videoId: video.id },
        data: { status: "REMOVED", retiradaMotivo: "DUENO", retiradaEn: new Date() },
      });
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
