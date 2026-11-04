import { z } from "zod";

import { MSG_EMPRESA_NO_ENCONTRADA, MSG_SIN_PERMISO_EMPRESAS } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * POST /api/panel/empresas/[id]/fiscal — VER la identificación fiscal de una empresa, dejando rastro.
 *
 * ES UN POST AUNQUE PAREZCA UNA LECTURA, igual que el correo de una cuenta en `/panel/usuarios` y
 * por lo mismo: la petición ESCRIBE —la fila de `AuditLog` que dice quién miró y a quién— antes de
 * devolver nada, en la misma transacción. Como POST pasa por `mutatingRoute` (Origin + sesión +
 * CSRF) en vez de ser un GET que cualquier página de terceros podría disparar desde el navegador
 * del admin.
 *
 * El dato NO viaja en el listado ni en la ficha: hay que pedirlo. Lo que convierte eso en una
 * garantía y no en una costumbre es que ANOTE EL SERVICIO (`fiscalDeEmpresa`) y no esta ruta: no
 * hay forma de obtener el valor por un camino que no escriba el rastro.
 *
 * Guard `requireRole("ADMIN")`, como verificar y rechazar: en una marca personal esto es el
 * documento de una persona.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { fiscalDeEmpresa } = await import("@/server/services/empresas");

    let actor;
    try {
      actor = await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", MSG_SIN_PERMISO_EMPRESAS, 403);
    }

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_EMPRESA_NO_ENCONTRADA, 404);

    const r = await fiscalDeEmpresa(prisma, {
      actorId: actor.userId,
      empresaId: parsed.data.id,
    });
    if (r.estado === "rechazado") return apiError("NOT_FOUND", MSG_EMPRESA_NO_ENCONTRADA, 404);

    return apiOk({ ok: true, fiscalId: r.fiscalId, fiscalPaisIso: r.fiscalPaisIso });
  },
);
