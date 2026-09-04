import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/participaciones/[id]/desbloquear — el ADMIN levanta el veto de una participación que
 * él mismo (u otro moderador) retiró, para que ese usuario pueda volver a participar en ese reto.
 *
 * Es el INVERSO de `retirar`, que hasta ahora no tenía vuelta atrás: una retirada equivocada dejaba al
 * usuario fuera del reto para siempre y solo se arreglaba tocando la base de datos a mano.
 *
 * NO republica el vídeo retirado — eso sería revertir la decisión de moderación, que es otra cosa y
 * mucho más delicada. Solo devuelve el derecho a subir uno nuevo. Ver `desbloquearParticipacion`.
 *
 * Su PROPIO guard (`requireRole("ADMIN")`, no se fía del layout) + `mutatingRoute`. Idempotente.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { desbloquearParticipacion } = await import("@/server/services/participacion");

    try {
      await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para desbloquear participaciones.", 403);
    }

    const { id } = await params;
    const { desbloqueada } = await desbloquearParticipacion(prisma, id);
    // Inexistente y "no estaba bloqueada por moderación" dan el MISMO 404: no hay nada que levantar, y
    // distinguirlos revelaría qué ids existen.
    if (!desbloqueada) {
      return apiError("NOT_FOUND", "No hay ningún bloqueo que levantar en esa participación.", 404);
    }
    return apiOk({ ok: true });
  },
);
