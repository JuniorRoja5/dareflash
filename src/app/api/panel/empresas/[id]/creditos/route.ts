import { z } from "zod";

import { AJUSTE_CREDITOS_DELTA_MAX, AJUSTE_NOTA_MAX, AJUSTE_NOTA_MIN } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/** Mismo contrato que el ajuste de Boost: cantidad entera ≠ 0 con tope, motivo obligatorio, clave. */
const CuerpoSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((d) => d !== 0 && Math.abs(d) <= AJUSTE_CREDITOS_DELTA_MAX),
  nota: z.string().trim().min(AJUSTE_NOTA_MIN).max(AJUSTE_NOTA_MAX),
  clave: z.string().uuid(),
});

/**
 * POST /api/panel/empresas/[id]/creditos — AJUSTAR A MANO los créditos de publicidad de una empresa
 * (Fase 9 · P4). Solo ADMIN: mover saldo es una decisión de quien factura.
 *
 * El motivo queda en la fila del ledger y el quién/cuánto en `AuditLog`, en la misma transacción (ver
 * `ajustarCreditosEmpresa`). Reenviar la misma clave (doble clic) no lo aplica dos veces.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { AjusteCreditosError, ajustarCreditosEmpresa } =
      await import("@/server/services/creditos");

    let adminId: string;
    try {
      adminId = (await requireRole("ADMIN")).userId;
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para ajustar créditos de publicidad.", 403);
    }

    const p = ParamsSchema.safeParse(await params);
    if (!p.success) return apiError("NOT_FOUND", "Esa empresa no existe.", 404);

    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success) {
      return apiError(
        "INVALID_BODY",
        `El ajuste necesita una cantidad entera distinta de 0 (como mucho ${AJUSTE_CREDITOS_DELTA_MAX}) y un motivo de al menos ${AJUSTE_NOTA_MIN} caracteres.`,
        400,
      );
    }

    try {
      const r = await ajustarCreditosEmpresa(prisma, {
        adminId,
        empresaId: p.data.id,
        ...cuerpo.data,
      });
      return apiOk({ aplicado: r.aplicado, saldo: r.saldo });
    } catch (e) {
      if (e instanceof AjusteCreditosError) {
        if (e.code === "EMPRESA_NO_EXISTE") return apiError("NOT_FOUND", e.message, 404);
        if (e.code === "SALDO_INSUFICIENTE") return apiError("SALDO_INSUFICIENTE", e.message, 409);
        return apiError("INVALID_BODY", e.message, 400);
      }
      throw e;
    }
  },
);
