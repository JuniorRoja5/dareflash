import { z } from "zod";

import {
  MSG_TOQUE_A_TI_MISMO,
  MSG_TOQUE_ENVIADO,
  MSG_TOQUE_LIMITE_DIARIO,
  MSG_TOQUE_REPETIDO,
  MSG_TOQUE_SIN_VERIFICAR,
  MSG_TOQUE_SOLO_VIP,
  RATE_LIMITS,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** A QUIÉN se toca. Quién toca NO va aquí: sale de la sesión, así que nadie toca en nombre de otro. */
const CuerpoSchema = z.object({ userId: z.string().min(1).max(191) });

/**
 * POST /api/toques — un VIP activo da un toque a otro perfil.
 *
 * `mutatingRoute` (Origin / sesión / CSRF) + EMAIL VERIFICADO, la misma barrera antifraude que
 * votar o comentar: un toque llega a la bandeja de otra persona, así que pide la misma puerta que
 * todo lo que tiene efectos hacia fuera.
 *
 * ┌─ EL SERVIDOR NO SE FÍA DE QUE EL BOTÓN NO ESTÉ ─────────────────────────────────────────────┐
 * │ La UI solo le enseña el botón a un VIP, pero eso es comodidad, no seguridad: el endpoint es  │
 * │ público y un `curl` no mira la UI. El gate de verdad está en `darToque`, por el chokepoint.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIEMPRE 200 EN LOS CASOS DE USO, como la activación de Boost: "ya le tocaste hoy" y "has llegado
 * al tope" no son errores del sistema, son respuestas con su copy. Lo que sí es 4xx: un cuerpo
 * inválido, una sesión sin verificar y no ser VIP (403, porque es una puerta cerrada, no un
 * resultado).
 */
export const POST = mutatingRoute(async (req, { prisma, user }) => {
  const { AuthError, requireVerifiedUser } = await import("@/server/auth/rbac");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { darToque } = await import("@/server/services/toque");

  try {
    await requireVerifiedUser();
  } catch (e) {
    if (e instanceof AuthError) {
      return apiError("EMAIL_SIN_VERIFICAR", MSG_TOQUE_SIN_VERIFICAR, 403);
    }
    throw e;
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "No hemos podido procesar la petición.", 400);

  // EL CUBO VA ANTES DE ESCRIBIR y cuenta SIEMPRE (también cuando bloquea), así que una ráfaga no
  // lo reinicia. Es el tope de PRODUCTO contra usar el toque como megáfono: cuántas personas
  // distintas al día. Lo otro —no tocar dos veces a la misma— lo fuerza la clave única del aviso.
  const rl = await rateLimit(prisma, {
    key: `toque:user:${user.userId}`,
    ...RATE_LIMITS.TOQUE_PER_USER,
  });
  if (!rl.allowed) return apiOk({ estado: "limite", mensaje: MSG_TOQUE_LIMITE_DIARIO });

  const r = await darToque(prisma, {
    emisorId: user.userId,
    receptorId: cuerpo.data.userId,
  });

  switch (r.estado) {
    case "no-vip":
      return apiError("SOLO_VIP", MSG_TOQUE_SOLO_VIP, 403);
    case "a-ti-mismo":
      return apiError("VALIDATION", MSG_TOQUE_A_TI_MISMO, 400);
    // Mismo 404 que cualquier recurso ajeno que no se ve: no se revela si el id existe.
    case "no-disponible":
      return apiError("NO_DISPONIBLE", "Ese perfil no está disponible.", 404);
    case "repetido":
      return apiOk({ estado: r.estado, mensaje: MSG_TOQUE_REPETIDO });
    case "enviado":
      return apiOk({ estado: r.estado, mensaje: MSG_TOQUE_ENVIADO });
  }
});
