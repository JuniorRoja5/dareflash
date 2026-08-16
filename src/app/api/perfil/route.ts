import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * Actualiza el PERFIL del DUEÑO de la sesión (hoy: el nombre visible). Pasa por `mutatingRoute`
 * (Origin + sesión + CSRF): rechaza al anónimo (401) y a quien no traiga un CSRF atado a SU sesión
 * (403). La autorización es por CONSTRUCCIÓN: se escribe con `user.userId` de la sesión, NUNCA con
 * un id del cuerpo -> nadie edita el perfil de otro. El servidor RE-valida con Zod (el cliente solo
 * hace UX). Rate-limit por usuario para que el guardado no sea un amplificador de escrituras.
 */
export const PATCH = mutatingRoute(async (req, { user, env, prisma }) => {
  const { RATE_LIMITS } = await import("@/config/constants");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { actualizarPerfilSchema, actualizarPerfil } = await import("@/server/services/perfil");

  const rlKey = `updateprofile:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`;
  const rl = await rateLimit(prisma, { key: rlKey, ...RATE_LIMITS.UPDATE_PROFILE_PER_USER });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Has guardado muchas veces seguidas. Espera un momento.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "No hemos podido leer los datos. Inténtalo de nuevo.", 400);
  }
  const parsed = actualizarPerfilSchema.safeParse(body);
  if (!parsed.success) {
    // Un solo mensaje humano (el primer problema); el detalle por campo lo cubre la UI antes de enviar.
    const primero = parsed.error.issues[0]?.message ?? "Revisa el nombre.";
    return apiError("VALIDATION", primero, 400);
  }

  // userId de la SESIÓN, jamás del cuerpo: la actualización solo puede tocar la propia fila.
  const { displayName } = await actualizarPerfil(prisma, user.userId, parsed.data);
  return apiOk({ ok: true, displayName });
});
