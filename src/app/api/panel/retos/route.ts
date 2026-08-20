import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos — CREAR un reto (queda DRAFT). Se protege A SÍ MISMO (no confía en el guard del
 * layout del panel): pasa por `mutatingRoute` (Origin + sesión + CSRF) y ADEMÁS exige rol y capacidad
 * con `requireRole("ADMIN")` + `usuarioPuedeCrearRetos` (fuente única de la decisión; nada de
 * `role === "ADMIN"` a mano). Valida con Zod; `createdById` = admin de la SESIÓN, jamás del cuerpo.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { usuarioPuedeCrearRetos } = await import("@/lib/permisos");
  const { crearRetoSchema, crearRetoAdmin } = await import("@/server/services/retos-admin");

  // Guard del WRITE: ADMIN verificado (requireRole) + capacidad (helper único). No revela detalles.
  let admin;
  try {
    admin = await requireRole("ADMIN");
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para crear retos.", 403);
  }
  const fila = await prisma.user.findUnique({
    where: { id: admin.userId },
    select: { role: true, puedeCrearRetos: true },
  });
  if (!fila || !usuarioPuedeCrearRetos(fila)) {
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
