import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos/[id]/restaurar — el ADMIN se arrepiente durante la gracia de 7 dias y devuelve
 * el reto a la vida. Su PROPIO guard (`requireRole("ADMIN")`) + `mutatingRoute`.
 *
 * SOLO mientras la gracia corre. Una vez consumada, el admin ya tuvo su plazo y deshacerlo seria otra
 * decision (y con otras consecuencias): por eso el servicio exige `deletedAt: null` en el WHERE.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { restaurarReto } = await import("@/server/services/retos-admin");

    try {
      await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para restaurar retos.", 403);
    }

    const { id } = await params;
    const { restaurado } = await restaurarReto(prisma, id);
    if (!restaurado) return apiError("NOT_FOUND", "Ese reto no esta pendiente de borrado.", 404);
    return apiOk({ ok: true });
  },
);
