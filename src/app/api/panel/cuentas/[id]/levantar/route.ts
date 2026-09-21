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
 * POST /api/panel/cuentas/[id]/levantar — LEVANTAR la suspensión de una cuenta.
 *
 * Mismo guard que suspender (`requireRole("MODERATOR")`) y la misma regla de destino: quien puede
 * poner una suspensión puede quitarla. No resucita sesiones —se borraron al suspender—: el usuario
 * vuelve a entrar, que es lo correcto.
 *
 * Idempotente: levantar la de quien no está suspendido no escribe rastro.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { levantarSuspension } = await import("@/server/services/gobierno-cuentas");

    let actor;
    try {
      actor = await requireRole("MODERATOR");
    } catch {
      return apiError("FORBIDDEN", MSG_SIN_PERMISO_MODERAR, 403);
    }

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_CUENTA_NO_ENCONTRADA, 404);

    const r = await levantarSuspension(prisma, {
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
