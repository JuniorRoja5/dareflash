import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos/[id]/publicar — PUBLICAR un reto (DRAFT -> PUBLISHED). Su PROPIO guard
 * (`requireRole("ADMIN")`, no confía en el layout) + `mutatingRoute` (Origin/sesión/CSRF). Idempotente
 * (updateMany con status DRAFT en el WHERE). Tras publicar, `buscarRetos` ya lo encuentra (filtra
 * PUBLISHED).
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
    const { publicado } = await publicarReto(prisma, id);
    return apiOk({ ok: true, publicado });
  },
);
