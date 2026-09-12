import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/panel/notificaciones?usuario=&tipo=&desde=&hasta=&cursor= — página siguiente del
 * INSPECTOR de notificaciones (todas las cuentas, solo lectura, keyset). Del admin: su propio
 * `requireRole("ADMIN")`. Los filtros que no validan se ignoran, como en la página.
 *
 * No devuelve `refId` ni `refType` ni `datos`: en un voto, la clave lleva dentro al votante.
 */
export async function GET(req: Request) {
  const { requireRole } = await import("@/server/auth/rbac");
  try {
    await requireRole("ADMIN");
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para ver las notificaciones.", 403);
  }

  const url = new URL(req.url);
  const { leerFiltrosInspector } = await import("@/lib/filtros-inspector");
  const { filtros } = leerFiltrosInspector({
    usuario: url.searchParams.get("usuario"),
    tipo: url.searchParams.get("tipo"),
    desde: url.searchParams.get("desde"),
    hasta: url.searchParams.get("hasta"),
  });
  const cursor = url.searchParams.get("cursor");

  const { prisma } = await depsRuta();
  const { inspeccionarNotificaciones } = await import("@/server/services/anuncios");
  const pagina = await inspeccionarNotificaciones(prisma, filtros, {
    cursor: cursor && cursor.length <= 300 ? cursor : null,
  });
  return apiOk({ items: pagina.items, nextCursor: pagina.nextCursor });
}
