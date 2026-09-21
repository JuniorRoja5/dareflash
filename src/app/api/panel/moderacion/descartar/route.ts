import { z } from "zod";

import {
  MSG_MODERACION_DESCARTADO,
  MSG_MODERACION_SIN_CAMBIOS,
  MSG_SIN_PERMISO_COLA,
  ReportTargetDenunciableSchema,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const CuerpoSchema = z.object({
  targetType: ReportTargetDenunciableSchema,
  targetId: z.string().min(1).max(64),
});

/**
 * POST /api/panel/moderacion/descartar — DESCARTAR las denuncias de un objeto: el contenido se queda.
 *
 * Mismo guard que retirar (`requireRole("MODERATOR")`) y mismo envoltorio mutante. No toca el
 * contenido: solo marca sus denuncias abiertas como revisadas y sin acción. Idempotente: descartar dos
 * veces no cambia nada la segunda.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { descartarDenuncias } = await import("@/server/services/moderar");

  try {
    await requireRole("MODERATOR");
  } catch {
    return apiError("FORBIDDEN", MSG_SIN_PERMISO_COLA, 403);
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "No se entiende qué hay que descartar.", 400);

  const r = await descartarDenuncias(prisma, cuerpo.data);
  return apiOk({
    ok: true,
    cambiado: r.estado === "hecho",
    mensaje: r.estado === "hecho" ? MSG_MODERACION_DESCARTADO : MSG_MODERACION_SIN_CAMBIOS,
  });
});
