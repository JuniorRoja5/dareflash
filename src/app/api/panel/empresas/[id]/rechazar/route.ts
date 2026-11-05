import { z } from "zod";

import {
  EMPRESA_NOTA_MAX,
  MSG_EMPRESA_MOTIVO_INVALIDO,
  MSG_EMPRESA_NO_ENCONTRADA,
  MSG_SIN_PERMISO_EMPRESAS,
  MotivoRechazoEmpresaSchema,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * El motivo es OBLIGATORIO y de la lista cerrada: es lo que va a leer quien se registró. La nota es
 * opcional y NO viaja al dueño (ver `Empresa.notaInterna`).
 */
const CuerpoSchema = z.object({
  motivo: MotivoRechazoEmpresaSchema,
  nota: z.string().trim().max(EMPRESA_NOTA_MAX).optional(),
});

/**
 * POST /api/panel/empresas/[id]/rechazar — RECHAZAR una empresa, con motivo.
 *
 * Mismo guard que verificar (`ADMIN`): es la cara B de la misma decisión. Rechazar con el MISMO
 * motivo y la misma nota no escribe nada; cambiar el motivo sí deja rastro (ver `rechazarEmpresa`).
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { env, prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { rechazarEmpresa } = await import("@/server/services/empresas");

    let actorId: string;
    try {
      actorId = (await requireRole("ADMIN")).userId;
    } catch {
      return apiError("FORBIDDEN", MSG_SIN_PERMISO_EMPRESAS, 403);
    }

    const p = ParamsSchema.safeParse(await params);
    if (!p.success) return apiError("NOT_FOUND", MSG_EMPRESA_NO_ENCONTRADA, 404);

    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success) return apiError("INVALID_BODY", MSG_EMPRESA_MOTIVO_INVALIDO, 400);

    const r = await rechazarEmpresa(prisma, {
      empresaId: p.data.id,
      actorId,
      motivo: cuerpo.data.motivo,
      nota: cuerpo.data.nota ?? null,
      appUrl: env.APP_URL,
    });
    if (r.estado === "rechazado") {
      return apiError("NOT_FOUND", MSG_EMPRESA_NO_ENCONTRADA, 404);
    }
    return apiOk({ ok: true, cambiado: r.estado === "hecho" });
  },
);
