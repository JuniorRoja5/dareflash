import { z } from "zod";

import { AJUSTE_DELTA_MAX, AJUSTE_NOTA_MAX, AJUSTE_NOTA_MIN } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo del ajuste. QUIÉN ajusta NO va aquí: sale de la sesión. Un campo `adminId` en el cuerpo se
 * ignora, así que un admin no puede firmar un ajuste a nombre de otro.
 *
 * `clave`: una por INTENCIÓN de ajuste, generada en el panel. Un reintento de la misma (doble clic, red
 * caída a mitad) llega con la misma clave y es un no-op, que responde `aplicado: false`, no un error.
 */
const CuerpoSchema = z.object({
  userId: z.string().min(1).max(191),
  delta: z
    .number()
    .int()
    .refine((d) => d !== 0 && Math.abs(d) <= AJUSTE_DELTA_MAX),
  nota: z.string().trim().min(AJUSTE_NOTA_MIN).max(AJUSTE_NOTA_MAX),
  clave: z.string().uuid(),
});

/**
 * POST /api/panel/dareup/ajustar — el ADMIN ajusta los puntos de un usuario con una fila NUEVA de
 * ledger (`ajustarPuntos` -> `applyPoints`), nunca tocando el saldo. Su PROPIO guard
 * (`requireRole("ADMIN")`: el layout del panel no cubre endpoints) + `mutatingRoute`
 * (Origin/sesión/CSRF).
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { AjusteError, ajustarPuntos } = await import("@/server/services/dareup-admin");

  let adminId: string;
  try {
    adminId = (await requireRole("ADMIN")).userId;
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para ajustar puntos.", 403);
  }

  const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "INVALID_BODY",
      `El ajuste necesita una cantidad entera distinta de 0 (como mucho ${AJUSTE_DELTA_MAX}) y un motivo de al menos ${AJUSTE_NOTA_MIN} caracteres.`,
      400,
    );
  }

  try {
    const { userId, delta, nota, clave } = parsed.data;
    const r = await ajustarPuntos(prisma, { adminId, userId, delta, nota, clave });
    return apiOk({ aplicado: r.aplicado, saldo: r.saldo });
  } catch (e) {
    if (e instanceof AjusteError) {
      if (e.code === "USUARIO_NO_EXISTE") return apiError("NOT_FOUND", e.message, 404);
      if (e.code === "SALDO_NEGATIVO") return apiError("SALDO_NEGATIVO", e.message, 409);
      return apiError("INVALID_BODY", e.message, 400);
    }
    throw e;
  }
});
