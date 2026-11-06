import { z } from "zod";

import { MotivoRetiradaPublicidadSchema } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** El contexto de Next con los `params` de la ruta (alias: el censo de rutas lee el genérico plano). */
type ContextoRuta = { params: Promise<{ id: string }> };

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

const CuerpoSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("RETIRAR"),
    motivo: MotivoRetiradaPublicidadSchema,
    nota: z.string().trim().max(500).optional(),
  }),
  z.object({ accion: z.literal("ABSOLVER") }),
]);

/**
 * POST /api/panel/publicidad/[id] — LA DECISIÓN DEL ADMIN sobre una campaña (Fase 9 · P8): RETIRARLA
 * con un motivo de la lista cerrada (más una nota interna opcional), o ABSOLVERLA. Solo ADMIN: retirar
 * una campaña le escribe a una empresa y libera plazas vendidas, y eso es una decisión comercial.
 *
 * La retirada deja de servirse AL MOMENTO (el servicio vacía la caché de campañas servibles al
 * confirmar), le manda a la empresa el MOTIVO —nunca la nota ni quién firmó— y queda en el AuditLog.
 */
export const POST = mutatingRoute<ContextoRuta>(async (req, { env, prisma }, { params }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { absolverPublicidad, retirarPublicidad } =
    await import("@/server/services/publicidad-moderacion");

  let adminId: string;
  try {
    adminId = (await requireRole("ADMIN")).userId;
  } catch {
    return apiError("FORBIDDEN", "Solo el administrador puede decidir sobre la publicidad.", 403);
  }

  const p = ParamsSchema.safeParse(await params);
  if (!p.success) return apiError("NOT_FOUND", "Esa campaña no existe.", 404);
  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) {
    return apiError("VALIDATION", "Elige un motivo de la lista para retirar la campaña.", 400);
  }

  const r =
    cuerpo.data.accion === "RETIRAR"
      ? await retirarPublicidad(prisma, {
          publicidadId: p.data.id,
          adminId,
          motivo: cuerpo.data.motivo,
          nota: cuerpo.data.nota ?? null,
          appUrl: env.APP_URL,
        })
      : await absolverPublicidad(prisma, { publicidadId: p.data.id, adminId, appUrl: env.APP_URL });

  if (r.estado === "rechazado") {
    return r.motivo === "NO_EXISTE"
      ? apiError("NOT_FOUND", "Esa campaña no existe.", 404)
      : apiError("NO_SE_PUEDE", "Esa campaña ya no se puede retirar.", 409);
  }
  return apiOk({
    ok: true,
    cambiado: r.estado === "hecho",
    mensaje:
      r.estado === "sin_cambios"
        ? "No había nada que cambiar."
        : cuerpo.data.accion === "RETIRAR"
          ? "Retirada. Ya no se muestra y hemos avisado a la empresa."
          : "Absuelta. Sus denuncias quedan descartadas.",
  });
});
