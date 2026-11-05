import { z } from "zod";

import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /api/panel/retos/[id]/pago-recibido — MARCAR RECIBIDO EL PAGO de un reto de empresa
 * (Fase 9 · P3). Solo ADMIN: dar por cobrado un dinero es una decisión de quien factura.
 *
 * Es lo que desbloquea "Publicar" en un reto de empresa (ver `publicarReto`). Queda en `AuditLog`, y
 * repetirlo no reescribe la fecha (ver `marcarPagoRecibido`).
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { marcarPagoRecibido } = await import("@/server/services/retos-empresa");

    let actorId: string;
    try {
      actorId = (await requireRole("ADMIN")).userId;
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para marcar pagos.", 403);
    }

    const p = ParamsSchema.safeParse(await params);
    if (!p.success) return apiError("NOT_FOUND", "Ese reto no existe.", 404);

    const r = await marcarPagoRecibido(prisma, { challengeId: p.data.id, actorId });
    return apiOk({ ok: true, cambiado: r.marcado });
  },
);
