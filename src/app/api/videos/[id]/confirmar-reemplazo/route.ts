import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/videos/[id]/confirmar-reemplazo — RUTA RÁPIDA del swap de un reemplazo: cuando el cliente
 * detecta que su Video de reemplazo ya está PUBLISHED, llama aquí para que la participación cambie al
 * nuevo vídeo al instante (sin esperar al worker). `mutatingRoute` (Origin/sesión/CSRF) + AUTORIZACIÓN
 * POR CONSTRUCCIÓN: el vídeo debe ser del usuario (ajeno/inexistente -> 404).
 *
 * El swap real (repuntar la Submission, marcar el viejo REMOVED + encolar su borrado, limpiar el
 * puntero) vive en `completarReemplazo`, IDEMPOTENTE y compartido con el worker (red de seguridad): si
 * el cliente no llega a llamar, el worker lo completa igual. Si el vídeo aún no está PUBLISHED -> 409
 * (reintentar). Si no es un reemplazo pendiente (ya completado o nunca lo fue) -> 200 con hecho=false.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user, prisma }, { params }) => {
    const { completarReemplazo } = await import("@/server/services/participacion");
    const { id } = await params;

    const video = await prisma.video.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });
    if (!video || video.userId !== user.userId) {
      return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    }
    if (video.status !== "PUBLISHED") {
      return apiError("NO_LISTO", "El vídeo aún se está procesando. Inténtalo en un momento.", 409);
    }

    const { hecho } = await completarReemplazo(prisma, id);
    return apiOk({ ok: true, hecho });
  },
);
