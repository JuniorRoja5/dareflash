import { z } from "zod";

import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * Las participaciones EN DISPUTA que el admin ordena, de la más premiada a la menos. NO es la lista
 * completa de ganadores: los que ganaron limpio por encima del empate no viajan en el cuerpo, para que
 * no exista siquiera la posibilidad de reordenarlos desde fuera.
 */
const CuerpoSchema = z.object({
  elegidas: z.array(z.string().min(1).max(64)).min(1).max(50),
});

/** Copy humano de cada rechazo. El admin lee el motivo, nunca el código. */
const COPY_RECHAZO: Record<string, string> = {
  NO_ESPERA: "Este reto no está esperando ninguna decisión. Puede que ya se haya resuelto.",
  SIN_EMPATE: "Ya no hay empate que resolver en este reto.",
  CANTIDAD: "Elige exactamente tantas participaciones como plazas de premio quedan.",
  LIMPIOS_ALTERADOS:
    "Esa participación ya había ganado por votos: su posición no está en discusión y no se puede cambiar.",
  FUERA_DEL_GRUPO:
    "Solo puedes ordenar las participaciones que empataron. Una con menos votos no puede ganar.",
  REPETIDA: "Has elegido la misma participación dos veces.",
};

/**
 * POST /api/panel/retos/[id]/resolver-empate — el ADMIN rompe un empate en la línea del premio.
 *
 * Es una acción CON EFECTOS DE DINERO: escribe los `ChallengeResult` (con el premio congelado) y
 * dispara el otorgamiento de puntos. Por eso pasa por `mutatingRoute` (Origin/sesión/CSRF) y lleva su
 * PROPIO `requireRole("ADMIN")`, sin fiarse del layout del panel.
 *
 * La autoridad de QUÉ es admisible NO está aquí ni en la UI: está en `validarResolucionEmpate`, que
 * recalcula el orden congelado y solo admite ordenar DENTRO del grupo empatado. El admin rompe el
 * empate; no anula los votos. Si la elección no es válida, se devuelve el motivo real —nunca un éxito
 * fingido— para que el panel pueda decir la verdad.
 *
 * Idempotente por construcción: reinvocar sobre un reto ya resuelto cae en `NO_ESPERA` (el motivo ya
 * no es EMPATE_PENDIENTE) y no otorga nada dos veces.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { resolverEmpate } = await import("@/server/services/cierre-reto");

    try {
      await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para resolver empates.", 403);
    }

    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success) {
      return apiError("INVALID_BODY", "Elige qué participación gana antes de confirmar.", 400);
    }

    const { id } = await params;
    const r = await resolverEmpate(prisma, id, cuerpo.data.elegidas);
    if (!r.resuelto) {
      const motivo = r.rechazo ?? "NO_ESPERA";
      return apiError(
        "RESOLUCION_RECHAZADA",
        COPY_RECHAZO[motivo] ?? "No se pudo resolver el empate.",
        409,
      );
    }
    return apiOk({ ok: true, ganadores: r.ganadores });
  },
);
