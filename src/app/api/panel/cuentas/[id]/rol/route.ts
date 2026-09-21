import { z } from "zod";

import {
  MSG_CUENTA_NO_ENCONTRADA,
  MSG_ROL_INVALIDO,
  MSG_ROL_NO_PERMITIDO,
  MSG_SIN_PERMISO_ROLES,
} from "@/config/constants";
import { ROLES_ASIGNABLES } from "@/lib/permisos";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * El rol pedido se valida contra los ASIGNABLES, no contra el enum entero: `ADMIN` ni siquiera es
 * expresable por la API, así que no hay manera de acuñar un segundo superadmin por aquí. El único
 * camino a ADMIN sigue siendo `scripts/create-admin.ts`.
 */
const CuerpoSchema = z.object({ rol: z.enum(ROLES_ASIGNABLES) });

/**
 * POST /api/panel/cuentas/[id]/rol — el SUPERADMIN nombra (o retira) a un moderador.
 *
 * Su PROPIO guard `requireRole("ADMIN")`, que no es negociable: nombrar rol NO es una acción de
 * moderación, y un moderador no se fabrica compañeros. `mutatingRoute` pone Origin/sesión/CSRF.
 *
 * El rol del ACTOR sale de la sesión que devuelve el guard, y el del DESTINO lo lee el servicio de su
 * fila: la regla (`puedeAsignarRol`) nunca se aplica sobre lo que diga el cliente. Idempotente: pedir
 * el rol que ya tiene no cambia nada ni le revoca las sesiones.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { asignarRol } = await import("@/server/services/gobierno-cuentas");

    let actor;
    try {
      actor = await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", MSG_SIN_PERMISO_ROLES, 403);
    }

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_CUENTA_NO_ENCONTRADA, 404);
    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success) return apiError("VALIDATION", MSG_ROL_INVALIDO, 400);

    const r = await asignarRol(prisma, {
      actorId: actor.userId,
      rolActor: actor.role,
      userId: parsed.data.id,
      rolPedido: cuerpo.data.rol,
    });

    if (r.estado === "rechazado") {
      return r.motivo === "NO_ENCONTRADA"
        ? apiError("NOT_FOUND", MSG_CUENTA_NO_ENCONTRADA, 404)
        : apiError("FORBIDDEN", MSG_ROL_NO_PERMITIDO, 403);
    }
    return apiOk({ ok: true, cambiado: r.estado === "hecho" });
  },
);
