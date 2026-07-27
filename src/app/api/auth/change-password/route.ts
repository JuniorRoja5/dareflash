import { z } from "zod";

import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * Cambio de contrasena. Pasa por `mutatingRoute` (Origin + sesion + CSRF). Verifica la
 * contrasena ACTUAL, cambia la nueva, revoca TODAS las sesiones y crea una nueva para
 * este dispositivo (cookie nueva en la misma respuesta): las del atacante mueren, el
 * usuario legitimo sigue dentro.
 */
export const POST = mutatingRoute(async (req, { user }) => {
  const { prisma } = await import("@/server/db/client");
  const { verifyPasswordConstantTime } = await import("@/server/auth/password");
  const { changePassword } = await import("@/server/auth/account");
  const { setSessionCookie } = await import("@/server/auth/current-user");

  const schema = z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
  });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Datos invalidos.", 400);

  const u = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { passwordHash: true },
  });
  const ok = await verifyPasswordConstantTime(u?.passwordHash ?? null, parsed.data.currentPassword);
  if (!ok) return apiError("INVALID_CREDENTIALS", "La contrasena actual no es correcta.", 403);

  const session = await changePassword(prisma, {
    userId: user.userId,
    newPassword: parsed.data.newPassword,
  });
  await setSessionCookie(session.rawToken, session.expires); // sesion nueva para este dispositivo
  return apiOk({ ok: true });
});
