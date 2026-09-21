import { NextResponse } from "next/server";
import { z } from "zod";

import { COLA_MODERACION_PAGINA, MSG_SIN_PERMISO_COLA } from "@/config/constants";
import { apiError } from "@/server/http/api";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  /** Acota la cola a un reto (la ficha del panel del reto usa el MISMO servicio). */
  reto: z.string().min(1).max(64).optional(),
});

/**
 * GET /api/panel/moderacion?cursor=&reto= — la página siguiente de la cola.
 *
 * LECTURA, pero de moderación: su PROPIO `requireRole("MODERATOR")` (el layout no cubre endpoints, y
 * el administrador lo cumple por jerarquía). Nunca `requireRole("ADMIN")`: esto es el trabajo del
 * moderador, no del administrador.
 *
 * Devuelve lo mismo que pinta la primera página del servidor, así que la lista se alarga sin cambiar
 * de forma. `no-store`: es una cola que cambia sola.
 */
export async function GET(req: Request) {
  const { requireRole } = await import("@/server/auth/rbac");
  const { prisma } = await import("@/server/db/client");
  const { listarColaModeracion } = await import("@/server/services/cola-moderacion");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  try {
    await requireRole("MODERATOR");
  } catch {
    return apiError("FORBIDDEN", MSG_SIN_PERMISO_COLA, 403);
  }

  const url = new URL(req.url);
  const q = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    reto: url.searchParams.get("reto") ?? undefined,
  });
  if (!q.success) return apiError("BAD_REQUEST", "Parámetros inválidos.", 400);

  const pagina = await listarColaModeracion(prisma, {
    cursor: q.data.cursor ?? null,
    challengeId: q.data.reto ?? null,
    limite: COLA_MODERACION_PAGINA,
    firmar: firmarReproduccion,
  });

  const res = NextResponse.json(pagina);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
