import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** `cursor` es OPACO: lo produce el servicio y se devuelve tal cual. */
const QuerySchema = z.object({
  userId: z.string().min(1).max(191),
  cursor: z.string().min(1).max(300).optional(),
});

/**
 * GET /api/panel/dareup/historial?userId=&cursor= — página siguiente del historial de puntos del
 * inspector DareUp, por KEYSET. Es LECTURA, así que no pasa por `mutatingRoute`; pero es del admin, y
 * el layout del panel no cubre endpoints: se protege con su propio `requireRole("ADMIN")`.
 */
export async function GET(req: Request) {
  const { requireRole } = await import("@/server/auth/rbac");
  try {
    await requireRole("ADMIN");
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para ver el historial de puntos.", 403);
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    userId: url.searchParams.get("userId") ?? "",
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return apiError("INVALID_QUERY", "Petición no válida.", 400);

  const { prisma } = await depsRuta();
  const { historialPuntos } = await import("@/server/services/dareup-admin");
  const pagina = await historialPuntos(prisma, parsed.data.userId, {
    cursor: parsed.data.cursor ?? null,
  });
  return apiOk({ items: pagina.items, nextCursor: pagina.nextCursor });
}
