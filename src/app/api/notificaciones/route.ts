import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/server/http/api";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  cursor: z.string().max(100).optional(),
  limite: z.coerce.number().int().min(1).max(24).optional(),
});

/**
 * GET /api/notificaciones — la BANDEJA del usuario de la sesión, por páginas (keyset), más el número
 * de no-leídas para el badge. La usa el desplegable de la campana (`?limite=6`).
 *
 * Es una LECTURA y no marca nada como leído: marcar es `POST /api/notificaciones/leidas`, por
 * `mutatingRoute` y con CSRF. Un GET que cambiara estado lo dispararía cualquier prefetch o enlace.
 *
 * Solo lo del propio usuario: el `userId` sale de la SESIÓN, nunca de la petición. Sin sesión, 401.
 * `no-store`: son datos personales y cambian a cada rato.
 */
export async function GET(req: Request) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHENTICATED", "Inicia sesión para ver tus avisos.", 401);

  const url = new URL(req.url);
  const q = QuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    limite: url.searchParams.get("limite") ?? undefined,
  });
  if (!q.success) return apiError("VALIDATION", "Parámetros inválidos.", 400);

  const { prisma } = await import("@/server/db/client");
  const { contarNoLeidas, listarNotificaciones } = await import("@/server/services/notificaciones");

  const [pagina, noLeidas] = await Promise.all([
    listarNotificaciones(prisma, user.userId, {
      cursor: q.data.cursor ?? null,
      limite: q.data.limite,
    }),
    contarNoLeidas(prisma, user.userId),
  ]);

  const res = NextResponse.json({ ...pagina, noLeidas });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
