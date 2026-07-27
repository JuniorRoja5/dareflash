import { apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/** Logout: muta (revoca la sesion), asi que pasa por `mutatingRoute` (Origin + sesion
 *  + CSRF). Borra la fila de la sesion actual y limpia la cookie. */
export const POST = mutatingRoute(async () => {
  const { prisma } = await import("@/server/db/client");
  const { revokeSession } = await import("@/server/auth/session");
  const { readSessionToken, clearSessionCookie } = await import("@/server/auth/current-user");

  const token = await readSessionToken();
  if (token) await revokeSession(prisma, token);
  await clearSessionCookie();
  return apiOk({ ok: true });
});
