import { z } from "zod";

import {
  MSG_MODERACION_NO_ENCONTRADO,
  MSG_MODERACION_RETIRADO,
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
 * POST /api/panel/moderacion/retirar — RETIRAR lo denunciado.
 *
 * Guard `requireRole("MODERATOR")`, no `"ADMIN"`: retirar contenido es el trabajo del moderador (el
 * administrador lo cumple por jerarquía). `mutatingRoute` pone Origin/sesión/CSRF.
 *
 * La ruta no sabe retirar: el servicio (`retirarPorModeracion`) oculta el contenido y cierra sus
 * denuncias en la misma transacción. Aquí solo se traduce el resultado a copy humano — ni REMOVED, ni
 * RESOLVED, ni códigos.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { retirarPorModeracion } = await import("@/server/services/moderar");

  try {
    await requireRole("MODERATOR");
  } catch {
    return apiError("FORBIDDEN", MSG_SIN_PERMISO_COLA, 403);
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "No se entiende qué hay que retirar.", 400);

  const r = await retirarPorModeracion(prisma, cuerpo.data);
  if (r.estado === "rechazado") {
    return apiError("NOT_FOUND", MSG_MODERACION_NO_ENCONTRADO, 404);
  }
  return apiOk({
    ok: true,
    cambiado: r.estado === "hecho",
    mensaje: r.estado === "hecho" ? MSG_MODERACION_RETIRADO : MSG_MODERACION_SIN_CAMBIOS,
  });
});
