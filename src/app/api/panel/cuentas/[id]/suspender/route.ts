import { z } from "zod";

import {
  MSG_CUENTA_NO_ENCONTRADA,
  MSG_SIN_PERMISO_MODERAR,
  MSG_SUSPENDER_NO_PERMITIDO,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /api/panel/cuentas/[id]/suspender — SUSPENDER una cuenta de usuario.
 *
 * Guard `requireRole("MODERATOR")`, no `"ADMIN"`: suspender SÍ es moderar, y el administrador lo
 * cumple por jerarquía (USER < MODERATOR < ADMIN). Poner aquí `"ADMIN"` dejaría a los moderadores sin
 * su trabajo, que es justo lo contrario de lo que esta pieza prepara.
 *
 * Solo se suspende a un USER: la regla (`puedeBanear`) se aplica sobre el rol REAL del destino, así que
 * un moderador comprometido no puede echar a otros moderadores ni al administrador. Para retirar a un
 * moderador, primero se le degrada (ruta de rol, que además le revoca las sesiones).
 *
 * Idempotente: suspender a quien ya está suspendido no vuelve a escribir rastro.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { suspenderCuenta } = await import("@/server/services/gobierno-cuentas");

    let actor;
    try {
      actor = await requireRole("MODERATOR");
    } catch {
      return apiError("FORBIDDEN", MSG_SIN_PERMISO_MODERAR, 403);
    }

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_CUENTA_NO_ENCONTRADA, 404);

    const r = await suspenderCuenta(prisma, {
      actorId: actor.userId,
      rolActor: actor.role,
      userId: parsed.data.id,
    });

    if (r.estado === "rechazado") {
      return r.motivo === "NO_ENCONTRADA"
        ? apiError("NOT_FOUND", MSG_CUENTA_NO_ENCONTRADA, 404)
        : apiError("FORBIDDEN", MSG_SUSPENDER_NO_PERMITIDO, 403);
    }
    return apiOk({ ok: true, cambiado: r.estado === "hecho" });
  },
);
