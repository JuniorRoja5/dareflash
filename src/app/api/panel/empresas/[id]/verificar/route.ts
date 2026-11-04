import { z } from "zod";

import { MSG_EMPRESA_NO_ENCONTRADA, MSG_SIN_PERMISO_EMPRESAS } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /api/panel/empresas/[id]/verificar — VERIFICAR una empresa a mano.
 *
 * Guard `requireRole("ADMIN")`, no `"MODERATOR"`: verificar una empresa es una decisión comercial
 * (quién puede anunciarse y facturar), igual que Patrocinios. Moderar es contenido.
 *
 * Idempotente: verificar lo ya verificado no vuelve a escribir rastro ni mueve `verificadaEn`.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { verificarEmpresa } = await import("@/server/services/empresas");

    let actorId: string;
    try {
      actorId = (await requireRole("ADMIN")).userId;
    } catch {
      return apiError("FORBIDDEN", MSG_SIN_PERMISO_EMPRESAS, 403);
    }

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_EMPRESA_NO_ENCONTRADA, 404);

    const r = await verificarEmpresa(prisma, { empresaId: parsed.data.id, actorId });
    if (r.estado === "rechazado") {
      return apiError("NOT_FOUND", MSG_EMPRESA_NO_ENCONTRADA, 404);
    }
    return apiOk({ ok: true, cambiado: r.estado === "hecho" });
  },
);
