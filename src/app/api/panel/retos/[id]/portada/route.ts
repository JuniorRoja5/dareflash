import { z } from "zod";

import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const CuerpoSchema = z.object({ accion: z.enum(["DESTACAR", "QUITAR"]) });

/**
 * POST /api/panel/retos/[id]/portada — EL RETO DESTACADO DE LA PORTADA (Fase 9 · P14): `DESTACAR` lo
 * pone en el hero de `/inicio` (sustituye al que hubiera: hay UNO); `QUITAR` deja la portada en
 * automático. Su PROPIO guard (`requireRole("ADMIN")`: un moderador no puede) + `mutatingRoute`
 * (Origin/sesión/CSRF). La regla —solo publicado y abierto, y de empresa solo pagado— y el AuditLog
 * viven en el servicio; aquí solo se traduce a HTTP.
 */
export const POST = mutatingRoute(
  async (req, { prisma }, ctx: { params: Promise<{ id: string }> }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { marcarDestacado, quitarDestacado } = await import("@/server/services/portada");

    let adminId: string;
    try {
      adminId = (await requireRole("ADMIN")).userId;
    } catch {
      return apiError("FORBIDDEN", "Solo el administrador elige el reto de la portada.", 403);
    }

    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success) return apiError("VALIDATION", "Acción no válida.", 400);
    const { id } = await ctx.params;

    const r =
      cuerpo.data.accion === "DESTACAR"
        ? await marcarDestacado(prisma, { challengeId: id, adminId })
        : await quitarDestacado(prisma, { adminId });
    if (r.estado === "rechazado") {
      return apiError(
        "NO_ABIERTO",
        "Solo se puede destacar un reto publicado y abierto (y, si es de una empresa, ya pagado).",
        409,
      );
    }
    return apiOk({
      ok: true,
      cambiado: r.estado === "hecho",
      mensaje:
        cuerpo.data.accion === "DESTACAR"
          ? "Es el reto destacado de la portada."
          : "La portada vuelve a elegir sola el reto destacado.",
    });
  },
);
