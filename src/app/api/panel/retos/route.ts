import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos — CREAR un reto (queda DRAFT). Se protege A SÍ MISMO (no confía en el guard del
 * layout del panel): pasa por `mutatingRoute` (Origin + sesión + CSRF) y exige ADMIN con
 * `requireRole("ADMIN")` (helper canónico; nada de `role === "ADMIN"` a mano). Valida con Zod;
 * `createdById` = admin de la SESIÓN, jamás del cuerpo.
 *
 * ADMIN-ONLY (decisión de producto, cerrada: los usuarios NUNCA crean retos). Por eso el gate es
 * `requireRole("ADMIN")` a secas. NO se consulta el flag por-usuario de M3 (`usuarioPuedeCrearRetos`):
 * con `requireRole("ADMIN")` delante sería INERTE y engañoso (parecería que un grant a un no-admin
 * funciona, y no puede). Si algún día se quisieran creadores no-admin, se RELAJA este `requireRole` y
 * se pasa la decisión a `usuarioPuedeCrearRetos` (su fuente única).
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { crearRetoSchema, crearRetoAdmin } = await import("@/server/services/retos-admin");

  let admin;
  try {
    admin = await requireRole("ADMIN");
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para crear retos.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "No hemos podido leer los datos. Inténtalo de nuevo.", 400);
  }
  const parsed = crearRetoSchema(new Date()).safeParse(body);
  if (!parsed.success) {
    return apiError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Revisa los datos del reto.",
      400,
    );
  }

  const reto = await crearRetoAdmin(prisma, admin.userId, parsed.data);
  return apiOk({ ok: true, id: reto.id, publicCode: reto.publicCode });
});
