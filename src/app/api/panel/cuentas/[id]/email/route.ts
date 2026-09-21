import { z } from "zod";

import { MSG_CUENTA_NO_ENCONTRADA, MSG_SIN_PERMISO_CUENTAS } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /api/panel/cuentas/[id]/email — VER el email de una cuenta, dejando rastro.
 *
 * ES UN POST AUNQUE PAREZCA UNA LECTURA, y esa es la decisión de la pieza: la petición ESCRIBE —la
 * fila de `AuditLog` que dice quién miró y a quién— antes de devolver nada, en la misma transacción.
 * Como POST, pasa por `mutatingRoute` (Origin + sesión + CSRF) como cualquier otra mutación, en vez
 * de ser un GET que cualquier página de terceros podría disparar desde el navegador del moderador.
 *
 * El email NO viaja en el listado ni en la ficha: hay que pedirlo, de uno en uno. Lo que convierte
 * eso en una garantía y no en una costumbre es que sea el servicio el que anota (`emailDeCuenta`),
 * no esta ruta: no hay forma de obtener la dirección por un camino que no escriba el rastro.
 *
 * Guard `requireRole("MODERATOR")`: es la sección de Usuarios, y el administrador lo cumple por
 * jerarquía. Una cuenta borrada devuelve 404 igual que una inexistente.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { emailDeCuenta } = await import("@/server/services/cuentas-panel");

    let actor;
    try {
      actor = await requireRole("MODERATOR");
    } catch {
      return apiError("FORBIDDEN", MSG_SIN_PERMISO_CUENTAS, 403);
    }

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_CUENTA_NO_ENCONTRADA, 404);

    const r = await emailDeCuenta(prisma, { actorId: actor.userId, userId: parsed.data.id });
    if (r.estado === "rechazado") return apiError("NOT_FOUND", MSG_CUENTA_NO_ENCONTRADA, 404);

    return apiOk({ ok: true, email: r.email });
  },
);
