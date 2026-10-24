import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/** Cada rechazo con su copy: el admin tiene que saber QUÉ hacer, no solo que no se pudo. */
const COPY: Record<string, { mensaje: string; http: number }> = {
  NO_CERRADO: { mensaje: "Ese reto no está cerrado: no hay nada que reabrir.", http: 404 },
  CON_RESULTADOS: {
    mensaje:
      "Ese reto ya tiene ganador: el premio y los puntos están dados y no se pueden deshacer. Crea un reto nuevo.",
    http: 409,
  },
  EMPATE_PENDIENTE: {
    mensaje:
      "Ese reto está esperando a que resuelvas un empate. Resuélvelo desde su ficha en vez de reabrirlo.",
    http: 409,
  },
  CIERRE_PASADO: {
    mensaje:
      "Su cierre sigue en el pasado, así que volvería a cerrarse al instante. Edita primero las fechas y reabre después.",
    http: 409,
  },
};

/**
 * POST /api/panel/retos/[id]/reabrir — devuelve a la vida un reto que cerró SIN otorgar nada.
 *
 * ┌─ POR QUÉ ES UNA ACCIÓN PROPIA Y NO UN EFECTO DE EDITAR ───────────────────────────────────┐
 * │ Lo barato habría sido que editar las fechas reabriera el reto solo. Y habría reabierto      │
 * │ también uno que ya escribió sus `ChallengeResult`, dio los puntos del top-20 y acreditó el  │
 * │ premio en un monedero — por tocar un typo del título. Un efecto colateral silencioso en la  │
 * │ edición, justo sobre la contabilidad. Así que es explícita, se pide a propósito, y el        │
 * │ servicio comprueba que no haya nada que deshacer.                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE AUDITA, como el resto de lo que un admin hace sobre un reto ajeno al flujo normal: devolver un
 * reto cerrado al estado publicado es una decisión que alguien tomó, y tiene que constar quién.
 *
 * Su PROPIO guard (`requireRole("ADMIN")`, no confía en el layout) + `mutatingRoute`.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { getCurrentUser } = await import("@/server/auth/current-user");
    const { reabrirReto } = await import("@/server/services/retos-admin");

    try {
      await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para reabrir retos.", 403);
    }
    const admin = await getCurrentUser();
    if (!admin) return apiError("FORBIDDEN", "No tienes permiso para reabrir retos.", 403);

    const { id } = await params;
    const r = await reabrirReto(prisma, id);

    if (r.estado === "rechazado") {
      const copy = COPY[r.motivo] ?? { mensaje: "No se puede reabrir ese reto.", http: 409 };
      return apiError(r.motivo, copy.mensaje, copy.http);
    }

    // DESPUÉS de reabrir y antes de responder: si la traza fallara, el reto ya está reabierto y el
    // registro tiene que reflejarlo igual. (Al revés que en los export, donde lo que no puede
    // pasar es entregar los datos sin dejar rastro.)
    await prisma.auditLog.create({
      data: {
        actorId: admin.userId,
        action: "CHALLENGE_REOPEN",
        targetType: "CHALLENGE",
        targetId: id,
      },
    });

    return apiOk({ ok: true });
  },
);
