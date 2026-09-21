import { z } from "zod";

import {
  MSG_DENUNCIA_GRACIAS,
  MSG_DENUNCIA_NO_DISPONIBLE,
  MSG_DENUNCIA_PROPIO,
  MSG_DENUNCIA_SIN_VERIFICAR,
  MSG_DENUNCIA_YA,
  RATE_LIMITS,
  ReportReasonSchema,
  ReportTargetDenunciableSchema,
} from "@/config/constants";
import { veredictoDenuncia } from "@/lib/denuncias";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo se valida contra las UNIONES, no contra strings: un `targetType` que el servidor no sabe
 * resolver, o un motivo inventado, se rechazan aquí y no llegan a la tabla.
 */
const CuerpoSchema = z.object({
  targetType: ReportTargetDenunciableSchema,
  targetId: z.string().min(1).max(64),
  reason: ReportReasonSchema,
});

/**
 * POST /api/denuncias — REGISTRAR una denuncia. `mutatingRoute` (Origin/sesión/CSRF) y la barrera de
 * email verificado, la misma que votar o comentar.
 *
 * El denunciante sale de la SESIÓN, nunca del cuerpo. Quién es el dueño del objeto lo resuelve el
 * servicio contra la fila real (`denunciar`), que es el punto único de creación: esta ruta no sabe
 * denunciar, solo traduce el resultado a copy humano.
 *
 * DENUNCIAR DOS VECES LO MISMO NO ES UN ERROR: responde 200 con "ya nos habías avisado". Un 409 aquí
 * sería castigar a quien hace lo correcto por segunda vez.
 */
export const POST = mutatingRoute(async (req, { user, env, prisma }) => {
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { denunciar } = await import("@/server/services/denuncias");

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "Elige un motivo para denunciar.", 400);

  // La MISMA regla que decide si el botón se ofrece (`veredictoDenuncia`). `esMio` va en false porque
  // de quién es el objeto no se cree al cliente: lo comprueba el servicio contra la fila.
  if (
    veredictoDenuncia({
      haySesion: true,
      emailVerificado: user.emailVerified !== null,
      esMio: false,
    }) === "sin_verificar"
  ) {
    return apiError("EMAIL_SIN_VERIFICAR", MSG_DENUNCIA_SIN_VERIFICAR, 403);
  }

  const rl = await rateLimit(prisma, {
    key: `denuncia:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
    ...RATE_LIMITS.DENUNCIAR_PER_USER,
  });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Estás denunciando muy seguido. Espera un momento.", 429);
  }

  const r = await denunciar(prisma, {
    reporterId: user.userId,
    targetType: cuerpo.data.targetType,
    targetId: cuerpo.data.targetId,
    reason: cuerpo.data.reason,
  });

  if (r.estado === "rechazada") {
    return r.motivo === "PROPIO"
      ? apiError("DENUNCIA_PROPIA", MSG_DENUNCIA_PROPIO, 400)
      : apiError("NOT_FOUND", MSG_DENUNCIA_NO_DISPONIBLE, 404);
  }
  return r.estado === "registrada"
    ? apiOk({ mensaje: MSG_DENUNCIA_GRACIAS }, 201)
    : apiOk({ mensaje: MSG_DENUNCIA_YA });
});
