import { apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/** Logout: muta (revoca la sesion), asi que pasa por `mutatingRoute` (Origin + sesion
 *  + CSRF). Borra la fila de la sesion actual y limpia la cookie. */
export const POST = mutatingRoute(
  async (_req, { prisma }) => {
    const { revokeSession } = await import("@/server/auth/session");
    const { readSessionToken, clearSessionCookie } = await import("@/server/auth/current-user");

    const token = await readSessionToken();
    if (token) await revokeSession(prisma, token);
    await clearSessionCookie();
    return apiOk({ ok: true });
    // CUENTA DE EMPRESA: PERMITIDA. Salir no es participar, y una cuenta que no puede cerrar su
    // sesion es una cuenta atrapada — el peor fallo posible de un candado pensado para otra cosa.
  },
  { cuentaEmpresa: "permite" },
);
