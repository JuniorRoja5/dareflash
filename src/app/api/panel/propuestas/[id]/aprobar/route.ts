import { z } from "zod";

import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /api/panel/propuestas/[id]/aprobar — APROBAR una propuesta de reto patrocinado (Fase 9 · P3).
 *
 * Solo ADMIN: aprobar crea un reto, y crear retos es del admin. NACE EN BORRADOR: esta ruta no
 * publica —publicar es la acción de siempre, la que mira el reloj—. El doble clic acaba en
 * `sin_cambios`, sin un segundo reto (ver `aprobarSolicitudReto`).
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { env, prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { aprobarSolicitudReto } = await import("@/server/services/retos-empresa");

    let actorId: string;
    try {
      actorId = (await requireRole("ADMIN")).userId;
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para revisar propuestas.", 403);
    }

    const p = ParamsSchema.safeParse(await params);
    if (!p.success) return apiError("NOT_FOUND", "Esa propuesta no existe.", 404);

    const r = await aprobarSolicitudReto(prisma, {
      solicitudId: p.data.id,
      actorId,
      appUrl: env.APP_URL,
    });
    if (r.estado === "rechazada") {
      return apiError(
        "CIERRE_PASADO",
        "El cierre que propuso ya ha pasado: no se puede aprobar. Recházala con el motivo de fechas.",
        409,
      );
    }
    if (r.estado === "sin_cambios") return apiOk({ ok: true, cambiado: false });
    return apiOk({ ok: true, cambiado: true, challengeId: r.challengeId });
  },
);
