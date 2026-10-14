import { z } from "zod";

import { AJUSTE_NOTA_MAX, AJUSTE_NOTA_MIN, AJUSTE_SALDO_CENTS_MAX } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo del ajuste. QUIÉN ajusta NO va aquí: sale de la sesión, así que un `adminId` en el
 * cuerpo se ignora y nadie puede firmar un movimiento de dinero a nombre de otro.
 *
 * `clave`: una por INTENCIÓN de ajuste, generada en el panel. Un reintento de la misma —doble clic,
 * red caída a mitad— llega con la misma clave y es un no-op que responde `aplicado: false`, no un
 * error. En dinero eso no es comodidad: es lo que impide que un doble clic acredite dos veces.
 */
const CuerpoSchema = z.object({
  userId: z.string().min(1).max(191),
  deltaCents: z
    .number()
    .int()
    .refine((d) => d !== 0 && Math.abs(d) <= AJUSTE_SALDO_CENTS_MAX),
  nota: z.string().trim().min(AJUSTE_NOTA_MIN).max(AJUSTE_NOTA_MAX),
  clave: z.string().uuid(),
});

/**
 * POST /api/panel/monedero/ajustar — el ADMIN acredita o debita el saldo del monedero de alguien,
 * con una fila NUEVA de ledger (`ajustarSaldoMonedero` -> `applyWallet`), nunca tocando el saldo a
 * mano.
 *
 * EL ROL SE DERIVA DE `secciones.ts`, no se escribe "ADMIN" aquí. Es la misma razón por la que las
 * páginas del panel usan `requireSeccion`: el día que el monedero cambie de rol, la nav, la página
 * y este endpoint cambian juntos. Un literal aquí sería la tercera verdad — y la que decide sobre
 * dinero.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { rolDeRuta } = await import("@/app/panel/secciones");
  const { AjusteSaldoError, ajustarSaldoMonedero } =
    await import("@/server/services/monedero-admin");

  let adminId: string;
  try {
    adminId = (await requireRole(rolDeRuta("/panel/monedero"))).userId;
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para ajustar el saldo de un monedero.", 403);
  }

  const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "INVALID_BODY",
      `El ajuste necesita un importe entero de céntimos distinto de 0 (como mucho ${AJUSTE_SALDO_CENTS_MAX}) y un motivo de al menos ${AJUSTE_NOTA_MIN} caracteres.`,
      400,
    );
  }

  try {
    const { userId, deltaCents, nota, clave } = parsed.data;
    const r = await ajustarSaldoMonedero(prisma, { adminId, userId, deltaCents, nota, clave });
    return apiOk({ aplicado: r.aplicado, saldoCents: r.saldoCents });
  } catch (e) {
    if (e instanceof AjusteSaldoError) {
      if (e.code === "USUARIO_NO_EXISTE") return apiError("NOT_FOUND", e.message, 404);
      if (e.code === "SALDO_NEGATIVO") return apiError("SALDO_NEGATIVO", e.message, 409);
      return apiError("INVALID_BODY", e.message, 400);
    }
    throw e;
  }
});
