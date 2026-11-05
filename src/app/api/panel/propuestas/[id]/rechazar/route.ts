import { z } from "zod";

import { EMPRESA_NOTA_MAX, MotivoRechazoRetoSchema } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * El motivo es OBLIGATORIO y de la lista cerrada: es lo que va a leer la empresa. La nota es opcional
 * y NO viaja nunca a la empresa (ver `RetoSolicitud.notaInterna`). Mismo tope que la de una empresa.
 */
const CuerpoSchema = z.object({
  motivo: MotivoRechazoRetoSchema,
  nota: z.string().trim().max(EMPRESA_NOTA_MAX).optional(),
});

/**
 * POST /api/panel/propuestas/[id]/rechazar — RECHAZAR una propuesta, con motivo (Fase 9 · P3).
 * Solo ADMIN. Una ya decidida no se vuelve a decidir ni se reenvía el correo.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { env, prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { rechazarSolicitudReto, limpiarLogosDescartados } =
      await import("@/server/services/retos-empresa");

    let actorId: string;
    try {
      actorId = (await requireRole("ADMIN")).userId;
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para revisar propuestas.", 403);
    }

    const p = ParamsSchema.safeParse(await params);
    if (!p.success) return apiError("NOT_FOUND", "Esa propuesta no existe.", 404);

    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success) {
      return apiError("INVALID_BODY", "Elige un motivo de la lista para rechazarla.", 400);
    }

    const r = await rechazarSolicitudReto(prisma, {
      solicitudId: p.data.id,
      actorId,
      motivo: cuerpo.data.motivo,
      nota: cuerpo.data.nota ?? null,
      appUrl: env.APP_URL,
    });
    // EL LOGO DE UNA RECHAZADA SE BORRA EN EL ACTO, después de que la decisión ya esté confirmada
    // (un fichero no entra en una transacción). Si esto falla o el proceso muere aquí, el barrido del
    // worker lo recoge: la columna sigue apuntando al fichero hasta que se borra de verdad.
    if (r.rechazada) {
      await limpiarLogosDescartados(prisma, {
        dir: env.PORTADAS_DIR,
        solicitudId: p.data.id,
        log: (m) => console.warn(m),
      });
    }
    return apiOk({ ok: true, cambiado: r.rechazada });
  },
);
