import { z } from "zod";

import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo: QUÉ retirada y A DÓNDE va. QUIÉN la mueve NO viene aquí — sale de la sesión, así que
 * nadie puede firmar una transición a nombre de otro admin.
 *
 * El estado destino se acota a la unión cerrada: un `status` libre dejaría escribir cualquier cosa
 * en la columna y la máquina de estados pasaría a ser una sugerencia.
 */
const CuerpoSchema = z.object({
  retiradaId: z.string().min(1).max(191),
  hasta: z.enum(["APPROVED", "PROCESSING", "PAID", "REJECTED"]),
});

/** El copy del rechazo. Lo que el admin puede hacer algo con, nunca el código. */
const MENSAJE: Record<string, string> = {
  NO_EXISTE: "Esa retirada ya no está.",
  TRANSICION_INVALIDA:
    "Esa retirada ya no está en ese estado. Recarga la lista para ver dónde está ahora.",
};

/**
 * POST /api/panel/monedero/transicion — mueve una retirada por su máquina de estados.
 *
 * EL ROL SE DERIVA DE `secciones.ts` (`rolDeRuta`), como en el resto del panel: no hay un "ADMIN"
 * escrito aquí que pueda discrepar de lo que dice la navegación. Es dinero, así que es del
 * administrador y un moderador no pasa.
 *
 * NO HACE FALTA CLAVE DE INTENCIÓN. La máquina de estados ya hace idempotente el doble clic: la
 * segunda vez, la retirada ya no está en el estado de partida y la transición se rechaza. Y el
 * reembolso, además, lleva su propia clave derivada de la retirada.
 *
 * LOS DATOS DE PAGO NO VUELVEN EN LA RESPUESTA. El panel ya los tiene de la lista; repetirlos aquí
 * sería un sitio más por el que viaja un IBAN, a cambio de nada.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { rolDeRuta } = await import("@/app/panel/secciones");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { transicionarRetirada } = await import("@/server/services/retirada-admin");

  try {
    await requireRole(rolDeRuta("/panel/monedero"));
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para gestionar retiradas.", 403);
  }
  const admin = await getCurrentUser();
  if (!admin) return apiError("FORBIDDEN", "No tienes permiso para gestionar retiradas.", 403);

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("INVALID_BODY", "Falta la retirada o el estado.", 400);

  const r = await transicionarRetirada(prisma, {
    retiradaId: cuerpo.data.retiradaId,
    adminId: admin.userId,
    hasta: cuerpo.data.hasta,
  });

  if (!r.ok) {
    const mensaje = MENSAJE[r.rechazo ?? ""] ?? "No hemos podido mover esa retirada.";
    // 409 y no 400: el cuerpo era válido; lo que no cuadra es el ESTADO de la retirada.
    return apiError(r.rechazo ?? "RECHAZO", mensaje, 409);
  }

  // CUÁNTO se devolvió, para poder confirmárselo a quien lo hizo: "rechazada" sin número no dice si
  // el dinero volvió al monedero, que es justo lo que importa de rechazar.
  return apiOk({ estado: r.estado, devueltoCents: r.devueltoCents });
});
