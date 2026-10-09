import { z } from "zod";

import { AJUSTE_BOOST_DELTA_MAX, AJUSTE_NOTA_MAX, AJUSTE_NOTA_MIN } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo del ajuste. QUIÉN ajusta NO va aquí: sale de la sesión, así que un `adminId` en el
 * cuerpo se ignora y nadie puede firmar un ajuste a nombre de otro.
 *
 * `clave`: una por INTENCIÓN de ajuste, generada en el panel. Un reintento de la misma —doble clic,
 * red caída a mitad— llega con la misma clave y es un no-op que responde `aplicado: false`, no un
 * error.
 */
const CuerpoSchema = z.object({
  userId: z.string().min(1).max(191),
  delta: z
    .number()
    .int()
    .refine((d) => d !== 0 && Math.abs(d) <= AJUSTE_BOOST_DELTA_MAX),
  nota: z.string().trim().min(AJUSTE_NOTA_MIN).max(AJUSTE_NOTA_MAX),
  clave: z.string().uuid(),
});

/**
 * POST /api/panel/boost/ajustar — el ADMIN regala o quita créditos de Boost con una fila NUEVA de
 * ledger (`ajustarCreditosBoost` -> `applyBoostCredits`), nunca tocando el saldo.
 *
 * EL ROL SE DERIVA DE `secciones.ts`, no se escribe "ADMIN" aquí. Es la misma razón por la que las
 * páginas del panel usan `requireSeccion`: el día que Boost cambie de rol, la nav, la página y este
 * endpoint cambian juntos. Un literal aquí sería la tercera verdad.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { rolDeRuta } = await import("@/app/panel/secciones");
  const { AjusteBoostError, ajustarCreditosBoost } = await import("@/server/services/boost-admin");

  let adminId: string;
  try {
    adminId = (await requireRole(rolDeRuta("/panel/boost"))).userId;
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para ajustar créditos de Boost.", 403);
  }

  const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "INVALID_BODY",
      `El ajuste necesita una cantidad entera distinta de 0 (como mucho ${AJUSTE_BOOST_DELTA_MAX}) y un motivo de al menos ${AJUSTE_NOTA_MIN} caracteres.`,
      400,
    );
  }

  try {
    const { userId, delta, nota, clave } = parsed.data;
    const r = await ajustarCreditosBoost(prisma, { adminId, userId, delta, nota, clave });
    return apiOk({ aplicado: r.aplicado, saldo: r.saldo });
  } catch (e) {
    if (e instanceof AjusteBoostError) {
      if (e.code === "USUARIO_NO_EXISTE") return apiError("NOT_FOUND", e.message, 404);
      if (e.code === "SALDO_NEGATIVO") return apiError("SALDO_NEGATIVO", e.message, 409);
      return apiError("INVALID_BODY", e.message, 400);
    }
    throw e;
  }
});
