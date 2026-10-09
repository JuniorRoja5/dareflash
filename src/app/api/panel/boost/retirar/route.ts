import { z } from "zod";

import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo. SOLO LA PERSONA, y eso es deliberado: no se acepta un id de aparición.
 *
 * Si esta ruta recibiera "qué fila cortar", el panel mandaría la que está pintando y quien encadenó
 * dos boosts se quedaría con la otra viva — el moderador creería haberlo retirado y el perfil
 * seguiría en la portada, sin que nada fallara. Al no existir el parámetro, ese error no se puede
 * cometer desde aquí (ver `retirarDelEscaparate`).
 */
const CuerpoSchema = z.object({ userId: z.string().min(1).max(191) });

/**
 * POST /api/panel/boost/retirar — saca a una persona del espacio destacado expirando TODAS sus
 * apariciones vigentes.
 *
 * EL ROL SE DERIVA DE `secciones.ts`: ver la ruta hermana de ajustar.
 *
 * NO MUEVE EL SALDO: retirar no devuelve el Boost gastado. Cortar por abuso no regala crédito, y si
 * algún día hay que devolverlo será un `REFUND` explícito, no un efecto escondido aquí.
 *
 * ES IDEMPOTENTE POR NATURALEZA: retirar a quien no tiene apariciones vigentes expira cero y
 * responde 200. No hace falta clave de intención — repetir la acción no puede hacer nada dos veces.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { rolDeRuta } = await import("@/app/panel/secciones");
  const { retirarDelEscaparate } = await import("@/server/services/boost-admin");

  try {
    await requireRole(rolDeRuta("/panel/boost"));
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para retirar perfiles destacados.", 403);
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("INVALID_BODY", "Falta el usuario.", 400);

  const r = await retirarDelEscaparate(prisma, cuerpo.data.userId);
  // CUÁNTAS se expiraron, para poder confirmárselo a quien lo hizo: "retirado" sin número no dice
  // si había una aparición o tres, que es justo lo que esta acción resuelve.
  return apiOk({ expiradas: r.expiradas });
});
