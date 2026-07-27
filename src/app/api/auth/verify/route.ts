import { z } from "zod";

import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * Confirma la verificacion de email. Es el POST del BOTON de la pagina `/verify`,
 * no un GET: asi los escaneres de correo (que hacen prefetch del enlace) no consumen
 * el token de un solo uso antes de que el usuario haga clic.
 */
export async function POST(req: Request) {
  const { prisma } = await import("@/server/db/client");
  const { confirmEmailVerification } = await import("@/server/services/email-verification");

  const schema = z.object({ token: z.string().min(1) });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", "Falta el token.", 400);

  const result = await confirmEmailVerification(prisma, { rawToken: parsed.data.token });
  if (!result.verified) {
    return apiError("INVALID_TOKEN", "El enlace de verificacion es invalido o ha caducado.", 400);
  }
  return apiOk({ ok: true, message: "Cuenta verificada. Ya puedes iniciar sesion." });
}
