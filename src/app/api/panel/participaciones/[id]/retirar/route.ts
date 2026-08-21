import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/participaciones/[id]/retirar — el ADMIN retira una participación indebida (moderación
 * reactiva mínima; la Moderación completa es Fase 5). Su PROPIO guard (`requireRole("ADMIN")`, no confía
 * en el layout) + `mutatingRoute` (Origin/sesión/CSRF).
 *
 * Marca la Submission Y su Video REMOVED -> desaparece de reto, feed y perfil. PRESERVA el objeto en
 * Bunny (NO encola BUNNY_DELETE_VIDEO): evidencia / preservación de contenido; el barrido de huérfanos
 * ya conserva los REMOVED. `[id]` = id de la Submission. Idempotente.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { retirarParticipacion } = await import("@/server/services/participacion");

    try {
      await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para retirar participaciones.", 403);
    }

    const { id } = await params;
    const { retirada } = await retirarParticipacion(prisma, id);
    if (!retirada) return apiError("NOT_FOUND", "Esa participación no existe.", 404);
    return apiOk({ ok: true });
  },
);
