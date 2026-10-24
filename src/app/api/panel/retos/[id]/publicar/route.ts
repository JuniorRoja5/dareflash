import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos/[id]/publicar — PUBLICAR un reto (DRAFT -> PUBLISHED). Su PROPIO guard
 * (`requireRole("ADMIN")`, no confía en el layout) + `mutatingRoute` (Origin/sesión/CSRF). Idempotente
 * (updateMany con status DRAFT en el WHERE). Tras publicar, `buscarRetos` ya lo encuentra (filtra
 * PUBLISHED).
 *
 * UN CIERRE YA PASADO SE RECHAZA con 409 y copy humano: publicarlo crearía un reto que el barrido
 * cierra acto seguido y que ya no se puede reabrir editando. La regla vive en `publicarReto`; aquí
 * solo se traduce a HTTP. 409 y no 400 porque el cuerpo no tiene nada malo: es el ESTADO del reto
 * el que no admite la operación ahora mismo.
 */
export const POST = mutatingRoute(
  async (_req, { prisma }, ctx: { params: Promise<{ id: string }> }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { publicarReto } = await import("@/server/services/retos-admin");

    try {
      await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para publicar retos.", 403);
    }

    const { id } = await ctx.params;
    const r = await publicarReto(prisma, id);
    if (r.estado === "rechazado") {
      return apiError(
        "CIERRE_PASADO",
        "No puedes publicar un reto cuyo cierre ya ha pasado: corrige la fecha de cierre y vuelve a intentarlo.",
        409,
      );
    }
    return apiOk({ ok: true, publicado: r.estado === "publicado" });
  },
);
