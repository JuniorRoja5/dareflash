import { z } from "zod";

import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta: un id absurdo -> 404 sin tocar la BD. */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /api/participaciones/[id]/visto — el reproductor avisa de que el usuario lleva ya unos
 * segundos (`VISTO_SEGUNDOS_MINIMOS`) reproduciendo esta participación. Deja una marca efímera que la
 * ruta de voto exigirá antes de aceptar el voto.
 *
 * SESIÓN OBLIGATORIA: la da `mutatingRoute` (Origin -> sesión -> CSRF). Solo marca quien ha iniciado
 * sesión, porque la marca es POR USUARIO y solo un usuario con sesión puede votar después. Un invitado
 * que llame aquí recibe 401 y no deja rastro.
 *
 * ES UNA MUTACIÓN aunque solo escriba en una caché: crea estado del lado del servidor a nombre del
 * usuario, así que pasa por el mismo envoltorio que el resto (y por eso `tests/route-csrf` no la deja
 * escapar).
 *
 * NO VERIFICA que el vídeo se haya reproducido de verdad — no se puede: la llamada la hace el cliente.
 * Es fricción deliberada y spoofeable; ver `services/visto.ts`.
 *
 * Responde 204-como-200 vacío (`{ ok: true }`) también cuando ya estaba marcada: es idempotente por
 * naturaleza (volver a marcar solo renueva el TTL).
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user, env, prisma }, { params }) => {
    const { marcarVisto } = await import("@/server/services/visto");
    const { rateLimit } = await import("@/server/security/rate-limit");
    const { RATE_LIMITS } = await import("@/config/constants");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);

    // Cubo por USUARIO (no por IP): la marca es por usuario y la sesión ya está resuelta. Generoso,
    // porque bajar por el feed la dispara muchas veces de forma legítima.
    const rl = await rateLimit(prisma, {
      key: `visto:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
      ...RATE_LIMITS.VISTO_PER_USER,
    });
    if (!rl.allowed) {
      return apiError("RATE_LIMITED", "Demasiadas peticiones. Inténtalo en un momento.", 429);
    }

    const r = await marcarVisto(prisma, {
      userId: user.userId,
      submissionId: parsed.data.id,
    });

    // Inexistente y no-publicada dan el MISMO 404: una participación que no se ve públicamente no
    // tiene por qué revelar que existe (mismo criterio que el resto de la API).
    if (!r.marcado) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    return apiOk({ ok: true });
  },
);
